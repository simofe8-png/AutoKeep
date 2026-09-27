import type { Timestamp } from '@/domain';
import type { SqlDatabase, SqlExecutor } from '@/persistence';

import {
  APPEND_ONLY,
  entityKey,
  SYNC_TABLES,
  toCloudRow,
  toLocalRow,
  type Row,
  type SyncTable,
} from './mapping';
import { mergeRows, type FieldConflict } from './merge';

/**
 * Sync protocol (T072–T075, ADR-0011).
 *
 *   push: outbox ops (enqueued by SQLite triggers in the same transaction as each change) are sent
 *         in order with their base_version. The server applies each op idempotently (op_id) with
 *         compare-and-set; conflicts come back with the server row and are merged locally.
 *   pull: per-table keyset cursor on server_updated_at; remote rows are applied with triggers
 *         suppressed; rows with a pending local change are merged, never overwritten.
 */

// ---------- transport port ----------

export interface PushOp {
  op_id: string;
  table: SyncTable;
  op: 'upsert' | 'delete';
  entity_id: string;
  base_version: number;
  row?: Row;
}

/**
 * 'invalid' = the server permanently refuses this op (constraint, quota, ownership). It is parked
 * locally and reported; it never blocks the rest of the queue (P2A, Y3).
 */
export type PushStatus = 'applied' | 'duplicate' | 'conflict' | 'rejected' | 'invalid';
export interface PushResult {
  op_id: string;
  status: PushStatus;
  server_row?: Row;
  /** Server-decided version after an applied upsert of a mutable entity. */
  version?: number | null;
  code?: string;
  message?: string;
}

/**
 * Keyset position: rows strictly after (ts, key) are returned. `key: null` means "from ts on,
 * inclusive" (used for the overlap re-read at the start of a round).
 */
export interface Cursor {
  ts: string;
  key: string | null;
}

export interface Tombstone {
  entity_table: string;
  entity_id: string;
  server_updated_at: string;
}

export interface SyncTransport {
  push(ops: PushOp[]): Promise<PushResult[]>;
  /** Rows changed after the cursor, ordered by (server_updated_at, key). */
  pull(table: SyncTable, cursor: Cursor | null, limit: number): Promise<Row[]>;
  pullTombstones(cursor: Cursor | null, limit: number): Promise<Tombstone[]>;
}

/** Transient: network, timeout, 5xx, auth refresh, rate limit. Retried with backoff. */
export class SyncNetworkError extends Error {}
/** Permanent for the whole request (e.g. malformed batch). Ops are then retried one by one. */
export class SyncRejectedError extends Error {}

/**
 * Rows are stamped with the server transaction's START time, so a row committed late by a long
 * transaction can carry a timestamp below a cursor another device already passed. Every round
 * therefore re-reads the last PULL_OVERLAP_MS before its cursor (applying is idempotent and
 * version-guarded). Must exceed the longest server transaction (statement_timeout: 8 s for the
 * authenticated role on Supabase).
 */
export const PULL_OVERLAP_MS = 5 * 60_000;

// ---------- retry policy (T075) ----------

export const BASE_DELAY_MS = 5_000;
export const MAX_DELAY_MS = 15 * 60_000;

/** Exponential backoff with full jitter; `random` injectable for deterministic tests. */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(ceiling / 2 + (random() * ceiling) / 2);
}

// ---------- local helpers ----------

const PK: Record<SyncTable, string[]> = Object.fromEntries(
  SYNC_TABLES.map((t) => [
    t,
    t === 'service_event_documents' ? ['service_event_id', 'document_id'] : ['id'],
  ]),
) as Record<SyncTable, string[]>;

function keyWhere(table: SyncTable, key: string): { sql: string; params: string[] } {
  if (table === 'service_event_documents') {
    const [s, d] = key.split('|');
    return { sql: 'service_event_id = ? AND document_id = ?', params: [s, d] };
  }
  return { sql: 'id = ?', params: [key] };
}

async function localRow(tx: SqlExecutor, table: SyncTable, key: string): Promise<Row | null> {
  const w = keyWhere(table, key);
  return tx.first<Row>(`SELECT * FROM ${table} WHERE ${w.sql}`, w.params);
}

async function writeLocal(tx: SqlExecutor, table: SyncTable, row: Row): Promise<void> {
  const cols = Object.keys(row);
  const pk = PK[table];
  const updates = cols.filter((c) => !pk.includes(c)).map((c) => `${c} = excluded.${c}`);
  await tx.run(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})
     ON CONFLICT (${pk.join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`,
    cols.map((c) => row[c] as string | number | null),
  );
}

async function withTriggersSuppressed<T>(
  db: SqlDatabase,
  fn: (tx: SqlExecutor) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.run('UPDATE sync_control SET applying = 1 WHERE id = 1');
    try {
      return await fn(tx);
    } finally {
      await tx.run('UPDATE sync_control SET applying = 0 WHERE id = 1');
    }
  });
}

async function readShadow(tx: SqlExecutor, table: SyncTable, key: string): Promise<Row | null> {
  const r = await tx.first<{ row_json: string }>(
    'SELECT row_json FROM sync_shadow WHERE entity_table = ? AND entity_id = ?',
    [table, key],
  );
  return r ? (JSON.parse(r.row_json) as Row) : null;
}

export async function writeShadow(tx: SqlExecutor, table: SyncTable, row: Row): Promise<void> {
  if (APPEND_ONLY.has(table)) return;
  await tx.run(
    `INSERT INTO sync_shadow (entity_table, entity_id, row_json) VALUES (?, ?, ?)
     ON CONFLICT (entity_table, entity_id) DO UPDATE SET row_json = excluded.row_json`,
    [table, entityKey(table, row), JSON.stringify(row)],
  );
}

async function recordConflicts(
  tx: SqlExecutor,
  table: SyncTable,
  key: string,
  conflicts: FieldConflict[],
  now: Timestamp,
): Promise<void> {
  for (const c of conflicts) {
    await tx.run(
      `INSERT INTO sync_conflicts (entity_table, entity_id, field, local_value, remote_value, kept, detected_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        table,
        key,
        c.field,
        JSON.stringify(c.localValue ?? null),
        JSON.stringify(c.remoteValue ?? null),
        c.kept,
        now,
      ],
    );
  }
}

/** Applies a server row on top of a pending local change (3-way merge), keeping the op queued. */
async function mergeIntoPending(
  tx: SqlExecutor,
  table: SyncTable,
  key: string,
  local: Row,
  remote: Row,
  now: Timestamp,
): Promise<number> {
  const base = await readShadow(tx, table, key);
  const merged = mergeRows(table, base, local, remote);
  await writeLocal(tx, table, merged.row);
  await tx.run('UPDATE sync_outbox SET base_version = ? WHERE entity_table = ? AND entity_id = ?', [
    Number(remote.version ?? 0),
    table,
    key,
  ]);
  await writeShadow(tx, table, remote);
  await recordConflicts(tx, table, key, merged.conflicts, now);
  return merged.conflicts.length;
}

// ---------- push ----------

interface OutboxRow {
  seq: number;
  op_id: string;
  entity_table: SyncTable;
  entity_id: string;
  op: 'upsert' | 'delete';
  base_version: number;
  attempts: number;
}

export interface PushSummary {
  sent: number;
  applied: number;
  conflicts: number;
  fieldConflicts: number;
  /** Ops the server permanently refused in this round (parked). */
  invalid: number;
}

async function parkOp(db: SqlDatabase, o: OutboxRow, code: string, message: string) {
  await db.run(
    `UPDATE sync_outbox SET parked = 1, parked_code = ?, last_error = ?
     WHERE seq = ? AND op_id = ?`,
    [code, message.slice(0, 200), o.seq, o.op_id],
  );
}

async function sendOps(transport: SyncTransport, payload: PushOp[]): Promise<PushResult[]> {
  try {
    return await transport.push(payload);
  } catch (e) {
    if (e instanceof SyncRejectedError || e instanceof SyncNetworkError) throw e;
    throw new SyncNetworkError(String(e));
  }
}

async function failBatch(db: SqlDatabase, batch: OutboxRow[], e: unknown): Promise<Error> {
  await db.run(
    `UPDATE sync_outbox SET attempts = attempts + 1, last_error = ?
     WHERE seq IN (${batch.map(() => '?').join(',')})`,
    [String(e instanceof Error ? e.message : e).slice(0, 200), ...batch.map((o) => o.seq)],
  );
  return e instanceof SyncNetworkError ? e : new SyncNetworkError(String(e));
}

export async function pushPending(
  db: SqlDatabase,
  transport: SyncTransport,
  now: () => Timestamp,
  batchSize = 50,
): Promise<PushSummary> {
  const summary: PushSummary = { sent: 0, applied: 0, conflicts: 0, fieldConflicts: 0, invalid: 0 };
  const attempted = new Set<number>();
  for (;;) {
    const ops = (
      await db.all<OutboxRow>('SELECT * FROM sync_outbox WHERE parked = 0 ORDER BY seq')
    ).filter((o) => !attempted.has(o.seq));
    if (ops.length === 0) return summary;
    const batch = ops.slice(0, batchSize);
    batch.forEach((o) => attempted.add(o.seq));

    const payload: PushOp[] = [];
    for (const o of batch) {
      if (o.op === 'delete') {
        payload.push({
          op_id: o.op_id,
          table: o.entity_table,
          op: 'delete',
          entity_id: o.entity_id,
          base_version: o.base_version,
        });
        continue;
      }
      const row = await localRow(db, o.entity_table, o.entity_id);
      if (!row) {
        await db.run('DELETE FROM sync_outbox WHERE seq = ? AND op_id = ?', [o.seq, o.op_id]);
        continue;
      }
      payload.push({
        op_id: o.op_id,
        table: o.entity_table,
        op: 'upsert',
        entity_id: o.entity_id,
        base_version: o.base_version,
        row: toCloudRow(o.entity_table, row),
      });
    }
    if (payload.length === 0) continue;

    let results: PushResult[];
    try {
      results = await sendOps(transport, payload);
    } catch (e) {
      if (!(e instanceof SyncRejectedError)) throw await failBatch(db, batch, e);
      // The request as a whole was refused: isolate the poison op(s) one by one.
      results = [];
      for (const p of payload) {
        try {
          results.push(...(await sendOps(transport, [p])));
        } catch (single) {
          if (!(single instanceof SyncRejectedError)) throw await failBatch(db, batch, single);
          results.push({
            op_id: p.op_id,
            status: 'invalid',
            code: 'rejected',
            message: single.message,
          });
        }
      }
    }
    summary.sent += payload.length;

    const byOpId = new Map(batch.map((o) => [o.op_id, o]));
    for (const r of results) {
      const o = byOpId.get(r.op_id);
      if (!o) continue;
      const sent = payload.find((p) => p.op_id === r.op_id)!;
      if (r.status === 'applied' || r.status === 'duplicate') {
        await withTriggersSuppressed(db, async (tx) => {
          // Only acknowledge if no newer local change re-keyed the op meanwhile.
          const ack = await tx.run('DELETE FROM sync_outbox WHERE seq = ? AND op_id = ?', [
            o.seq,
            o.op_id,
          ]);
          if (!sent.row) return;
          const shadow = toLocalRow(o.entity_table, sent.row);
          // The server decides versions: adopt its value (only if nothing newer is pending).
          if (ack.changes === 1 && typeof r.version === 'number' && 'version' in shadow) {
            shadow.version = r.version;
            const w = keyWhere(o.entity_table, o.entity_id);
            await tx.run(`UPDATE ${o.entity_table} SET version = ? WHERE ${w.sql}`, [
              r.version,
              ...w.params,
            ]);
          }
          await writeShadow(tx, o.entity_table, shadow);
        });
        summary.applied++;
      } else if (r.status === 'conflict' && r.server_row) {
        summary.conflicts++;
        summary.fieldConflicts += await withTriggersSuppressed(db, async (tx) => {
          const local = await localRow(tx, o.entity_table, o.entity_id);
          const remote = toLocalRow(o.entity_table, r.server_row!);
          if (!local) return 0;
          return mergeIntoPending(tx, o.entity_table, o.entity_id, local, remote, now());
        });
        attempted.delete(o.seq); // retry the merged row in a following batch
      } else if (r.status === 'invalid') {
        // Permanent: park it (the user is told), keep the local data, never block the queue.
        await parkOp(db, o, r.code ?? 'invalid', r.message ?? 'invalid');
        summary.invalid++;
      } else {
        // Rejected (e.g. the entity was deleted on another device): the pull reconciles it.
        await db.run('DELETE FROM sync_outbox WHERE seq = ? AND op_id = ?', [o.seq, o.op_id]);
      }
    }
  }
}

// ---------- pull ----------

export interface PullSummary {
  rows: number;
  merged: number;
  fieldConflicts: number;
  tombstones: number;
  /** Storage keys of local originals whose vehicle was deleted on another device. */
  removedOriginals: string[];
}

const cursorKey = (name: string) => `syncCursor:${name}`;

async function getCursor(db: SqlExecutor, name: string): Promise<Cursor | null> {
  const r = await db.first<{ value_json: string }>(
    'SELECT value_json FROM settings WHERE key = ?',
    [cursorKey(name)],
  );
  return r ? (JSON.parse(r.value_json) as Cursor) : null;
}

async function setCursor(db: SqlExecutor, name: string, c: Cursor, now: Timestamp) {
  await db.run(
    `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    [cursorKey(name), JSON.stringify(c), now],
  );
}

async function parentPresent(tx: SqlExecutor, table: SyncTable, row: Row): Promise<boolean> {
  if (table === 'service_event_documents') {
    const e = await tx.first('SELECT 1 AS x FROM service_events WHERE id = ?', [
      String(row.service_event_id),
    ]);
    return e !== null;
  }
  if (table === 'vehicles' || table === 'profiles' || !row.vehicle_id) return true;
  const v = await tx.first('SELECT 1 AS x FROM vehicles WHERE id = ?', [String(row.vehicle_id)]);
  return v !== null;
}

/**
 * Microseconds since the epoch of a server timestamp ("…T10:00:00.123456+00:00" or "…Z").
 * Exact to the microsecond (Postgres precision), independent of the textual format.
 */
export function tsMicros(ts: string): number {
  const m = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})$/.exec(ts);
  if (!m) return Date.parse(ts) * 1000;
  const whole = Date.parse(`${m[1]}${m[3]}`);
  return whole * 1000 + Number((m[2] ?? '').padEnd(6, '0').slice(0, 6));
}

/** Total order of keyset positions: time (µs), then the key. */
export function compareCursor(a: Cursor, b: Cursor): number {
  const d = tsMicros(a.ts) - tsMicros(b.ts);
  if (d !== 0) return d;
  const ka = a.key ?? '';
  const kb = b.key ?? '';
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/** Start of a round: PULL_OVERLAP_MS before the stored cursor, inclusive. */
export function rewind(c: Cursor | null, overlapMs = PULL_OVERLAP_MS): Cursor | null {
  if (!c) return null;
  return { ts: new Date(Math.floor(tsMicros(c.ts) / 1000) - overlapMs).toISOString(), key: null };
}

async function pagesOf<T>(
  db: SqlDatabase,
  name: string,
  fetchPage: (after: Cursor | null) => Promise<T[]>,
  positionOf: (item: T) => Cursor,
  apply: (tx: SqlExecutor, page: T[]) => Promise<void>,
  pageSize: number,
  now: () => Timestamp,
  overlapMs: number,
): Promise<void> {
  const stored = await getCursor(db, name);
  let position = rewind(stored, overlapMs);
  let high = stored;
  for (;;) {
    let page: T[];
    try {
      page = await fetchPage(position);
    } catch (e) {
      throw e instanceof SyncNetworkError ? e : new SyncNetworkError(String(e));
    }
    if (page.length === 0) return;
    const last = positionOf(page[page.length - 1]);
    // A stable keyset always moves strictly forward; anything else would loop forever.
    if (position && compareCursor(last, position) <= 0) {
      throw new SyncNetworkError(`pull of ${name} did not advance`);
    }
    position = last;
    if (!high || compareCursor(last, high) > 0) high = last;
    const next = high;
    await withTriggersSuppressed(db, async (tx) => {
      await apply(tx, page);
      await setCursor(tx, name, next, now());
    });
    if (page.length < pageSize) return;
  }
}

export async function pullChanges(
  db: SqlDatabase,
  transport: SyncTransport,
  now: () => Timestamp,
  pageSize = 500,
  overlapMs = PULL_OVERLAP_MS,
): Promise<PullSummary> {
  const summary: PullSummary = {
    rows: 0,
    merged: 0,
    fieldConflicts: 0,
    tombstones: 0,
    removedOriginals: [],
  };

  for (const table of SYNC_TABLES) {
    await pagesOf<Row>(
      db,
      table,
      (after) => transport.pull(table, after, pageSize),
      (row) => ({ ts: String(row.server_updated_at), key: entityKey(table, row) }),
      async (tx, page) => {
        for (const cloud of page) {
          const remote = toLocalRow(table, cloud);
          const key = entityKey(table, remote);
          const pending = await tx.first<{ op: string }>(
            'SELECT op FROM sync_outbox WHERE entity_table = ? AND entity_id = ?',
            [table, key],
          );
          const local = await localRow(tx, table, key);
          if (pending?.op === 'delete') continue; // local deletion wins; it will be pushed
          // A child whose vehicle (or service event) is gone locally cannot be applied: its
          // parent was deleted here (the deletion is being pushed) or on the server (tombstone).
          if (!local && !(await parentPresent(tx, table, remote))) continue;
          if (pending && local) {
            summary.merged++;
            summary.fieldConflicts += await mergeIntoPending(tx, table, key, local, remote, now());
          } else if (
            !local ||
            APPEND_ONLY.has(table) ||
            Number(remote.version ?? 0) >= Number(local.version ?? 0)
          ) {
            await writeLocal(tx, table, remote);
            await writeShadow(tx, table, remote);
          }
          summary.rows++;
        }
      },
      pageSize,
      now,
      overlapMs,
    );
  }

  await pagesOf<Tombstone>(
    db,
    'tombstones',
    (after) => transport.pullTombstones(after, pageSize),
    (t) => ({ ts: t.server_updated_at, key: t.entity_id }),
    async (tx, stones) => {
      for (const s of stones) {
        if (s.entity_table !== 'vehicles') continue;
        const docs = await tx.all<{ storage_key: string }>(
          'SELECT storage_key FROM documents WHERE vehicle_id = ?',
          [s.entity_id],
        );
        await tx.run(
          'DELETE FROM sync_outbox WHERE vehicle_id = ? OR (entity_table = ? AND entity_id = ?)',
          [s.entity_id, 'vehicles', s.entity_id],
        );
        const r = await tx.run('DELETE FROM vehicles WHERE id = ?', [s.entity_id]);
        if (r.changes > 0) summary.removedOriginals.push(...docs.map((d) => d.storage_key));
        summary.tombstones += r.changes;
      }
    },
    pageSize,
    now,
    overlapMs,
  );
  return summary;
}

// ---------- orchestration ----------

export type SyncOutcome =
  | { ok: true; push: PushSummary; pull: PullSummary }
  | { ok: false; reason: 'not_adopted' | 'network'; retryInMs?: number; message?: string };

/** One sync round: push local changes, then pull remote ones. Only for adopted (account) data. */
export async function syncOnce(
  db: SqlDatabase,
  transport: SyncTransport,
  now: () => Timestamp,
): Promise<SyncOutcome> {
  const state = await db.first<{ value_json: string }>(
    "SELECT value_json FROM settings WHERE key = 'accountAdoption'",
  );
  if (!state || JSON.parse(state.value_json).status !== 'adopted')
    return { ok: false, reason: 'not_adopted' };
  try {
    const push = await pushPending(db, transport, now);
    const pull = await pullChanges(db, transport, now);
    return { ok: true, push, pull };
  } catch (e) {
    if (!(e instanceof SyncNetworkError)) throw e;
    const maxAttempts = await db.first<{ a: number | null }>(
      'SELECT MAX(attempts) AS a FROM sync_outbox WHERE parked = 0',
    );
    return {
      ok: false,
      reason: 'network',
      retryInMs: backoffDelay(maxAttempts?.a ?? 1),
      message: e.message,
    };
  }
}

/** Number of local changes still waiting to be accepted by the server (backup status UI). */
export async function pendingCount(db: SqlExecutor): Promise<number> {
  return (
    (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox WHERE parked = 0'))?.n ??
    0
  );
}

/** Local changes the server permanently refused (kept on the device, reported to the user). */
export async function parkedCount(db: SqlExecutor): Promise<number> {
  return (
    (await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM sync_outbox WHERE parked = 1'))?.n ??
    0
  );
}
