import type { SqlExecutor } from './db/types';
import type { OriginalFileStore } from '@/providers/storage/types';

/**
 * Ownership of stored files (local-first, ADR-0023). Every file in app storage belongs to exactly
 * one record: a document's original (`documents.storage_key`, vehicle-scoped, cascades with the
 * vehicle) or the owner's vehicle photo (settings `vehiclePhotos`, keyed by vehicle id). The
 * database holds only the key, type, size and hash; the bytes live in app storage.
 */

/** Settings key holding vehicleId → storage key of the owner's own vehicle photo. */
export const VEHICLE_PHOTOS_SETTING = 'vehiclePhotos';

/** Every stored file the database refers to. */
export async function referencedFileKeys(db: Pick<SqlExecutor, 'all' | 'first'>) {
  const docs = await db.all<{ storage_key: string }>('SELECT storage_key FROM documents');
  const photos = await db.first<{ value_json: string }>(
    'SELECT value_json FROM settings WHERE key = ?',
    [VEHICLE_PHOTOS_SETTING],
  );
  const photoKeys: unknown[] = photos ? Object.values(JSON.parse(photos.value_json) ?? {}) : [];
  return [
    ...new Set([
      ...docs.map((d) => d.storage_key),
      ...photoKeys.filter((k): k is string => typeof k === 'string'),
    ]),
  ];
}

/**
 * Removes stored files no record refers to (left behind by an interrupted import or deletion).
 * Runs only when the store opens, before any write, so an import in progress is never touched.
 * Returns the removed keys.
 */
export async function sweepOrphanFiles(
  db: Pick<SqlExecutor, 'all' | 'first'>,
  files: OriginalFileStore,
): Promise<string[]> {
  const referenced = new Set(await referencedFileKeys(db));
  const orphans = (await files.listKeys()).filter((k) => !referenced.has(k));
  for (const key of orphans) await files.remove(key).catch(() => undefined);
  return orphans;
}
