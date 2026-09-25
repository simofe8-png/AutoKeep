import type { Evidence, SourceReference, SourceId, Timestamp } from '@/domain';

import { matchApplicability, type Applicability } from './applicability';
import {
  classifyAuthority,
  normalizeManufacturer,
  type ManufacturerAliases,
  type OfficialDomainEntry,
} from './authority';
import { retrieveOfficial, type FetchedFile, type Retriever } from './retrieval';
import type {
  DiscoveryProvider,
  DocumentCoverage,
  SourceCandidate,
  VehicleIdentityQuery,
} from './types';

/**
 * Discovery orchestration (T081 orchestration, T084 provenance, T085 uncertain/no-source).
 * The result never contains invented maintenance data: without an official, exactly-applicable,
 * retrieved document the outcome is "not_found" or "pending" with the reason.
 */

export type DiscoveryStep =
  'discovery' | 'authority' | 'applicability' | 'retrieval' | 'extraction' | 'validation';

/** Reads coverage facts from the retrieved document itself (M11 implementation). */
export interface CoverageReader {
  read(file: FetchedFile): Promise<DocumentCoverage | null>;
}

export interface DiscoveredSource {
  candidate: SourceCandidate;
  authority: 'manufacturer' | 'official_importer';
  file: FetchedFile;
  coverage: DocumentCoverage;
  applicability: Applicability;
  /** Provenance for the domain layer (ADR-0003): evidence + where it came from. */
  evidence: Evidence;
  retrievedAt: Timestamp;
}

export type DiscoveryResult =
  | { status: 'verified'; source: DiscoveredSource; rejected: RejectedCandidate[] }
  | { status: 'pending'; best: DiscoveredSource; rejected: RejectedCandidate[] }
  | { status: 'not_found'; rejected: RejectedCandidate[]; providerError?: boolean };

export interface RejectedCandidate {
  url: string;
  reason: string;
}

export interface DiscoveryDeps {
  provider: DiscoveryProvider;
  retriever: Retriever;
  coverage: CoverageReader;
  registry: readonly OfficialDomainEntry[];
  aliases: ManufacturerAliases;
  sourceId: () => SourceId;
  now: () => Timestamp;
  onStep?: (step: DiscoveryStep) => void;
}

export async function discoverOfficialSource(
  identity: VehicleIdentityQuery,
  deps: DiscoveryDeps,
): Promise<DiscoveryResult> {
  const rejected: RejectedCandidate[] = [];
  const key = (name: string) => normalizeManufacturer(name, deps.aliases);

  deps.onStep?.('discovery');
  let candidates: SourceCandidate[];
  try {
    candidates = await deps.provider.search(identity);
  } catch {
    return { status: 'not_found', rejected, providerError: true };
  }

  deps.onStep?.('authority');
  const official = candidates.flatMap((c) => {
    const cls = classifyAuthority(c, identity.manufacturer, deps.registry, deps.aliases);
    if (cls.authority === 'third_party') {
      rejected.push({ url: c.url, reason: cls.reason });
      return [];
    }
    return [{ c, authority: cls.authority }];
  });

  const isOfficialUrl = (url: string) =>
    classifyAuthority(
      { url, title: '', discoveredBy: 'redirect' },
      identity.manufacturer,
      deps.registry,
      deps.aliases,
    ).authority !== 'third_party';

  let best: DiscoveredSource | null = null;
  for (const { c, authority } of official) {
    deps.onStep?.('retrieval');
    const got = await retrieveOfficial(deps.retriever, c.url, isOfficialUrl);
    if (!got.ok) {
      rejected.push({ url: c.url, reason: got.reason });
      continue;
    }
    deps.onStep?.('extraction');
    const coverage = await deps.coverage.read(got.file).catch(() => null);
    if (!coverage) {
      rejected.push({ url: c.url, reason: 'coverage_unreadable' });
      continue;
    }
    deps.onStep?.('applicability');
    const applicability = matchApplicability(identity, coverage, key);
    if (applicability.status === 'mismatch') {
      rejected.push({ url: c.url, reason: applicability.reasons.join(',') });
      continue;
    }
    const reference: SourceReference = { sourceId: deps.sourceId() };
    const found: DiscoveredSource = {
      candidate: c,
      authority,
      file: got.file,
      coverage,
      applicability,
      evidence: { authority, reference, exactApplicability: applicability.status === 'exact' },
      retrievedAt: deps.now(),
    };
    deps.onStep?.('validation');
    if (applicability.status === 'exact') return { status: 'verified', source: found, rejected };
    best ??= found;
  }
  return best ? { status: 'pending', best, rejected } : { status: 'not_found', rejected };
}
