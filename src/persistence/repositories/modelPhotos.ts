import type { ModelPhotoRecord } from '@/providers/referenceImages/wikimedia';

import { fromJson, toJson, type Executor } from './base';

/**
 * Local cache of general model photos (migration v13, LOCAL ONLY). Keyed by MODEL class
 * ("wm1/toyota/corolla"), so every vehicle of the model reuses one lookup; no vehicle, plate or
 * VIN column. A "none" row remembers that nothing suitable was found (not retried every time).
 */
export interface CachedModelPhoto {
  status: 'found' | 'none';
  record: ModelPhotoRecord | null;
  /** The downloaded thumbnail in app storage (works offline). */
  localUri: string | null;
  checkedAt: string;
}

export class ModelPhotoCacheRepository {
  constructor(private readonly db: Executor) {}

  async get(classKey: string): Promise<CachedModelPhoto | null> {
    const row = await this.db.first<{
      status: 'found' | 'none';
      record_json: string | null;
      local_uri: string | null;
      checked_at: string;
    }>(
      'SELECT status, record_json, local_uri, checked_at FROM model_photo_cache WHERE class_key = ?',
      [classKey],
    );
    if (!row) return null;
    return {
      status: row.status,
      record: row.record_json ? fromJson<ModelPhotoRecord>(row.record_json) : null,
      localUri: row.local_uri,
      checkedAt: row.checked_at,
    };
  }

  async put(classKey: string, value: CachedModelPhoto): Promise<void> {
    await this.db.run(
      `INSERT INTO model_photo_cache (class_key, status, record_json, local_uri, checked_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(class_key) DO UPDATE SET status = excluded.status,
         record_json = excluded.record_json, local_uri = excluded.local_uri,
         checked_at = excluded.checked_at`,
      [
        classKey,
        value.status,
        value.record ? toJson(value.record) : null,
        value.localUri,
        value.checkedAt,
      ],
    );
  }
}
