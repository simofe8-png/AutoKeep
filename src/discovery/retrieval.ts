/**
 * Document retrieval & versioning (T083). Retrieved files are untrusted input:
 *  - HTTPS only; the FINAL url after redirects must still be on an official domain;
 *  - PDF only, bounded size, content hash recorded;
 *  - a changed file at the same URL is a NEW version — earlier versions are never overwritten,
 *    so evidence keeps pointing at the exact bytes it was taken from.
 */

export interface FetchedFile {
  finalUrl: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  /** Opaque local storage key for the downloaded original (app-private). */
  storageKey: string;
}

/** Network port (implemented with expo-file-system download + hash; mocked in tests). */
export interface Retriever {
  fetch(url: string): Promise<FetchedFile>;
}

export const MAX_SOURCE_BYTES = 50 * 1024 * 1024;

export type RetrievalOutcome =
  | { ok: true; file: FetchedFile }
  | {
      ok: false;
      reason:
        'network' | 'not_pdf' | 'too_large' | 'empty' | 'redirected_off_official' | 'bad_hash';
    };

export async function retrieveOfficial(
  retriever: Retriever,
  url: string,
  isOfficialUrl: (url: string) => boolean,
): Promise<RetrievalOutcome> {
  let file: FetchedFile;
  try {
    file = await retriever.fetch(url);
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!isOfficialUrl(file.finalUrl)) return { ok: false, reason: 'redirected_off_official' };
  if (file.mimeType !== 'application/pdf') return { ok: false, reason: 'not_pdf' };
  if (file.sizeBytes <= 0) return { ok: false, reason: 'empty' };
  if (file.sizeBytes > MAX_SOURCE_BYTES) return { ok: false, reason: 'too_large' };
  if (!/^[0-9a-f]{64}$/.test(file.sha256)) return { ok: false, reason: 'bad_hash' };
  return { ok: true, file };
}

export interface SourceVersion {
  url: string;
  sha256: string;
  retrievedAt: string;
  edition?: string;
  versionNumber: number;
}

/** Appends a version if the content changed; identical content is not duplicated. */
export function recordVersion(
  history: readonly SourceVersion[],
  url: string,
  sha256: string,
  retrievedAt: string,
  edition?: string,
): { history: SourceVersion[]; current: SourceVersion; isNew: boolean } {
  const same = history.find((v) => v.url === url && v.sha256 === sha256);
  if (same) return { history: [...history], current: same, isNew: false };
  const current: SourceVersion = {
    url,
    sha256,
    retrievedAt,
    edition,
    versionNumber: history.filter((v) => v.url === url).length + 1,
  };
  return { history: [...history, current], current, isNew: true };
}
