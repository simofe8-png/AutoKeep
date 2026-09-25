import type { SqlExecutor } from '@/persistence';
import { entityKey, SYNC_TABLES, toCloudRow, type Row, type SyncTable } from '@/sync/mapping';

/**
 * Snapshot of all device-local rows, mapped to the cloud schema (shared mapping in
 * src/sync/mapping.ts). Settings and sync bookkeeping are device-only and never uploaded.
 * Row IDs are preserved (client-generated UUIDs, ADR-0002).
 */
export const ADOPTION_TABLES = SYNC_TABLES;
export type AdoptionTable = SyncTable;

export type CloudRow = Row;
export type AdoptionBundle = Record<AdoptionTable, CloudRow[]>;

export async function buildAdoptionBundle(db: SqlExecutor): Promise<AdoptionBundle> {
  const bundle = {} as AdoptionBundle;
  for (const table of ADOPTION_TABLES) {
    const rows = await db.all<Row>(`SELECT * FROM ${table}`);
    bundle[table] = rows.map((r) => toCloudRow(table, r));
  }
  return bundle;
}

/** Row identity used for read-back verification (composite key for the link table). */
export const rowKey = entityKey;

export function bundleSize(b: AdoptionBundle): number {
  return ADOPTION_TABLES.reduce((n, t) => n + b[t].length, 0);
}
