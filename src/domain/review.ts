import type { IsoDate } from './core';
import {
  requirementIssues,
  type ApplicabilityDimension,
  type EvidenceLevel,
  type MaintenanceRequirement,
  type RequirementAction,
  type RequirementApplicability,
  type RequirementInterval,
} from './requirements';

/**
 * Generic requirement reviewer (M-SOURCE Step 11). A professional reviewer decides ONE atomic
 * requirement at a time — never a whole booklet — against its evidence:
 *   APPROVE  the requirement is exactly what the cited page says;
 *   CORRECT  the page says something else (the correction is recorded, the original kept);
 *   REJECT   it is not a valid requirement (wrong item, not on the page, not applicable, …).
 * The vehicle owner confirming "this is my booklet" is not a professional review.
 */

export type ReviewDecision = 'APPROVE' | 'CORRECT' | 'REJECT';
export type ReviewerRole = 'curator' | 'technician' | 'owner';

/** Everything the reviewer must see to decide (built from the requirement + engine output). */
export interface ReviewInput {
  requirement: MaintenanceRequirement;
  /** Evidence level the engine assigned for the vehicle class under review. */
  evidenceLevel: EvidenceLevel | null;
  /** Other requirements for the same task + action and scope that state something else. */
  conflicts: string[];
  /** Applicability dimensions still unresolved (the review does not resolve them). */
  unresolved: ApplicabilityDimension[];
}

/** A structured checklist view of a review input (what the reviewer UI must show). */
export function reviewChecklist(input: ReviewInput) {
  const r = input.requirement;
  const e = r.evidence[0];
  return {
    item: r.task,
    itemText: r.taskText,
    action: r.action,
    distance: r.interval.every ?? null,
    time: r.interval.everyMonths ?? null,
    rule: r.interval.rule,
    first: { distance: r.interval.first ?? null, months: r.interval.firstMonths ?? null },
    repeats: r.interval.repeats,
    anchor: r.interval.anchor ?? null,
    severe: r.applicability.usage ?? null,
    applicability: r.applicability,
    source: e
      ? {
          title: e.documentTitle,
          page: e.page,
          section: e.section,
          table: e.table,
          locator: e.locator,
          sha256: e.documentSha256,
        }
      : null,
    publisher: r.authority,
    market: e?.markets ?? [],
    evidenceLevel: input.evidenceLevel,
    extraction: r.extraction,
    conflicts: input.conflicts,
    unresolved: input.unresolved,
  };
}

export interface Correction {
  action?: RequirementAction;
  interval?: RequirementInterval;
  applicability?: RequirementApplicability;
  taskText?: string;
}

export interface ReviewRecord {
  requirementId: string;
  decision: ReviewDecision;
  reviewer: string;
  role: ReviewerRole;
  at: IsoDate;
  reason: string;
  /** For CORRECT: the original as extracted (kept for provenance). */
  original?: MaintenanceRequirement;
}

export class ReviewError extends Error {}

/**
 * Applies a reviewer decision to ONE requirement. Returns the resulting requirement (verified,
 * corrected-and-verified, or rejected) and an audit record. Refuses:
 *  - reviews by the vehicle owner (upload confirmation is not professional verification);
 *  - approving a requirement without an exact location in an identified document;
 *  - approving / correcting into an interval that does not compute;
 *  - a decision without a reason.
 */
export function reviewRequirement(
  input: ReviewInput,
  decision: ReviewDecision,
  by: { reviewer: string; role: ReviewerRole; at: IsoDate; reason: string },
  correction?: Correction,
): { requirement: MaintenanceRequirement; record: ReviewRecord } {
  const r = input.requirement;
  if (by.role === 'owner') {
    throw new ReviewError('the vehicle owner cannot verify a maintenance requirement');
  }
  if (!by.reason.trim()) throw new ReviewError('a review needs a reason');
  const located = r.evidence.some(
    (e) => e.documentSha256 && (e.page != null || e.section || e.table || e.locator),
  );
  const record: ReviewRecord = {
    requirementId: r.id,
    decision,
    reviewer: by.reviewer,
    role: by.role,
    at: by.at,
    reason: by.reason,
  };
  const reviewed = { ...r.extraction, reviewedBy: `${by.role}:${by.reviewer}`, reviewedAt: by.at };

  if (decision === 'REJECT') {
    return { requirement: { ...r, verification: 'rejected', extraction: reviewed }, record };
  }
  if (!located) {
    throw new ReviewError('only a requirement located in an identified document can be verified');
  }
  if (decision === 'APPROVE') {
    if (correction) throw new ReviewError('APPROVE takes no correction (use CORRECT)');
    const approved: MaintenanceRequirement = {
      ...r,
      verification: 'verified',
      extraction: reviewed,
    };
    if (requirementIssues(approved).length) {
      throw new ReviewError(`not computable: ${requirementIssues(approved).join(', ')}`);
    }
    return { requirement: approved, record };
  }
  // CORRECT
  if (!correction || !Object.keys(correction).length) {
    throw new ReviewError('CORRECT needs the corrected fields');
  }
  const corrected: MaintenanceRequirement = {
    ...r,
    ...correction,
    id: `${r.id}~c${by.at}`,
    verification: 'verified',
    extraction: { ...reviewed, method: 'curated' },
  };
  if (requirementIssues(corrected).length) {
    throw new ReviewError(`not computable: ${requirementIssues(corrected).join(', ')}`);
  }
  return { requirement: corrected, record: { ...record, original: r } };
}
