import {
  ownerDocumentRequirement,
  ownerProposals,
  type OwnerProposal,
} from '@/discovery/maintenance/msource/ownerReview';
import type { MSourceRun } from '@/discovery/maintenance/msource/run';
import type { IsoDate, MaintenanceRequirement } from '@/domain';
import type { OwnerDecision } from '@/persistence';

/**
 * The owner-review state of one vehicle: proposals read from the owner's own documents (latest
 * run) with the owner's decisions, and the requirements the ACCEPTED ones become. Local only.
 */
export interface OwnerReviewState {
  proposals: (OwnerProposal & { decision: OwnerDecision | null })[];
  requirements: MaintenanceRequirement[];
}

export const NO_OWNER_REVIEW: OwnerReviewState = { proposals: [], requirements: [] };

export function ownerReviewState(
  run: MSourceRun | null,
  decisions: ReadonlyMap<string, { decision: OwnerDecision; decidedAt: string }>,
): OwnerReviewState {
  const schedule = run?.schedule;
  if (!schedule) return NO_OWNER_REVIEW;
  const evidence = new Map(schedule.evidence.map((e) => [e.id, e]));
  const proposals = ownerProposals(schedule).map((p) => ({
    ...p,
    decision: decisions.get(p.key)?.decision ?? null,
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
          ),
        ]
      : [];
  });
  return { proposals, requirements };
}
