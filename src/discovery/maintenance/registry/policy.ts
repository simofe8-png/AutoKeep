import type { IsoDate } from '@/domain';

/**
 * Source access policy (M-SOURCE). Six INDEPENDENT dimensions; none is inferred from another,
 * and none is stronger than its evidence. robots.txt / access controls can only speak to the
 * technical dimensions (discovery, fetch); legal dimensions need terms, a licence, written
 * permission or a recorded owner decision.
 */

export const POLICY_DIMENSIONS = [
  'discoveryAllowed',
  'automatedFetchAllowed',
  'automatedExtractionAllowed',
  'documentCachingAllowed',
  'structuredFactsStorageAllowed',
  'documentRedistributionAllowed',
] as const;
export type PolicyDimension = (typeof POLICY_DIMENSIONS)[number];

export type PolicyValue = 'ALLOWED' | 'NOT_ALLOWED' | 'UNKNOWN' | 'REQUIRES_PERMISSION';

/** Dimensions a technical signal (robots.txt, login wall, bot block) may speak to. */
export const TECHNICAL_DIMENSIONS: readonly PolicyDimension[] = [
  'discoveryAllowed',
  'automatedFetchAllowed',
];

export type PolicyEvidenceKind =
  /** Terms of use / legal notice / licence text of the source. */
  | 'terms'
  /** An explicit licence or permission granting the activity (e.g. an open licence). */
  | 'licence'
  /** Written permission from the rights holder. */
  | 'written_permission'
  /** A recorded owner decision of the AutoKeep project (operational policy, e.g. P1 §8.4). */
  | 'owner_decision'
  /** robots.txt — technical signal only. */
  | 'robots'
  /** Login wall, captcha, bot protection, click-through gate — technical signal only. */
  | 'access_control'
  /** A search for the terms was made and found nothing (supports UNKNOWN only). */
  | 'none_found';

export interface PolicyEvidence {
  id: string;
  kind: PolicyEvidenceKind;
  url?: string;
  /** Short quote (≤ 30 words) or a precise description; never the document itself. */
  quote?: string;
  reviewedAt: IsoDate;
  reviewedBy: string;
}

export interface DimensionPolicy {
  value: PolicyValue;
  /** Ids of the evidence items this value rests on. */
  basis: string[];
  note?: string;
}

export interface AccessPolicy {
  /** Monotonic; a change is a NEW version, the previous one is kept (audit). */
  version: number;
  reviewedAt: IsoDate;
  dimensions: Record<PolicyDimension, DimensionPolicy>;
  evidence: PolicyEvidence[];
}

const LEGAL_PERMISSION: readonly PolicyEvidenceKind[] = [
  'licence',
  'written_permission',
  'owner_decision',
  'terms',
];
const PROHIBITION: readonly PolicyEvidenceKind[] = ['terms', 'licence', 'robots', 'access_control'];

/** Deterministic coherence checks; an empty list means valid. */
export function policyIssues(p: AccessPolicy): string[] {
  const issues: string[] = [];
  const byId = new Map(p.evidence.map((e) => [e.id, e]));
  if (byId.size !== p.evidence.length) issues.push('duplicate evidence id');
  if (!Number.isInteger(p.version) || p.version < 1) issues.push('version must be ≥ 1');
  for (const e of p.evidence) {
    if (e.quote && e.quote.split(/\s+/).length > 40)
      issues.push(`evidence ${e.id}: quote too long`);
    if ((e.kind === 'terms' || e.kind === 'licence' || e.kind === 'robots') && !e.url) {
      issues.push(`evidence ${e.id}: ${e.kind} needs a url`);
    }
  }
  for (const d of POLICY_DIMENSIONS) {
    const dim = p.dimensions[d];
    if (!dim) {
      issues.push(`${d}: missing`);
      continue;
    }
    const kinds = dim.basis.map((id) => byId.get(id)?.kind);
    if (kinds.some((k) => !k)) issues.push(`${d}: unknown evidence reference`);
    const technicalOnly = kinds.every((k) => k === 'robots' || k === 'access_control');
    if (
      !TECHNICAL_DIMENSIONS.includes(d) &&
      dim.basis.length &&
      technicalOnly &&
      dim.value !== 'UNKNOWN'
    ) {
      issues.push(`${d}: a technical signal cannot decide a legal dimension`);
    }
    switch (dim.value) {
      case 'ALLOWED':
        if (!kinds.some((k) => k && LEGAL_PERMISSION.includes(k))) {
          issues.push(
            `${d}: ALLOWED needs explicit permission evidence (licence, permission, terms or owner decision)`,
          );
        }
        if (kinds.includes('none_found')) issues.push(`${d}: absence of terms is not permission`);
        break;
      case 'NOT_ALLOWED':
        if (!kinds.some((k) => k && PROHIBITION.includes(k))) {
          issues.push(`${d}: NOT_ALLOWED needs prohibiting evidence`);
        }
        break;
      case 'REQUIRES_PERMISSION':
        if (!kinds.some((k) => k === 'terms' || k === 'licence')) {
          issues.push(`${d}: REQUIRES_PERMISSION needs terms evidence`);
        }
        break;
      case 'UNKNOWN':
        break;
    }
  }
  return issues;
}

/** Only an explicit ALLOWED permits an activity; UNKNOWN and REQUIRES_PERMISSION never do. */
export function permits(p: AccessPolicy, d: PolicyDimension): boolean {
  return p.dimensions[d].value === 'ALLOWED';
}

export interface PolicyHistory {
  versions: readonly AccessPolicy[];
}

export const currentPolicy = (h: PolicyHistory): AccessPolicy => h.versions[h.versions.length - 1];

/**
 * Appends a reviewed policy version. Earlier versions (and their evidence) are never rewritten:
 * the new version must be the next number and must itself be valid.
 */
export function revisePolicy(h: PolicyHistory, next: AccessPolicy): PolicyHistory {
  const last = currentPolicy(h);
  if (next.version !== last.version + 1) throw new Error('policy version must increase by one');
  const issues = policyIssues(next);
  if (issues.length) throw new Error(`invalid policy: ${issues.join('; ')}`);
  return { versions: [...h.versions, next] };
}

/** Builds a policy where every dimension is UNKNOWN unless given (the conservative default). */
export function policy(
  reviewedAt: IsoDate,
  evidence: PolicyEvidence[],
  set: Partial<Record<PolicyDimension, DimensionPolicy>>,
  version = 1,
): AccessPolicy {
  const dimensions = Object.fromEntries(
    POLICY_DIMENSIONS.map((d) => [d, set[d] ?? { value: 'UNKNOWN', basis: [] }]),
  ) as Record<PolicyDimension, DimensionPolicy>;
  return { version, reviewedAt, dimensions, evidence };
}
