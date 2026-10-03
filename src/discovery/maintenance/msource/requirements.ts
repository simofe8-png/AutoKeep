import { computeRequirementDue, type Completion, type RequirementDue } from '@/engine/requirements';
import type {
  EvidenceRef,
  IsoDate,
  MaintenanceRequirement,
  RequirementApplicability,
  RequirementInterval,
} from '@/domain';

import type { VehicleFingerprint } from './fingerprint';
import type { EvidenceRecord, ResolvedSchedule, ResolvedScheduleItem } from './types';

/**
 * Resolved schedule → atomic requirements for AutoKeep's deterministic maintenance engine
 * (src/engine/requirements). Only items of quality EXACT / STRONG / SUPPORTED become requirements;
 * CONFLICTING and INSUFFICIENT items never do. Every requirement cites its evidence with the
 * document hash, page and locator, and carries its corroboration so the plan shows its level.
 */

const QUALITY_CONFIDENCE = { EXACT: 'high', STRONG: 'high', SUPPORTED: 'medium' } as const;

function intervalOf(i: ResolvedScheduleItem): RequirementInterval | null {
  const km = i.intervalKm;
  const mo = i.intervalMonths;
  if (km == null && mo == null) return null;
  const rule =
    km != null && mo != null ? 'whichever_first' : km != null ? 'distance_only' : 'time_only';
  return {
    ...(km != null ? { every: { value: km, unit: 'km' as const } } : {}),
    ...(mo != null ? { everyMonths: mo } : {}),
    first: i.firstKm != null ? { value: i.firstKm, unit: 'km' } : null,
    ...(i.firstMonths != null ? { firstMonths: i.firstMonths } : {}),
    rule,
    repeats: true,
  };
}

/** The vehicle-class scope M-SOURCE proved for this item (re-checked by the engine). */
function applicabilityOf(
  fp: VehicleFingerprint,
  i: ResolvedScheduleItem,
  ev: EvidenceRecord[],
): RequirementApplicability {
  const years = ev
    .map((e) => e.yearApplicability)
    .filter((y): y is { from: number | null; to: number | null } => !!y && y.from != null);
  const markets = [...new Set(ev.flatMap((e) => e.marketApplicability))];
  return {
    kinds: [fp.kind],
    makes: [fp.make],
    models: [fp.model],
    ...(years.length
      ? {
          modelYears: {
            from: Math.max(...years.map((y) => y.from!)),
            to: Math.min(...years.map((y) => y.to ?? y.from!)),
          },
        }
      : {}),
    ...(markets.length ? { markets } : {}),
    // A regime-specific item asks the owner for the code (the plan's service-regime question).
    ...(i.conditions ? { serviceRegimes: i.conditions.serviceRegimes } : {}),
    // Usage only when the source itself distinguishes normal / severe conditions.
    ...(ev.some((e) => e.requirement.applicability.usage) ? { usage: i.condition } : {}),
  };
}

export function scheduleToRequirements(
  schedule: ResolvedSchedule,
  fp: VehicleFingerprint,
  at: IsoDate,
): MaintenanceRequirement[] {
  const evidence = new Map(schedule.evidence.map((e) => [e.id, e]));
  const sources = new Map(schedule.sources.map((s) => [s.sourceId, s]));
  const out: MaintenanceRequirement[] = [];
  for (const item of schedule.items) {
    if (item.quality === 'CONFLICTING' || item.quality === 'INSUFFICIENT') continue;
    const interval = intervalOf(item);
    if (!interval) continue;
    const ev = item.evidenceIds
      .map((id) => evidence.get(id))
      .filter((e): e is EvidenceRecord => !!e);
    if (!ev.length) continue;
    const official = item.officialSources > 0;
    const refs: EvidenceRef[] = ev.map((e) => {
      const s = sources.get(e.sourceId);
      return {
        documentId: s?.canonicalUrl ?? e.sourceId,
        documentTitle: s?.sourceName ?? e.sourceId,
        authority: official ? 'manufacturer' : 'secondary',
        markets: e.marketApplicability,
        page: e.sourceLocation.page,
        ...(e.sourceLocation.section ? { section: e.sourceLocation.section } : {}),
        locator: e.sourceLocation.locator,
        excerpt: e.originalText,
        ...(s ? { documentSha256: s.contentSha256 } : {}),
      };
    });
    out.push({
      id: `msource-${schedule.fingerprintKey}-${item.task}-${item.action}-${item.condition}${item.conditions ? `-${item.conditions.serviceRegimes.join('+')}` : ''}`,
      task: item.task,
      taskText: ev[0].originalText,
      action: item.action,
      interval,
      applicability: applicabilityOf(fp, item, ev),
      authority: official ? 'manufacturer' : 'secondary',
      evidence: refs,
      verification: 'verified',
      extraction: {
        method: 'deterministic_parser',
        by: schedule.msourceVersion,
        at,
        grounded: true,
      },
      corroboration: {
        independentSources: Math.max(item.independentSources, official ? 1 : 0),
        officialSources: item.officialSources,
        // EXACT / STRONG / SUPPORTED map onto the engine's corroboration vocabulary.
        confidence: QUALITY_CONFIDENCE[item.quality],
        groups: [...new Set(ev.map((e) => e.sourceId))],
      },
    });
  }
  return out;
}

// ---------- next service ----------

export interface NextServiceInput {
  requirements: MaintenanceRequirement[];
  today: IsoDate;
  readings: readonly { date: IsoDate; km: number }[];
  inServiceDate?: IsoDate | null;
  /** Last RECORDED completion per requirement id (linked by the user; never inferred). */
  completions?: Record<string, Completion | undefined>;
}

export interface NextServiceItem {
  requirementId: string;
  task: MaintenanceRequirement['task'];
  due: RequirementDue;
}

/**
 * Next due per requirement (mileage AND date; for whichever-comes-first the earlier threshold
 * governs the state), plus the most urgent item(s). Pure; the app's plan builder uses the same
 * engine with the vehicle's history.
 */
export function nextService(input: NextServiceInput): {
  items: NextServiceItem[];
  next: NextServiceItem[];
} {
  const items = input.requirements.map((r) => ({
    requirementId: r.id,
    task: r.task,
    due: computeRequirementDue({
      requirement: r,
      today: input.today,
      readings: input.readings,
      inServiceDate: input.inServiceDate ?? null,
      lastCompletion: input.completions?.[r.id] ?? null,
    }),
  }));
  const urgency = (i: NextServiceItem) => {
    if (i.due.status !== 'computed') return Infinity;
    const d = i.due;
    const days = d.remainingDays ?? Infinity;
    const kmDays = d.remainingKm != null ? d.remainingKm / 40 : Infinity; // ~40 km/day only for ordering
    return Math.min(days, kmDays);
  };
  const computed = items.filter((i) => i.due.status === 'computed');
  const best = Math.min(...computed.map(urgency));
  return { items, next: computed.filter((i) => urgency(i) === best) };
}
