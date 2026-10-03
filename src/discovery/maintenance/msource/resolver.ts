import { publisherKey } from '../triangulation';
import { MATCH_RANK, USABLE_MATCH } from './matcher';
import {
  MSOURCE_VERSION,
  type EvidenceRecord,
  type MatchStatus,
  type ResolutionQuality,
  type ResolvedSchedule,
  type ResolvedScheduleItem,
  type ScheduleStatus,
  type SourceProvenance,
} from './types';

/**
 * Cross-source validation and schedule resolution (Phases 14–15). Quality comes from SUPPORT —
 * applicability exactness and independent corroboration — never from a percentage:
 *
 *  - only grounded evidence whose vehicle match is EXACT / STRONG / SUPPORTED takes part;
 *  - per obligation (operation + action + condition), the most exact applicability tier wins,
 *    then the vehicle's own market; "official" is provenance, not an override of exactness;
 *  - different values inside the winning tier are CONFLICTING (never averaged); values outranked
 *    by more exact evidence are kept as recorded conflicts;
 *  - copies of one manufacturer document count once; other sources count per publisher;
 *  - quality (owner correction 2026-10-02):
 *      official (approved) source: its applicability decides — EXACT → EXACT, STRONG → STRONG,
 *        otherwise SUPPORTED (STRONG with a second agreeing independent source);
 *      ≥ 2 independent agreeing sources: EXACT / STRONG / SUPPORTED by the best applicability;
 *      ONE independent source: SUPPORTED when it applies STRONGLY or EXACTLY to the vehicle
 *        (never EXACT merely because it is the only source); weaker → INSUFFICIENT.
 */

/** Document types written by the manufacturer (copies of them are one source, wherever hosted). */
const MANUFACTURER_DOCUMENTS = ['owners_manual', 'warranty_maintenance_booklet', 'service_manual'];

export interface SourceGroup {
  key: string;
  official: boolean;
}

/**
 * Independence of a source. `officialHost` = the final host is a registered manufacturer /
 * importer system (provenance), not what discovery metadata claimed.
 */
export function sourceGroup(
  s: SourceProvenance,
  officialHost: (host: string) => boolean,
  make: string,
): SourceGroup {
  let host = '';
  try {
    host = new URL(s.finalUrl).hostname.toLowerCase();
  } catch {
    host = '';
  }
  // Identity is recorded per source (registry or the manufacturer's brand domain); the host
  // predicate remains for sources acquired before identity was recorded.
  const official =
    s.sourceType !== 'user_upload' && (s.authority ? s.authority.official : officialHost(host));
  if (official || (s.documentType && MANUFACTURER_DOCUMENTS.includes(s.documentType))) {
    return { key: `manufacturer-document:${make}`, official };
  }
  if (s.sourceType === 'user_upload') return { key: `upload:${s.contentSha256}`, official: false };
  return { key: `publisher:${publisherKey(s.archiveOf ?? s.finalUrl)}`, official: false };
}

const sameValue = (a: EvidenceRecord, b: EvidenceRecord) => {
  const km = (x: EvidenceRecord) => x.intervalKm;
  const kmEq =
    km(a) == null || km(b) == null
      ? km(a) === km(b)
      : Math.abs(km(a)! - km(b)!) <= 0.02 * Math.max(km(a)!, km(b)!);
  return kmEq && a.intervalMonths === b.intervalMonths;
};

function qualityOf(
  best: MatchStatus,
  independent: number,
  official: boolean,
  schedulePresented = true,
): ResolutionQuality {
  const strong = MATCH_RANK[best] >= MATCH_RANK.STRONG;
  if (official) {
    if (best === 'EXACT') return 'EXACT';
    if (best === 'STRONG' || independent >= 2) return 'STRONG';
    return 'SUPPORTED';
  }
  if (independent >= 2) return best === 'EXACT' ? 'EXACT' : strong ? 'STRONG' : 'SUPPORTED';
  // One high-quality, strongly vehicle-applicable independent source — a source that presents
  // a schedule, not one incidental sentence.
  return strong && schedulePresented ? 'SUPPORTED' : 'INSUFFICIENT';
}

export interface ResolveInput {
  fingerprintKey: string;
  market: string;
  make: string;
  sources: SourceProvenance[];
  evidence: EvidenceRecord[];
  officialHost: (host: string) => boolean;
  now: string;
  /** No source could be acquired at all (vs sources without usable evidence). */
  acquiredSources: number;
}

const CORE = new Set(['periodic_service', 'engine_oil']);

export const FORUM =
  /\/(forums?|threads?|discussion|topic|community|askhj|answers?)\b|[?&](t|topic)=\d/i;

export function resolveSchedule(input: ResolveInput): ResolvedSchedule {
  const byId = new Map(input.sources.map((s) => [s.sourceId, s]));
  const groupOf = (e: EvidenceRecord) => {
    const s = byId.get(e.sourceId);
    return s
      ? sourceGroup(s, input.officialHost, input.make)
      : { key: e.sourceId, official: false };
  };
  const marketOf = (e: EvidenceRecord) =>
    e.marketApplicability.includes(input.market) ||
    Boolean(byId.get(e.sourceId)?.markets.includes(input.market));

  // A row that only waits for an answerable vehicle fact (regime code) takes part as conditional.
  const effective = (e: EvidenceRecord): MatchStatus =>
    e.match.conditional && e.match.baseStatus ? e.match.baseStatus : e.match.status;
  // Forum / Q&A pages are recorded but never count as support (anecdotes, not schedules).
  const forum = (e: EvidenceRecord) => {
    const src = byId.get(e.sourceId);
    return Boolean(src && FORUM.test(src.finalUrl));
  };
  // Distinct grounded operations per source: a source that presents a schedule states several.
  const operationsBySource = new Map<string, Set<string>>();
  for (const e of input.evidence) {
    if (!e.grounded) continue;
    const ops = operationsBySource.get(e.sourceId) ?? new Set<string>();
    ops.add(e.operationKey);
    operationsBySource.set(e.sourceId, ops);
  }
  const usable = input.evidence.filter(
    (e) => e.grounded && !forum(e) && USABLE_MATCH.includes(effective(e)),
  );
  const condKey = (e: EvidenceRecord) => e.match.conditional?.serviceRegimes.join('+') ?? '';
  const keyOf = (e: EvidenceRecord) =>
    `${e.operationKey}|${e.task}|${e.action}|${e.severeConditions ? 'severe' : 'normal'}|${condKey(e)}`;
  const groups = new Map<string, EvidenceRecord[]>();
  for (const e of usable) groups.set(keyOf(e), [...(groups.get(keyOf(e)) ?? []), e]);

  const items: ResolvedScheduleItem[] = [];
  const unresolved: ResolvedScheduleItem[] = [];
  for (const list of groups.values()) {
    const tier = (e: EvidenceRecord) => MATCH_RANK[effective(e)] * 2 + (marketOf(e) ? 1 : 0);
    const top = Math.max(...list.map(tier));
    const topList = list.filter((e) => tier(e) === top);
    // Distinct values (each with its evidence) over all usable evidence.
    const values: EvidenceRecord[][] = [];
    for (const e of list) {
      const v = values.find((x) => sameValue(x[0], e));
      if (v) v.push(e);
      else values.push([e]);
    }
    const topValues = values.filter((v) => v.some((e) => topList.includes(e)));
    const first = list[0];
    const base = {
      operation: first.operationKey,
      task: first.task,
      action: first.action,
      condition: first.severeConditions ? ('severe' as const) : ('normal' as const),
      ...(first.match.conditional ? { conditions: first.match.conditional } : {}),
    };
    const describe = (v: EvidenceRecord[]) => ({
      intervalKm: v[0].intervalKm,
      intervalMonths: v[0].intervalMonths,
      evidenceIds: v.map((e) => e.id),
    });
    if (topValues.length !== 1) {
      unresolved.push({
        ...base,
        intervalKm: null,
        intervalMonths: null,
        firstKm: null,
        firstMonths: null,
        rule: first.rule,
        quality: 'CONFLICTING',
        evidenceIds: list.map((e) => e.id),
        independentSources: new Set(list.map((e) => groupOf(e).key)).size,
        officialSources: list.some((e) => groupOf(e).official) ? 1 : 0,
        applicability: effective(topList[0]),
        conflicts: topValues.map(describe),
        notes: ['equally applicable sources state different intervals; not averaged'],
      });
      continue;
    }
    const winner = topValues[0];
    const gs = new Map(winner.map((e) => [groupOf(e).key, groupOf(e).official]));
    const official = [...gs.values()].some(Boolean);
    const best = winner.reduce<MatchStatus>(
      (b, e) => (MATCH_RANK[effective(e)] > MATCH_RANK[b] ? effective(e) : b),
      'SUPPORTED',
    );
    const schedulePresented = winner.some(
      (e) => (operationsBySource.get(e.sourceId)?.size ?? 0) >= 2,
    );
    const quality = qualityOf(best, gs.size, official, schedulePresented);
    const w = winner.find((e) => e.firstKm != null || e.firstMonths != null) ?? winner[0];
    const item: ResolvedScheduleItem = {
      ...base,
      intervalKm: w.intervalKm,
      intervalMonths: w.intervalMonths,
      firstKm: w.firstKm,
      firstMonths: w.firstMonths,
      rule: w.rule,
      quality,
      evidenceIds: winner.map((e) => e.id),
      independentSources: gs.size,
      officialSources: official ? 1 : 0,
      applicability: best,
      conflicts: values.filter((v) => v !== winner).map(describe),
      ...(base.conditions
        ? { applicabilityStatus: 'CONDITIONALLY_APPLICABLE' as const }
        : { applicabilityStatus: 'APPLICABLE' as const }),
      ...(w.itemApplicability ? { scope: w.itemApplicability.scope } : {}),
      notes:
        values.length > 1 ? ['other values were stated by less exactly applicable sources'] : [],
    };
    (quality === 'INSUFFICIENT' ? unresolved : items).push(item);
  }

  const order = (a: ResolvedScheduleItem, b: ResolvedScheduleItem) =>
    a.operation.localeCompare(b.operation) || a.action.localeCompare(b.action);
  items.sort(order);
  unresolved.sort(order);
  // Items resolve independently: one conflicting item never hides unrelated established ones.
  const unconditional = items.filter((i) => !i.conditions);
  const core = unconditional.some((i) => CORE.has(i.task) && i.condition === 'normal');
  let status: ScheduleStatus;
  if (input.acquiredSources === 0) status = 'NO_SOURCE_FOUND';
  else if (unconditional.length) status = core && !unresolved.length ? 'READY' : 'READY_PARTIAL';
  else if (items.length) status = 'CONDITIONAL';
  else if (unresolved.some((u) => u.quality === 'CONFLICTING')) status = 'CONFLICTING_EVIDENCE';
  else status = 'INSUFFICIENT_EVIDENCE';
  return {
    fingerprintKey: input.fingerprintKey,
    status,
    items,
    unresolved,
    sources: input.sources,
    evidence: input.evidence,
    resolvedAt: input.now,
    msourceVersion: MSOURCE_VERSION,
  };
}
