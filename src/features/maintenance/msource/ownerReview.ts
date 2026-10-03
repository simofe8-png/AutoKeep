import {
  ownerDocumentRequirement,
  ownerProposals,
  uploadIssues,
  type OwnerEdit,
  type OwnerProposal,
  type UploadIssue,
} from '@/discovery/maintenance/msource/ownerReview';
import type { MSourceRun } from '@/discovery/maintenance/msource/run';
import type { IsoDate, MaintenanceRequirement } from '@/domain';
import type { OwnerDecision } from '@/persistence';

/**
 * The owner-review state of one vehicle: proposals read from the owner's own documents (latest
 * run) with the owner's decisions and corrections, the requirements the ACCEPTED ones become, and
 * the uploads that could not be read. Local only.
 */
export interface OwnerReviewState {
  proposals: (OwnerProposal & { decision: OwnerDecision | null; edit: OwnerEdit | null })[];
  requirements: MaintenanceRequirement[];
  /** Uploaded documents that could not be read (e.g. scanned, no text). */
  issues: UploadIssue[];
}

export const NO_OWNER_REVIEW: OwnerReviewState = { proposals: [], requirements: [], issues: [] };

/** Bounds of an owner correction (a typo guard, not a plausibility judgement). */
const KM = { min: 100, max: 1_000_000 };
const MONTHS = { min: 1, max: 240 };
const TEXT_MAX = 200;
const DIGITS = /^\d+$/;
const SEPARATORS = /[\s,.]/g;

export type OwnerEditErrors = Partial<Record<'km' | 'months' | 'text' | 'interval', true>>;

/**
 * Validates the owner's correction as typed on the review screen. Empty km / months = none; at
 * least one interval is required; an empty description keeps the document's words.
 */
export function validateOwnerEdit(
  input: { km: string; months: string; text: string },
  fallbackText: string,
): { ok: true; edit: OwnerEdit } | { ok: false; errors: OwnerEditErrors } {
  const errors: OwnerEditErrors = {};
  const num = (raw: string, bounds: { min: number; max: number }, key: 'km' | 'months') => {
    const t = raw.replace(SEPARATORS, '');
    if (!t) return null;
    if (!DIGITS.test(t)) {
      errors[key] = true;
      return null;
    }
    const n = Number(t);
    if (n < bounds.min || n > bounds.max) errors[key] = true;
    return n;
  };
  const km = num(input.km, KM, 'km');
  const months = num(input.months, MONTHS, 'months');
  if (km == null && months == null && !errors.km && !errors.months) errors.interval = true;
  const text = input.text.trim() || fallbackText;
  if (text.length > TEXT_MAX) errors.text = true;
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, edit: { intervalKm: km, intervalMonths: months, text } };
}

export function ownerReviewState(
  run: MSourceRun | null,
  decisions: ReadonlyMap<
    string,
    { decision: OwnerDecision; decidedAt: string; edit?: OwnerEdit | null }
  >,
): OwnerReviewState {
  const issues = run ? uploadIssues(run.candidates) : [];
  const schedule = run?.schedule;
  if (!schedule) return { ...NO_OWNER_REVIEW, issues };
  const evidence = new Map(schedule.evidence.map((e) => [e.id, e]));
  const proposals = ownerProposals(schedule).map((p) => ({
    ...p,
    decision: decisions.get(p.key)?.decision ?? null,
    edit: decisions.get(p.key)?.edit ?? null,
  }));
  const requirements = proposals.flatMap((p) => {
    const d = decisions.get(p.key);
    const e = evidence.get(p.evidenceId);
    return d?.decision === 'accepted' && e
      ? [
          ownerDocumentRequirement(
            p,
            e,
            schedule.msourceVersion,
            d.decidedAt.slice(0, 10) as IsoDate,
            d.edit ?? null,
          ),
        ]
      : [];
  });
  return { proposals, requirements, issues };
}
