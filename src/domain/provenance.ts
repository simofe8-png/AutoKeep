import type { DocumentId, SourceId, Timestamp } from './core';

/**
 * Provenance & verification (T037, ADR-0003). AI is never an authoritative source; evidence is.
 */

export type SourceAuthority =
  'manufacturer' | 'official_importer' | 'vehicle_document' | 'garage_document' | 'user_report';

/** Internal states. The UI collapses them to three (see `displayState`). */
export type VerificationState =
  'verified' | 'pending' | 'unable_to_verify' | 'conflicting' | 'unverified';

export type DisplayVerificationState = 'verified' | 'pending' | 'unable_to_verify';

/** Shared three-state vocabulary for the UI (invariant 18: states stay distinguishable). */
export function displayState(state: VerificationState): DisplayVerificationState {
  switch (state) {
    case 'verified':
      return 'verified';
    case 'pending':
    case 'unverified':
      return 'pending';
    case 'unable_to_verify':
    case 'conflicting':
      return 'unable_to_verify';
  }
}

/** Exact location inside a source (page / section / table), so evidence links are precise. */
export interface SourceReference {
  sourceId: SourceId;
  documentId?: DocumentId;
  page?: number;
  section?: string;
  table?: string;
  figure?: string;
  /** Short verbatim quote supporting the fact (optional). */
  quote?: string;
}

/** What a fact is claimed to rest on. */
export interface Evidence {
  authority: SourceAuthority;
  reference?: SourceReference;
  /** The source was proven to apply to this exact vehicle version. */
  exactApplicability: boolean;
  /** Normalized value this evidence asserts (used to detect conflicts). */
  assertedValue?: string;
}

export interface VerificationRecord {
  state: VerificationState;
  evidence: Evidence[];
  decidedAt: Timestamp;
  reason?: string;
}

/** Which authorities can independently establish a fact of a given kind. */
export type FactKind = 'maintenance_requirement' | 'service_performed' | 'vehicle_identity';

const AUTHORITATIVE: Record<FactKind, readonly SourceAuthority[]> = {
  // Professional maintenance requirements need the manufacturer or official importer.
  maintenance_requirement: ['manufacturer', 'official_importer'],
  // A performed service is evidenced by a garage document.
  service_performed: ['garage_document'],
  // Identity is evidenced by the vehicle's own documents or the manufacturer.
  vehicle_identity: ['vehicle_document', 'manufacturer', 'official_importer'],
};

export function isAuthoritative(kind: FactKind, authority: SourceAuthority): boolean {
  return AUTHORITATIVE[kind].includes(authority);
}

/**
 * Deterministic verification decision.
 *  - no evidence                                   → pending
 *  - only user reports / non-authoritative sources → unverified (never silently verified)
 *  - authoritative, but applicability not exact    → pending (awaiting exact match)
 *  - authoritative + exact, values disagree        → conflicting
 *  - authoritative + exact, consistent             → verified
 */
export function decideVerification(
  kind: FactKind,
  evidence: readonly Evidence[],
  decidedAt: Timestamp,
): VerificationRecord {
  const record = (state: VerificationState, reason?: string): VerificationRecord => ({
    state,
    evidence: [...evidence],
    decidedAt,
    reason,
  });
  if (evidence.length === 0) return record('pending', 'no_evidence');
  const authoritative = evidence.filter((e) => isAuthoritative(kind, e.authority));
  if (authoritative.length === 0) return record('unverified', 'no_authoritative_source');
  const exact = authoritative.filter((e) => e.exactApplicability);
  if (exact.length === 0) return record('pending', 'applicability_not_exact');
  const values = new Set(exact.map((e) => e.assertedValue).filter((v) => v !== undefined));
  if (values.size > 1) return record('conflicting', 'authoritative_sources_disagree');
  return record('verified');
}

/** A record that can back a UI "verified" badge. */
export function isVerified(v: VerificationRecord | null | undefined): boolean {
  return v?.state === 'verified';
}
