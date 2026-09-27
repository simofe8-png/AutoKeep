/**
 * TEST-ONLY in-memory model of the server sync contract (supabase/migrations: sync_push, pull
 * keyset). Timestamps are explicit so tests can reproduce what a real database does under
 * concurrency: rows stamped with a transaction START time that commit later, and many rows
 * sharing one timestamp.
 */
import {
  compareCursor,
  SyncNetworkError,
  SyncRejectedError,
  type Cursor,
  type PushOp,
  type PushResult,
  type SyncTransport,
  type Tombstone,
} from '../engine';
import { APPEND_ONLY, entityKey, type Row, type SyncTable } from '../mapping';

const MUTABLE = new Set<SyncTable>(['profiles', 'vehicles', 'deferred_items', 'alerts']);

/** Postgres-like timestamptz text with microseconds. */
export function serverTs(ms: number, micros = 0): string {
  const iso = new Date(ms).toISOString(); // …T10:00:00.123Z
  return `${iso.slice(0, 23)}${String(micros).padStart(3, '0')}+00:00`;
}

export class MemoryServer {
  readonly rows = new Map<SyncTable, Map<string, Row>>();
  readonly tombstones: Tombstone[] = [];
  readonly appliedOps = new Set<string>();
  /** Current server time (ms); every write is stamped with it unless overridden. */
  clockMs = Date.parse('2026-09-27T10:00:00.000Z');
  offline = false;
  /** Returns a reason to refuse an op permanently (like a constraint or quota violation). */
  invalid: (op: PushOp) => string | null = () => null;
  /** Throw for a whole batch as the server would for a malformed request. */
  rejectBatch: (ops: PushOp[]) => boolean = () => false;
  pushCalls = 0;

  private table(t: SyncTable): Map<string, Row> {
    let m = this.rows.get(t);
    if (!m) this.rows.set(t, (m = new Map()));
    return m;
  }

  private stamp(): string {
    this.clockMs += 1;
    return serverTs(this.clockMs);
  }

  /** Writes a row exactly as given (tests use this to model late commits or equal stamps). */
  putRaw(t: SyncTable, row: Row): void {
    this.table(t).set(entityKey(t, row), row);
  }

  all(t: SyncTable): Row[] {
    return [...this.table(t).values()];
  }

  transport(): SyncTransport {
    return {
      push: async (ops) => this.push(ops),
      pull: async (t, cursor, limit) => this.page(this.all(t), t, cursor, limit),
      pullTombstones: async (cursor, limit) => {
        if (this.offline) throw new SyncNetworkError('offline');
        const sorted = [...this.tombstones].sort((a, b) =>
          compareCursor(
            { ts: a.server_updated_at, key: a.entity_id },
            { ts: b.server_updated_at, key: b.entity_id },
          ),
        );
        return sorted
          .filter((s) => after({ ts: s.server_updated_at, key: s.entity_id }, cursor))
          .slice(0, limit);
      },
    };
  }

  private page(rows: Row[], t: SyncTable, cursor: Cursor | null, limit: number): Row[] {
    if (this.offline) throw new SyncNetworkError('offline');
    const pos = (r: Row): Cursor => ({ ts: String(r.server_updated_at), key: entityKey(t, r) });
    return rows
      .slice()
      .sort((a, b) => compareCursor(pos(a), pos(b)))
      .filter((r) => after(pos(r), cursor))
      .slice(0, limit);
  }

  private push(ops: PushOp[]): PushResult[] {
    this.pushCalls++;
    if (this.offline) throw new SyncNetworkError('offline');
    if (this.rejectBatch(ops)) {
      // Mirrors a 4xx for the whole request.
      throw new SyncRejectedError('bad request');
    }
    return ops.map((op) => {
      if (this.appliedOps.has(op.op_id)) return { op_id: op.op_id, status: 'duplicate' };
      const reason = this.invalid(op);
      if (reason) return { op_id: op.op_id, status: 'invalid', code: '23514', message: reason };
      if (op.op === 'delete') {
        const had = this.table('vehicles').delete(op.entity_id);
        if (!had) return { op_id: op.op_id, status: 'rejected' };
        // Mirrors the FK cascade: every vehicle-scoped row goes with it.
        const events = new Set(
          this.all('service_events')
            .filter((e) => e.vehicle_id === op.entity_id)
            .map((e) => String(e.id)),
        );
        for (const [t, rows] of this.rows) {
          for (const [k, r] of rows) {
            if (
              r.vehicle_id === op.entity_id ||
              (t === 'service_event_documents' && events.has(String(r.service_event_id)))
            ) {
              rows.delete(k);
            }
          }
        }
        this.tombstones.push({
          entity_table: 'vehicles',
          entity_id: op.entity_id,
          server_updated_at: this.stamp(),
        });
        this.appliedOps.add(op.op_id);
        return { op_id: op.op_id, status: 'applied' };
      }
      const t = op.table;
      const row = op.row!;
      const key = entityKey(t, row);
      const existing = this.table(t).get(key);
      if (!existing) {
        this.table(t).set(key, { ...row, server_updated_at: this.stamp() });
        this.appliedOps.add(op.op_id);
        return {
          op_id: op.op_id,
          status: 'applied',
          version: MUTABLE.has(t) ? Number(row.version) : null,
        };
      }
      if (APPEND_ONLY.has(t)) {
        this.appliedOps.add(op.op_id);
        return { op_id: op.op_id, status: 'duplicate' };
      }
      if (Number(existing.version) !== op.base_version) {
        return { op_id: op.op_id, status: 'conflict', server_row: existing };
      }
      const version = Number(existing.version) + 1; // server-authoritative
      this.table(t).set(key, {
        ...row,
        version,
        created_at: existing.created_at,
        server_updated_at: this.stamp(),
      });
      this.appliedOps.add(op.op_id);
      return { op_id: op.op_id, status: 'applied', version };
    });
  }
}

/** Same predicate as the PostgREST filter in supabaseTransport.afterCursor. */
function after(p: Cursor, cursor: Cursor | null): boolean {
  if (!cursor) return true;
  if (cursor.key === null) {
    return compareCursor({ ts: p.ts, key: null }, { ts: cursor.ts, key: null }) >= 0;
  }
  return compareCursor(p, cursor) > 0;
}
