import { APPEND_ONLY, type Row, type SyncTable } from './mapping';

/**
 * Entity-aware conflict resolution (T076, spec §24) — NOT a blanket last-write-wins.
 *
 *  - Append-only records (service events, readings, documents, …): immutable. Different records
 *    from two devices are both kept; the same id is the same record.
 *  - Alerts: status is monotonic — handled > deferred > active (a handled alert never reopens).
 *  - Deferred items: resolution is sticky.
 *  - Vehicles / profiles: 3-way field merge against the last server-accepted state (`base`):
 *    a field changed on one side only takes that side's value; a field changed on both sides to
 *    different values is a genuine conflict → the later edit wins AND it is recorded for review.
 *
 * Merges are deterministic and never delete data.
 */

export interface FieldConflict {
  field: string;
  localValue: unknown;
  remoteValue: unknown;
  kept: 'local' | 'remote';
}

export interface MergeResult {
  row: Row;
  conflicts: FieldConflict[];
}

const ALERT_RANK: Record<string, number> = { active: 0, deferred: 1, handled: 2 };

export const VEHICLE_IDENTITY_FIELDS = [
  'type',
  'manufacturer',
  'model',
  'year',
  'trim',
  'model_code',
  'engine',
  'fuel',
  'transmission',
  'registration',
  'vin',
] as const;

/** Bookkeeping columns that are never merged field-by-field. */
const META = new Set(['id', 'created_at', 'updated_at', 'version']);

const norm = (v: unknown) => (v === undefined ? null : v);
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const localIsLater = (l: Row, r: Row) => String(l.updated_at ?? '') >= String(r.updated_at ?? '');
const nextVersion = (l: Row, r: Row) =>
  Math.max(Number(l.version ?? 0), Number(r.version ?? 0)) + 1;
const latestUpdatedAt = (l: Row, r: Row) => (localIsLater(l, r) ? l.updated_at : r.updated_at);

/** Generic 3-way merge of plain columns. `groups` are merged as a unit (e.g. lifecycle+archived_at). */
function threeWay(base: Row | null, local: Row, remote: Row, groups: string[][] = []): MergeResult {
  const grouped = new Set(groups.flat());
  const fields = [...new Set([...Object.keys(local), ...Object.keys(remote)])].filter(
    (f) => !META.has(f) && !grouped.has(f),
  );
  const row: Row = { ...remote };
  const conflicts: FieldConflict[] = [];
  const localWins = localIsLater(local, remote);

  const decide = (keys: string[]) => {
    const l = keys.map((k) => local[k]);
    const r = keys.map((k) => remote[k]);
    if (same(l, r)) return;
    const b = base ? keys.map((k) => base[k]) : null;
    const localChanged = b ? !same(l, b) : true;
    const remoteChanged = b ? !same(r, b) : true;
    let take: 'local' | 'remote';
    if (localChanged && !remoteChanged) take = 'local';
    else if (!localChanged && remoteChanged) take = 'remote';
    else {
      take = localWins ? 'local' : 'remote';
      conflicts.push({
        field: keys.join('+'),
        localValue: keys.length === 1 ? l[0] : l,
        remoteValue: keys.length === 1 ? r[0] : r,
        kept: take,
      });
    }
    if (take === 'local') for (const k of keys) row[k] = local[k];
  };

  for (const f of fields) decide([f]);
  for (const g of groups) decide(g);
  row.updated_at = latestUpdatedAt(local, remote);
  row.version = nextVersion(local, remote);
  return { row, conflicts };
}

/**
 * Merges a locally modified (pending) row with the current server row, given the last
 * server-accepted state `base` (null if unknown). The result is written locally and pushed with
 * base_version = remote.version.
 */
export function mergeRows(
  table: SyncTable,
  base: Row | null,
  local: Row,
  remote: Row,
): MergeResult {
  if (APPEND_ONLY.has(table)) return { row: { ...remote }, conflicts: [] };

  switch (table) {
    case 'alerts': {
      const rank = (s: unknown) => ALERT_RANK[String(s)] ?? 0;
      const status = rank(local.status) >= rank(remote.status) ? local.status : remote.status;
      const snoozes = [local.snoozed_until, remote.snoozed_until]
        .filter(Boolean)
        .map(String)
        .sort();
      return {
        row: {
          ...remote,
          status,
          snoozed_until: status === 'deferred' ? (snoozes.at(-1) ?? null) : null,
          updated_at: latestUpdatedAt(local, remote),
          version: nextVersion(local, remote),
        },
        conflicts: [],
      };
    }
    case 'deferred_items': {
      const merged = threeWay(base, local, remote);
      merged.row.resolved_by_service_event_id =
        remote.resolved_by_service_event_id ?? local.resolved_by_service_event_id ?? null;
      merged.conflicts = merged.conflicts.filter((c) => c.field !== 'resolved_by_service_event_id');
      return merged;
    }
    case 'vehicles': {
      // Lifecycle state and its timestamp move together; archive never deletes data either way.
      return threeWay(base, local, remote, [['lifecycle', 'archived_at']]);
    }
    case 'profiles':
      return threeWay(base, local, remote);
  }
  return { row: { ...remote }, conflicts: [] };
}
