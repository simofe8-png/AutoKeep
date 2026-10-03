import type {
  IsoDate,
  MaintenanceRequirement,
  RequirementAction,
  RequirementInterval,
  TaskCode,
} from '@/domain';

import type {
  EvidenceRecord,
  IntervalRule,
  MatchStatus,
  ResolvedSchedule,
  SourceProvenance,
} from './types';

/**
 * Owner review of the owner's own uploaded documents (spec Part A, owner decision D-A3,
 * 2026-10-03). An upload is extracted and matched like any source, but its items are held out of
 * automatic resolution: each is PROPOSED to the owner with its page and excerpt, and only an item
 * the owner accepts becomes a requirement — authority "vehicle document", page cited, local to
 * this device. Nothing here invents a value: a proposal is one grounded evidence record.
 */

export interface OwnerProposal {
  /** Stable across re-runs of the same document (decisions are stored by it). */
  key: string;
  evidenceId: string;
  /** The owner's stored document (VehicleDocument id). */
  documentId: string;
  documentName: string;
  documentSha256: string;
  task: TaskCode;
  action: RequirementAction;
  condition: 'normal' | 'severe';
  intervalKm: number | null;
  intervalMonths: number | null;
  rule: IntervalRule;
  page: number;
  /** The document's own words (≤ 30 words). */
  excerpt: string;
  /**
   * matched = the document states this vehicle (model / years / engine agree);
   * unstated = the document does not state all of it (the owner confirms it is this vehicle's).
   */
  fit: 'matched' | 'unstated';
  /** Applies only under these service-plan codes (as the document maps them). */
  serviceRegimes?: string[];
}

/** A document that states ANOTHER vehicle (or contradicts this one) is never proposed. */
const EXCLUDED: readonly MatchStatus[] = ['NOT_APPLICABLE', 'CONFLICTING'];
const MATCHED: readonly MatchStatus[] = ['EXACT', 'STRONG', 'SUPPORTED'];

const uploadDocumentId = (s: SourceProvenance) =>
  s.canonicalUrl.startsWith('upload:') ? s.canonicalUrl.slice('upload:'.length) : s.sourceId;

export function ownerProposals(schedule: ResolvedSchedule): OwnerProposal[] {
  const uploads = new Map(
    schedule.sources
      .filter((s) => s.sourceType === 'user_upload' && !s.duplicateOf)
      .map((s) => [s.sourceId, s]),
  );
  const out = new Map<string, OwnerProposal>();
  for (const e of schedule.evidence) {
    const s = uploads.get(e.sourceId);
    if (!s || !e.grounded) continue;
    const status = e.match.conditional && e.match.baseStatus ? e.match.baseStatus : e.match.status;
    if (EXCLUDED.includes(status)) continue;
    const km = e.intervalKm;
    const months = e.intervalMonths ?? (e.intervalYears != null ? e.intervalYears * 12 : null);
    if (km == null && months == null) continue;
    const condition = e.severeConditions && !e.normalConditions ? 'severe' : 'normal';
    const key = [
      s.contentSha256.slice(0, 16),
      e.task,
      e.action,
      condition,
      km ?? '',
      months ?? '',
      (e.match.conditional?.serviceRegimes ?? []).join('+'),
    ].join(':');
    if (out.has(key)) continue; // the same obligation stated again later in the document
    out.set(key, {
      key,
      evidenceId: e.id,
      documentId: uploadDocumentId(s),
      documentName: s.sourceName,
      documentSha256: s.contentSha256,
      task: e.task,
      action: e.action,
      condition,
      intervalKm: km,
      intervalMonths: months,
      rule: e.rule,
      page: e.sourceLocation.page,
      excerpt: e.originalText,
      fit: MATCHED.includes(status) ? 'matched' : 'unstated',
      ...(e.match.conditional ? { serviceRegimes: e.match.conditional.serviceRegimes } : {}),
    });
  }
  return [...out.values()];
}

/**
 * The owner's correction of a proposed item before accepting it: interval values and/or the
 * item's description. The document's own reading stays in the evidence and the audit trail.
 */
export interface OwnerEdit {
  intervalKm: number | null;
  intervalMonths: number | null;
  text: string;
}

/** The edit differs from what was read (otherwise it is no edit). */
export function isRealEdit(
  p: OwnerProposal,
  edit: OwnerEdit | null | undefined,
): edit is OwnerEdit {
  return (
    !!edit &&
    (edit.intervalKm !== p.intervalKm ||
      edit.intervalMonths !== p.intervalMonths ||
      edit.text.trim() !== p.excerpt.trim())
  );
}

function editedInterval(base: RequirementInterval, edit: OwnerEdit): RequirementInterval {
  const km = edit.intervalKm;
  const months = edit.intervalMonths;
  const rest = { ...base };
  delete rest.every;
  delete rest.everyMonths;
  return {
    ...rest,
    ...(km != null ? { every: { value: km, unit: 'km' as const } } : {}),
    ...(months != null ? { everyMonths: months } : {}),
    rule:
      km != null && months != null ? 'whichever_first' : km != null ? 'distance_only' : 'time_only',
  };
}

/**
 * The requirement an ACCEPTED proposal becomes (verified for this vehicle, page cited). With the
 * owner's correction it is recorded as entered by the owner ("owner document, edited by user"),
 * the document's original reading kept in `extraction.ownerEdit`.
 */
export function ownerDocumentRequirement(
  p: OwnerProposal,
  e: EvidenceRecord,
  msourceVersion: string,
  reviewedAt: IsoDate,
  edit: OwnerEdit | null = null,
): MaintenanceRequirement {
  const base = e.requirement;
  const edited = isRealEdit(p, edit) ? edit : null;
  return {
    id: `owner-doc-${p.key}`,
    task: p.task,
    taskText: edited ? edited.text.trim() || p.excerpt : p.excerpt,
    action: p.action,
    interval: edited ? editedInterval(base.interval, edited) : base.interval,
    applicability: {
      ...base.applicability,
      ...(p.serviceRegimes ? { serviceRegimes: p.serviceRegimes } : {}),
    },
    authority: 'vehicle_document',
    evidence: [
      {
        documentId: p.documentId,
        documentTitle: p.documentName,
        authority: 'vehicle_document',
        markets: base.evidence[0]?.markets ?? [],
        page: p.page,
        locator: e.sourceLocation.locator,
        excerpt: p.excerpt,
        documentSha256: p.documentSha256,
      },
    ],
    verification: 'verified',
    extraction: edited
      ? {
          method: 'user_entered',
          by: 'owner',
          at: reviewedAt,
          reviewedBy: 'owner',
          reviewedAt,
          ownerEdit: {
            original: {
              intervalKm: p.intervalKm,
              intervalMonths: p.intervalMonths,
              text: p.excerpt,
            },
          },
        }
      : {
          method: 'deterministic_parser',
          by: msourceVersion,
          at: reviewedAt,
          grounded: true,
          reviewedBy: 'owner',
          reviewedAt,
        },
  };
}

/** An uploaded document that could not be read, by reason (shown to the owner, never silent). */
export interface UploadIssue {
  documentName: string;
  reason: 'no_text';
}

/** Uploads whose PDF has no selectable text (scanned / image-only), from the run trace. */
export function uploadIssues(
  candidates: readonly {
    candidate: { upload?: { name: string } };
    failure?: { code: string };
  }[],
): UploadIssue[] {
  return candidates.flatMap((c) =>
    c.candidate.upload && c.failure?.code === 'NO_TEXT_LAYER'
      ? [{ documentName: c.candidate.upload.name, reason: 'no_text' as const }]
      : [],
  );
}
