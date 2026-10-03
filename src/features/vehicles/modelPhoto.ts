import type { CachedModelPhoto } from '@/persistence/repositories/modelPhotos';
import {
  lookupModelPhoto,
  modelPhotoQuery,
  type ModelPhotoRecord,
} from '@/providers/referenceImages/wikimedia';

/**
 * General model photo resolution (owner decision 2026-10-03): local cache first (works offline,
 * never refetched on every view), then the license-checked Wikimedia lookup, then the downloaded
 * thumbnail is kept in app storage. A remembered "none" is retried only after NONE_RETRY_DAYS.
 */
export type ModelPhotoResolution =
  | { kind: 'model_photo'; uri: string; record: ModelPhotoRecord }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

export interface ModelPhotoDeps {
  cache: {
    get(classKey: string): Promise<CachedModelPhoto | null>;
    put(classKey: string, value: CachedModelPhoto): Promise<void>;
  };
  getJson: (url: string) => Promise<unknown>;
  /** Downloads the thumbnail into app storage; the local URI, or null on failure. */
  download: (url: string) => Promise<string | null>;
  /** The cached file still exists. */
  exists: (uri: string) => Promise<boolean>;
  now: () => string;
  /**
   * Diagnostics (development builds only): each step with the make / model it used and why it
   * ended. Never the plate, VIN or any owner data — the resolver never receives them.
   */
  log?: (step: string, detail: Record<string, unknown>) => void;
}

export const NONE_RETRY_DAYS = 30;

const ageDays = (from: string, now: string) =>
  (Date.parse(now) - Date.parse(from)) / (24 * 60 * 60 * 1000);

export async function resolveModelPhoto(
  vehicle: { manufacturer: string; model: string },
  deps: ModelPhotoDeps,
): Promise<ModelPhotoResolution> {
  const log = deps.log ?? (() => undefined);
  const q = modelPhotoQuery(vehicle.manufacturer, vehicle.model);
  log('query', {
    manufacturer: vehicle.manufacturer,
    model: vehicle.model,
    resolved: q ? `${q.make} ${q.model}` : null,
  });
  if (!q) {
    log('result', { kind: 'not_found', reason: 'make or model not recognized' });
    return { kind: 'not_found' };
  }
  const cached = await deps.cache.get(q.classKey).catch(() => null);
  const now = deps.now();
  log('cache', { classKey: q.classKey, status: cached?.status ?? 'miss' });
  if (cached?.status === 'found' && cached.record && cached.localUri) {
    if (await deps.exists(cached.localUri).catch(() => false)) {
      log('result', { kind: 'model_photo', from: 'cache' });
      return { kind: 'model_photo', uri: cached.localUri, record: cached.record };
    }
  }
  if (cached?.status === 'none' && ageDays(cached.checkedAt, now) < NONE_RETRY_DAYS) {
    log('result', { kind: 'not_found', reason: `remembered none since ${cached.checkedAt}` });
    return { kind: 'not_found' };
  }
  // A known record whose file was lost: download it again without a new lookup.
  if (cached?.status === 'found' && cached.record) {
    const uri = await deps.download(cached.record.imageUrl).catch(() => null);
    if (uri) {
      await deps.cache.put(q.classKey, { ...cached, localUri: uri }).catch(() => undefined);
      log('result', { kind: 'model_photo', from: 're-download' });
      return { kind: 'model_photo', uri, record: cached.record };
    }
    log('result', { kind: 'unavailable', reason: 're-download failed' });
    return { kind: 'unavailable' };
  }
  const found = await lookupModelPhoto(q, deps.getJson, deps.now);
  log('lookup', {
    status: found.status,
    ...(found.status === 'found'
      ? { article: found.record.articleTitle, license: found.record.license }
      : { reason: found.reason }),
  });
  if (found.status === 'unavailable') return { kind: 'unavailable' };
  if (found.status === 'none') {
    await deps.cache
      .put(q.classKey, { status: 'none', record: null, localUri: null, checkedAt: now })
      .catch(() => undefined);
    return { kind: 'not_found' };
  }
  const uri = await deps.download(found.record.imageUrl).catch(() => null);
  log('download', { ok: Boolean(uri) });
  if (!uri) return { kind: 'unavailable' };
  await deps.cache
    .put(q.classKey, { status: 'found', record: found.record, localUri: uri, checkedAt: now })
    .catch(() => undefined);
  return { kind: 'model_photo', uri, record: found.record };
}
