import { MAX_SOURCE_BYTES, type FetchedFile, type Retriever } from '@/discovery/retrieval';
import type { OriginalFileStore } from '@/providers/storage/types';

/**
 * Retrieval network adapter (T083 port): HTTPS download into app-private storage with a content
 * hash. The pipeline re-checks the final (post-redirect) host against the verified registry, the
 * type (PDF only) and the size — this adapter only refuses obviously oversized bodies early.
 */
export function httpRetriever(
  files: OriginalFileStore,
  fetchImpl: typeof fetch = fetch,
): Retriever {
  return {
    async fetch(url: string): Promise<FetchedFile> {
      if (!url.startsWith('https://')) throw new Error('https only');
      const r = await fetchImpl(url, { redirect: 'follow' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const declared = Number(r.headers.get('content-length') ?? '0');
      if (declared > MAX_SOURCE_BYTES) throw new Error('too large');
      const bytes = new Uint8Array(await r.arrayBuffer());
      const mimeType = (r.headers.get('content-type') ?? '').split(';')[0].trim();
      const stored = await files.importBytes(bytes, mimeType || 'application/octet-stream');
      return {
        finalUrl: r.url || url,
        mimeType,
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
      };
    },
  };
}
