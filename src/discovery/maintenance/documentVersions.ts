import type { IsoDate } from '@/domain';

/**
 * Document identity and versions (M-SOURCE Step 8). A document is identified by its source system
 * and canonical URL; each distinct sha256 seen there is a VERSION. Versions are append-only: a
 * changed file never overwrites the evidence that pointed at the earlier bytes.
 */

export interface DocumentVersion {
  documentKey: string;
  sourceSystemId: string | null;
  url: string;
  sha256: string;
  version: number;
  firstSeenAt: IsoDate;
  lastSeenAt: IsoDate;
}

export function documentKeyOf(sourceSystemId: string | null, url: string): string {
  let canonical = url;
  try {
    const u = new URL(url);
    u.hash = '';
    canonical = u.toString();
  } catch {
    // keep as is (uploads)
  }
  return `${sourceSystemId ?? 'unregistered'}|${canonical}`;
}

export type VersionStatus = 'first' | 'unchanged' | 'new_version';

export function recordDocumentVersion(
  store: readonly DocumentVersion[],
  obs: { sourceSystemId: string | null; url: string; sha256: string; at: IsoDate },
): { store: DocumentVersion[]; current: DocumentVersion; status: VersionStatus } {
  const key = documentKeyOf(obs.sourceSystemId, obs.url);
  const same = store.find((v) => v.documentKey === key && v.sha256 === obs.sha256);
  if (same) {
    const current = { ...same, lastSeenAt: obs.at };
    return { store: store.map((v) => (v === same ? current : v)), current, status: 'unchanged' };
  }
  const prior = store.filter((v) => v.documentKey === key);
  const current: DocumentVersion = {
    documentKey: key,
    sourceSystemId: obs.sourceSystemId,
    url: obs.url,
    sha256: obs.sha256,
    version: prior.length + 1,
    firstSeenAt: obs.at,
    lastSeenAt: obs.at,
  };
  return { store: [...store, current], current, status: prior.length ? 'new_version' : 'first' };
}
