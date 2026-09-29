import type { IsoDate } from './core';
import {
  type EvidenceRef,
  type ExtractionProvenance,
  type MaintenanceRequirement,
  type MarketCode,
  type RequirementAction,
  type RequirementApplicability,
  type RequirementAuthority,
  type RequirementInterval,
  type TaskCode,
} from './requirements';

/**
 * Maintenance knowledge pipeline (M1/Task 6): Document → Sections → Candidate Claims →
 * Applicability → Evidence Reference → Verification → Maintenance Requirement. Pure rules.
 *
 * Trust rules (owner decisions 2026-09-29):
 *  - uploading a document never makes it authoritative;
 *  - the user may confirm that a booklet belongs to their vehicle, but the user is not the
 *    professional verifier of a manufacturer's requirement;
 *  - only a curator review of a claim located in an authentic edition makes it verified;
 *  - the catalog keeps structured facts and exact locators, not manual text (short excerpts only
 *    where the edition's terms allow);
 *  - a user's uploaded document is never redistributed to other users without the rights to do so.
 */

export type KnowledgeOrigin = 'user_upload' | 'official_download' | 'catalog_edition';

export type DocumentAuthenticity =
  | 'unconfirmed' // uploaded; nothing is known about it
  | 'owner_confirmed' // the owner says it belongs to their vehicle (not a content verification)
  | 'matched_official_edition' // its sha256 equals a curator-verified official edition
  | 'curator_verified'; // a curator verified the edition itself (publisher, coverage, market)

export type RedistributionRights = 'none' | 'structured_facts_only' | 'redistributable';

export interface KnowledgeDocument {
  id: string;
  /** Vehicle-scoped for uploads; null for a catalog edition. */
  vehicleId: string | null;
  origin: KnowledgeOrigin;
  title: string;
  /** Who the document says it is from (manufacturer booklet, importer plan, …). */
  authority: RequirementAuthority;
  markets: MarketCode[];
  edition?: string;
  publishedOn?: IsoDate;
  /** Fingerprint of the stored original (hash of the exact bytes). */
  sha256: string;
  pageCount?: number;
  authenticity: DocumentAuthenticity;
  ownerConfirmedAt?: IsoDate;
  rights: RedistributionRights;
  /** Whether a short excerpt may be stored and shown with a claim. */
  excerptPolicy: 'none' | 'short_allowed';
  /** Vehicles the document states it covers (claims may narrow this, never widen it). */
  coverage: RequirementApplicability;
}

export interface DocumentSection {
  id: string;
  documentId: string;
  page?: number;
  section?: string;
  table?: string;
  heading?: string;
  /** A section may narrow the document's coverage (e.g. "petrol 1.4 63 kW"). */
  coverage?: RequirementApplicability;
}

export type ClaimStatus = 'candidate' | 'accepted' | 'rejected';

export interface ClaimReview {
  by: string;
  role: 'curator' | 'owner';
  at: IsoDate;
  decision: 'accepted' | 'rejected';
  note?: string;
}

export interface CandidateClaim {
  id: string;
  documentId: string;
  sectionId?: string;
  vehicleId: string | null;
  task: TaskCode;
  taskText?: string;
  action: RequirementAction;
  interval: RequirementInterval;
  applicability: RequirementApplicability;
  /** Exact location inside the document (page / section / table / row). */
  locator: { page?: number; section?: string; table?: string; row?: string };
  excerpt?: string;
  extraction: ExtractionProvenance;
  status: ClaimStatus;
  review?: ClaimReview;
}

export const MAX_EXCERPT_LENGTH = 160;

/** An uploaded file becomes a vehicle-scoped, unconfirmed, non-redistributable document. */
export function documentFromUpload(input: {
  id: string;
  vehicleId: string;
  title: string;
  sha256: string;
  pageCount?: number;
  /** What the owner says it is (e.g. the vehicle's maintenance booklet). */
  claimedAuthority?: RequirementAuthority;
  markets?: MarketCode[];
  coverage?: RequirementApplicability;
}): KnowledgeDocument {
  return {
    id: input.id,
    vehicleId: input.vehicleId,
    origin: 'user_upload',
    title: input.title,
    authority: input.claimedAuthority ?? 'user_report',
    markets: input.markets ?? [],
    sha256: input.sha256,
    pageCount: input.pageCount,
    authenticity: 'unconfirmed',
    rights: 'none',
    excerptPolicy: 'none',
    coverage: input.coverage ?? {},
  };
}

/** The owner confirms the booklet belongs to their vehicle. This verifies nothing about content. */
export function confirmOwnership(doc: KnowledgeDocument, at: IsoDate): KnowledgeDocument {
  if (doc.origin !== 'user_upload') return doc;
  return doc.authenticity === 'unconfirmed'
    ? { ...doc, authenticity: 'owner_confirmed', ownerConfirmedAt: at }
    : { ...doc, ownerConfirmedAt: at };
}

/**
 * An upload whose exact bytes equal a curator-verified official edition inherits that edition's
 * authenticity, authority, markets and coverage (and so its verified claims). The upload itself
 * stays private to the vehicle.
 */
export function matchOfficialEdition(
  doc: KnowledgeDocument,
  editions: readonly KnowledgeDocument[],
): { document: KnowledgeDocument; edition: KnowledgeDocument | null } {
  const edition =
    editions.find(
      (e) =>
        e.origin === 'catalog_edition' &&
        e.authenticity === 'curator_verified' &&
        e.sha256.toLowerCase() === doc.sha256.toLowerCase(),
    ) ?? null;
  if (!edition) return { document: doc, edition: null };
  return {
    edition,
    document: {
      ...doc,
      authenticity: 'matched_official_edition',
      authority: edition.authority,
      markets: edition.markets,
      edition: edition.edition,
      publishedOn: edition.publishedOn,
      coverage: edition.coverage,
      excerptPolicy: edition.excerptPolicy,
    },
  };
}

export const isAuthentic = (d: KnowledgeDocument) =>
  d.authenticity === 'matched_official_edition' || d.authenticity === 'curator_verified';

/** Structural issues of a candidate claim (a claim without an exact location is not evidence). */
export function claimIssues(c: CandidateClaim): string[] {
  const issues: string[] = [];
  const { page, section, table, row } = c.locator;
  if (page == null && !section && !table && !row) issues.push('no exact location in the document');
  if (c.excerpt && c.excerpt.length > MAX_EXCERPT_LENGTH) issues.push('excerpt too long');
  return issues;
}

/** Records a review. Only a curator's acceptance can later make the requirement verified. */
export function reviewClaim(c: CandidateClaim, review: ClaimReview): CandidateClaim {
  return { ...c, status: review.decision, review };
}

type Dim = keyof RequirementApplicability;

/**
 * Narrowing merge: each dimension constrained by either side is kept; if both constrain it, the
 * intersection is used. A claim can therefore narrow the document's coverage but never widen it.
 */
export function narrowApplicability(
  outer: RequirementApplicability,
  inner: RequirementApplicability,
): RequirementApplicability {
  const out: RequirementApplicability = { ...outer };
  for (const k of Object.keys(inner) as Dim[]) {
    const a = outer[k];
    const b = inner[k];
    if (b === undefined) continue;
    if (a === undefined) {
      (out as Record<string, unknown>)[k] = b;
    } else if (Array.isArray(a) && Array.isArray(b)) {
      const norm = (s: string) => s.trim().toUpperCase();
      (out as Record<string, unknown>)[k] = a.filter((x) =>
        (b as string[]).some((y) => norm(y) === norm(x as string)),
      );
    } else if (k === 'modelYears' || k === 'displacementCc') {
      const lo = (o: object, key: string) => (o as Record<string, number | undefined>)[key];
      const [fromKey, toKey] = k === 'modelYears' ? ['from', 'to'] : ['min', 'max'];
      const from = [lo(a as object, fromKey), lo(b as object, fromKey)].filter(
        (v): v is number => v != null,
      );
      const to = [lo(a as object, toKey), lo(b as object, toKey)].filter(
        (v): v is number => v != null,
      );
      (out as Record<string, unknown>)[k] = {
        ...(from.length ? { [fromKey]: Math.max(...from) } : {}),
        ...(to.length ? { [toKey]: Math.min(...to) } : {}),
      };
    } else if (a !== b) {
      // Contradicting scalar constraints (e.g. usage): nothing can satisfy both.
      (out as Record<string, unknown>)[k] = undefined;
      out.makes = [];
    }
  }
  return out;
}

/**
 * Deterministic conversion of a claim into a maintenance requirement.
 *  - verified ONLY if a curator accepted it AND the document is an authentic edition AND the
 *    claim has an exact location; anything else stays a candidate (or rejected);
 *  - authority and markets come from the document, never from the claim;
 *  - applicability = document coverage ∩ section coverage ∩ claim applicability;
 *  - the excerpt is kept only where the edition's terms allow a short excerpt.
 */
export function requirementFromClaim(
  claim: CandidateClaim,
  doc: KnowledgeDocument,
  section?: DocumentSection,
): MaintenanceRequirement {
  if (claim.documentId !== doc.id) throw new Error('claim does not belong to this document');
  const curatorAccepted = claim.review?.role === 'curator' && claim.review.decision === 'accepted';
  const verified = curatorAccepted && isAuthentic(doc) && claimIssues(claim).length === 0;
  const excerpt =
    doc.excerptPolicy === 'short_allowed' &&
    claim.excerpt &&
    claim.excerpt.length <= MAX_EXCERPT_LENGTH
      ? claim.excerpt
      : undefined;
  const evidence: EvidenceRef = {
    documentId: doc.id,
    documentTitle: doc.title,
    authority: doc.authority,
    markets: doc.markets,
    edition: doc.edition,
    publishedOn: doc.publishedOn,
    page: claim.locator.page ?? section?.page,
    section: claim.locator.section ?? section?.section,
    table: claim.locator.table ?? section?.table,
    locator: claim.locator.row,
    excerpt,
    documentSha256: doc.sha256,
  };
  let applicability = narrowApplicability(doc.coverage, section?.coverage ?? {});
  applicability = narrowApplicability(applicability, claim.applicability);
  if (doc.markets.length && !applicability.markets) applicability.markets = doc.markets;
  return {
    id: claim.id,
    task: claim.task,
    taskText: claim.taskText,
    action: claim.action,
    interval: claim.interval,
    applicability,
    authority: doc.authority,
    evidence: [evidence],
    verification: claim.status === 'rejected' ? 'rejected' : verified ? 'verified' : 'candidate',
    extraction: curatorAccepted
      ? { ...claim.extraction, reviewedBy: claim.review!.by, reviewedAt: claim.review!.at }
      : claim.extraction,
  };
}

/**
 * What may leave the owner's vehicle scope. The binary of a user upload is never shared unless
 * the rights allow redistribution; structured facts only after curator verification of the
 * edition and with at least structured-facts rights.
 */
export function sharingPolicy(doc: KnowledgeDocument): {
  shareBinary: boolean;
  shareStructuredFacts: boolean;
} {
  if (doc.origin !== 'user_upload') {
    return { shareBinary: doc.rights === 'redistributable', shareStructuredFacts: true };
  }
  const facts =
    doc.authenticity === 'curator_verified' &&
    (doc.rights === 'structured_facts_only' || doc.rights === 'redistributable');
  return { shareBinary: doc.rights === 'redistributable', shareStructuredFacts: facts };
}

/**
 * Provider boundary for proposing candidate claims from a document (OCR/AI). Null in production
 * until a provider is approved (G1). Its output is always `ai_candidate`, never verified.
 */
export interface ClaimExtractor {
  readonly id: string;
  propose(doc: KnowledgeDocument, pages: readonly Uint8Array[]): Promise<CandidateClaim[]>;
}
