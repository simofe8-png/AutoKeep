import {
  addDays,
  addMonths,
  compareDates,
  daysBetween,
  distanceKm,
  isTriangulated,
  isVerifiedRequirement,
  type RequirementApplicability,
  type ApplicabilityDimension,
  type RequirementApplicabilityResult,
  type IsoDate,
  type MaintenanceRequirement,
  type RequirementAction,
  type RequirementAuthority,
  type EvidenceLevel,
  type TaskCode,
  type VehicleFacts,
} from '@/domain';

import { drivingRate, type Forecast } from './maintenance';

/**
 * Deterministic maintenance-requirement engine (M1). Pure: no I/O, no clock.
 *
 *   vehicle facts × requirements → applicability → per-task resolution (precedence, Israel
 *   override, conflicts) → effective requirement → due calculation.
 *
 * Nothing here invents an interval: an unknown fact, an unresolved conflict or unverified
 * evidence produces an explicit "insufficient / conflicting / unverified" outcome instead.
 */

// ---------- applicability ----------

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
const normCode = (s: string) => s.trim().toUpperCase().replace(/\s+/g, '');

type Check = 'match' | 'mismatch' | 'unknown';

function inList(fact: string | undefined, list: string[], code = false): Check {
  if (fact == null || fact === '') return 'unknown';
  const f = code ? normCode(fact) : norm(fact);
  return list.some((x) => (code ? normCode(x) : norm(x)) === f) ? 'match' : 'mismatch';
}

function inRange(fact: number | undefined, lo?: number, hi?: number): Check {
  if (fact == null) return 'unknown';
  if (lo != null && fact < lo) return 'mismatch';
  if (hi != null && fact > hi) return 'mismatch';
  return 'match';
}

/** Per-dimension evaluation of a requirement's applicability against known vehicle facts. */
export function evaluateApplicability(
  a: RequirementApplicability,
  f: VehicleFacts,
): RequirementApplicabilityResult {
  const checks: [ApplicabilityDimension, Check][] = [];
  if (a.kinds) checks.push(['kind', inList(f.kind, a.kinds)]);
  if (a.makes) checks.push(['make', inList(f.make, a.makes)]);
  if (a.models) checks.push(['model', inList(f.model, a.models)]);
  if (a.generations) checks.push(['generation', inList(f.generation, a.generations, true)]);
  if (a.phases) checks.push(['phase', inList(f.phase, a.phases, true)]);
  if (a.productionPeriod) {
    const d = f.productionDate;
    const p = a.productionPeriod;
    checks.push([
      'productionDate',
      !d
        ? 'unknown'
        : (p.from && compareDates(d, p.from) < 0) || (p.to && compareDates(d, p.to) > 0)
          ? 'mismatch'
          : 'match',
    ]);
  }
  if (a.modelYears) {
    checks.push(['modelYear', inRange(f.modelYear, a.modelYears.from, a.modelYears.to)]);
  }
  if (a.engineFamilies) {
    checks.push(['engineFamily', inList(f.engineFamily, a.engineFamilies, true)]);
  }
  if (a.engineCodes) checks.push(['engineCode', inList(f.engineCode, a.engineCodes, true)]);
  if (a.displacementCc) {
    checks.push([
      'displacementCc',
      inRange(f.displacementCc, a.displacementCc.min, a.displacementCc.max),
    ]);
  }
  if (a.powertrains) checks.push(['powertrain', inList(f.powertrain, a.powertrains)]);
  if (a.transmissions) checks.push(['transmission', inList(f.transmission, a.transmissions)]);
  if (a.markets) {
    // A source states the markets it covers; 'GLOBAL' only when it states worldwide scope.
    const m: Check = !f.market
      ? 'unknown'
      : a.markets.some((x) => normCode(x) === 'GLOBAL' || normCode(x) === normCode(f.market!))
        ? 'match'
        : 'mismatch';
    checks.push(['market', m]);
  }
  if (a.serviceRegimes) {
    checks.push(['serviceRegime', inList(f.serviceRegime, a.serviceRegimes, true)]);
  }
  if (a.usage) checks.push(['usage', inList(f.usage, [a.usage])]);

  const pick = (c: Check) => checks.filter(([, v]) => v === c).map(([d]) => d);
  const mismatched = pick('mismatch');
  const missing = pick('unknown');
  // The source's own coverage is unknown on these dimensions: never assumed to match.
  const coverageUnknown = (a.coverageUnknown ?? []).filter((d) => !mismatched.includes(d));
  const result: RequirementApplicabilityResult = {
    verdict:
      mismatched.length > 0
        ? 'does_not_apply'
        : missing.length > 0 || coverageUnknown.length > 0
          ? 'insufficient_information'
          : 'applies',
    missing,
    mismatched,
    matched: pick('match').filter((d) => !coverageUnknown.includes(d)),
  };
  if (coverageUnknown.length) result.coverageUnknown = coverageUnknown;
  return result;
}

// ---------- evidence level & precedence ----------

/**
 * Explicit, deterministic precedence (lower wins), per atomic task:
 *  1. evidence level: A (the source names the vehicle's market) beats B (official, exact vehicle,
 *     market not proven) — the Israeli override is therefore per task, never per schedule;
 *  2. then authority: importer (its market's official schedule) > manufacturer / the vehicle's
 *     own official booklet > official publication.
 */
const AUTHORITY_RANK: Record<RequirementAuthority, number> = {
  importer: 0,
  manufacturer: 1,
  vehicle_document: 1,
  official_publication: 2,
  user_report: 9,
  secondary: 9,
};

const NON_EVIDENCE: readonly RequirementAuthority[] = ['user_report', 'secondary'];

/** The source names the vehicle's own market (not only 'GLOBAL' or another market). */
export function namesVehicleMarket(r: MaintenanceRequirement, f: VehicleFacts): boolean {
  return (
    f.market != null &&
    (r.applicability.markets ?? []).some((m) => normCode(m) === normCode(f.market!))
  );
}

export interface EvidenceAssessment {
  /** null = the requirement does not apply to this vehicle at all. */
  level: EvidenceLevel | null;
  /** Applicability on the vehicle dimensions; the market is expressed by the level instead. */
  applicability: RequirementApplicabilityResult;
  marketNamed: boolean;
}

/**
 * Evidence level of one requirement for one vehicle (see EvidenceLevel). A market that is not
 * proven (or differs) never excludes official evidence for the exact vehicle — it caps it at B,
 * and the UI must say so. Vehicle dimensions (engine, generation, years…) still exclude.
 */
export function assessEvidence(r: MaintenanceRequirement, f: VehicleFacts): EvidenceAssessment {
  const vehicleDims: RequirementApplicability = { ...r.applicability, markets: undefined };
  const applicability = evaluateApplicability(vehicleDims, f);
  const marketNamed = namesVehicleMarket(r, f);
  const level: EvidenceLevel | null =
    applicability.verdict === 'does_not_apply'
      ? null
      : !isVerifiedRequirement(r) && isTriangulated(r)
        ? applicability.verdict === 'insufficient_information'
          ? 'C'
          : 'T'
        : NON_EVIDENCE.includes(r.authority)
          ? 'D'
          : !isVerifiedRequirement(r)
            ? 'E'
            : applicability.verdict === 'insufficient_information'
              ? 'C'
              : marketNamed
                ? 'A'
                : 'B';
  return { level, applicability, marketNamed };
}

/** The source is specific to other markets only (not the vehicle's, not 'GLOBAL'). */
function foreignMarketOnly(r: MaintenanceRequirement, f: VehicleFacts): boolean {
  const ms = r.applicability.markets ?? [];
  return (
    f.market != null &&
    ms.length > 0 &&
    ms.every((m) => normCode(m) !== 'GLOBAL' && normCode(m) !== normCode(f.market!))
  );
}

/**
 * [tier, foreign, authority]: tier 0 = the source names the vehicle's market (level A);
 * within level B a source stated for other markets only ranks below a global/unspecified one;
 * a foreign importer has no importer privilege outside its market.
 */
export function precedence(
  r: MaintenanceRequirement,
  f: VehicleFacts,
): [number, number, number, number] {
  const named = namesVehicleMarket(r, f);
  const foreign = foreignMarketOnly(r, f);
  const authority =
    r.authority === 'importer' && !named
      ? AUTHORITY_RANK.manufacturer
      : AUTHORITY_RANK[r.authority];
  // Triangulated evidence ranks below every individually verified official requirement.
  // Within it, a source naming the vehicle's market outranks one that does not (market first).
  const tier = isVerifiedRequirement(r) ? (named ? 0 : 1) : named ? 2 : 3;
  // Among triangulated evidence, the source whose stated model years fit the vehicle most
  // narrowly ranks first (model year is the first conflict dimension); verified tiers keep ties.
  return [tier, foreign ? 1 : 0, authority, tier >= 2 ? yearSpan(r) : 0];
}

function yearSpan(r: MaintenanceRequirement): number {
  const y = r.applicability.modelYears;
  if (!y) return 999;
  return (y.to ?? 2100) - (y.from ?? 1900);
}

type Rank = [number, number, number, number];
const cmpPrecedence = (a: Rank, b: Rank) =>
  a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];

/** Two requirements state the same obligation (same action and interval). */
export function sameObligation(a: MaintenanceRequirement, b: MaintenanceRequirement): boolean {
  const x = a.interval;
  const y = b.interval;
  return (
    a.action === b.action &&
    x.rule === y.rule &&
    x.repeats === y.repeats &&
    distanceKm(x.every) === distanceKm(y.every) &&
    (x.everyMonths ?? null) === (y.everyMonths ?? null) &&
    distanceKm(x.first) === distanceKm(y.first) &&
    (x.firstMonths ?? null) === (y.firstMonths ?? null) &&
    (x.anchor ?? null) === (y.anchor ?? null)
  );
}

// ---------- resolution ----------

export type ConsideredRole =
  | 'effective'
  | 'supporting' // same obligation, same precedence as the effective one
  | 'overridden' // applicable but lower precedence (e.g. level B vs an IL importer's level A)
  | 'conflicting'
  | 'insufficient_information'
  | 'not_applicable'
  | 'unverified'; // levels D and E: never scheduled

export interface Considered {
  requirement: MaintenanceRequirement;
  applicability: RequirementApplicabilityResult;
  level: EvidenceLevel | null;
  role: ConsideredRole;
}

export type ResolutionStatus =
  'resolved' | 'conflicting' | 'insufficient_information' | 'unverified_only' | 'not_applicable';

export type ResolutionReason =
  | 'single_source'
  | 'agreeing_sources'
  | 'market_override' // a higher-precedence requirement replaced a different lower one
  | 'conflict_same_precedence'
  | 'missing_vehicle_facts'
  | 'only_unverified_evidence'
  | 'no_applicable_requirement';

export interface TaskResolution {
  task: TaskCode;
  /** Inspection, replacement, adjustment and other obligations of one task resolve independently. */
  action: RequirementAction;
  status: ResolutionStatus;
  effective: MaintenanceRequirement | null;
  /** Evidence level of the effective requirement (A or B); null when unresolved. */
  level: EvidenceLevel | null;
  reason: ResolutionReason;
  /** Vehicle facts that would let this task resolve (asked of the user, never assumed). */
  missing: ApplicabilityDimension[];
  considered: Considered[];
}

/**
 * Resolves each task independently. Only level A/B requirements can become effective; a level C
 * requirement (verified, but applicability not yet decidable) that could outrank or tie with the
 * best applicable one with a different obligation blocks resolution — choosing would be a guess.
 */
export function resolveRequirements(
  requirements: readonly MaintenanceRequirement[],
  facts: VehicleFacts,
): TaskResolution[] {
  const byKey = new Map<string, MaintenanceRequirement[]>();
  for (const r of requirements) {
    const key = `${r.task}:${r.action}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  return [...byKey.keys()].sort().map((key) => {
    const reqs = byKey.get(key)!;
    return resolveTask(reqs[0].task, reqs[0].action, reqs, facts);
  });
}

function resolveTask(
  task: TaskCode,
  action: RequirementAction,
  reqs: MaintenanceRequirement[],
  facts: VehicleFacts,
): TaskResolution {
  const evaluated = [...reqs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((requirement) => ({ requirement, ...assessEvidence(requirement, facts) }));
  const considered: Considered[] = [];
  const role = (r: MaintenanceRequirement, rl: ConsideredRole) => {
    const e = evaluated.find((x) => x.requirement === r)!;
    considered.push({ requirement: r, applicability: e.applicability, level: e.level, role: rl });
  };

  const applicable = evaluated.filter((e) => e.level === 'A' || e.level === 'B' || e.level === 'T');
  const insufficient = evaluated.filter((e) => e.level === 'C');
  for (const e of evaluated) {
    if (e.level === null) role(e.requirement, 'not_applicable');
    else if (e.level === 'D' || e.level === 'E') role(e.requirement, 'unverified');
  }
  const out = (
    status: ResolutionStatus,
    reason: ResolutionReason,
    effective: MaintenanceRequirement | null = null,
    missing: ApplicabilityDimension[] = [],
    level: EvidenceLevel | null = null,
  ): TaskResolution => ({ task, action, status, reason, effective, level, missing, considered });

  if (applicable.length === 0) {
    if (insufficient.length > 0) {
      insufficient.forEach((e) => role(e.requirement, 'insufficient_information'));
      return out(
        'insufficient_information',
        'missing_vehicle_facts',
        null,
        missingOf(insufficient),
      );
    }
    if (evaluated.some((e) => e.level === 'D' || e.level === 'E')) {
      return out('unverified_only', 'only_unverified_evidence');
    }
    return out('not_applicable', 'no_applicable_requirement');
  }

  const ranked = [...applicable].sort((a, b) =>
    cmpPrecedence(precedence(a.requirement, facts), precedence(b.requirement, facts)),
  );
  const best = precedence(ranked[0].requirement, facts);
  const top = ranked.filter((e) => cmpPrecedence(precedence(e.requirement, facts), best) === 0);
  const lower = ranked.filter((e) => !top.includes(e));

  // A requirement we cannot evaluate yet, ranked at least as high, with a different obligation.
  const blocking = insufficient.filter(
    (e) =>
      cmpPrecedence(precedence(e.requirement, facts), best) <= 0 &&
      !sameObligation(e.requirement, top[0].requirement),
  );
  insufficient.forEach((e) => role(e.requirement, 'insufficient_information'));
  if (blocking.length > 0) {
    [...top, ...lower].forEach((e) => role(e.requirement, 'overridden'));
    return out('insufficient_information', 'missing_vehicle_facts', null, missingOf(blocking));
  }

  const agree = top.every((e) => sameObligation(e.requirement, top[0].requirement));
  if (!agree) {
    top.forEach((e) => role(e.requirement, 'conflicting'));
    lower.forEach((e) => role(e.requirement, 'overridden'));
    return out('conflicting', 'conflict_same_precedence');
  }
  const effective = top[0];
  role(effective.requirement, 'effective');
  top.slice(1).forEach((e) => role(e.requirement, 'supporting'));
  lower.forEach((e) => role(e.requirement, 'overridden'));
  const overrides = lower.some((e) => !sameObligation(e.requirement, effective.requirement));
  return out(
    'resolved',
    overrides ? 'market_override' : top.length > 1 ? 'agreeing_sources' : 'single_source',
    effective.requirement,
    [],
    effective.level,
  );
}

function missingOf(
  list: { applicability: RequirementApplicabilityResult }[],
): ApplicabilityDimension[] {
  return [...new Set(list.flatMap((e) => e.applicability.missing))].sort();
}

// ---------- due calculation ----------

export type RequirementDueState = 'ok' | 'upcoming' | 'due' | 'overdue' | 'completed';

export interface Completion {
  date: IsoDate;
  odometerKm: number;
}

export interface DueInput {
  requirement: MaintenanceRequirement;
  today: IsoDate;
  readings: readonly { date: IsoDate; km: number }[];
  inServiceDate?: IsoDate | null;
  /** Last recorded completion that satisfies THIS requirement (linked, never inferred). */
  lastCompletion?: Completion | null;
  upcomingKm?: number;
  upcomingDays?: number;
  minRateSpanDays?: number;
}

export type RequirementDue =
  | {
      status: 'computed';
      nextKm: number | null;
      remainingKm: number | null;
      nextDate: IsoDate | null;
      remainingDays: number | null;
      state: RequirementDueState;
      /** from the last completion, or the schedule from new (no recorded completion). */
      basis: 'last_completion' | 'from_new';
      /** Dimensions that could not be computed (e.g. no odometer reading). */
      unknown: ('distance' | 'time')[];
      /** When the distance limit is forecast to be reached — a forecast (צפי), never a fact. */
      kmForecast: Forecast<IsoDate> | null;
    }
  | { status: 'insufficient_information'; missing: ('odometer' | 'in_service_date')[] };

const nextMultipleAbove = (value: number, step: number) => (Math.floor(value / step) + 1) * step;

export function computeRequirementDue(input: DueInput): RequirementDue {
  const { requirement: r, today } = input;
  const iv = r.interval;
  const everyKm = distanceKm(iv.every);
  const firstKm = distanceKm(iv.first);
  const usesKm = iv.rule !== 'time_only' && everyKm != null;
  const usesTime = iv.rule !== 'distance_only' && iv.everyMonths != null;
  const sorted = [...input.readings].sort((a, b) => compareDates(a.date, b.date) || a.km - b.km);
  const current = sorted[sorted.length - 1] ?? null;
  const last = input.lastCompletion ?? null;

  if (!iv.repeats && last) {
    return {
      status: 'computed',
      nextKm: null,
      remainingKm: null,
      nextDate: null,
      remainingDays: null,
      state: 'completed',
      basis: 'last_completion',
      unknown: [],
      kmForecast: null,
    };
  }

  // Distance.
  let nextKm: number | null = null;
  if (usesKm) {
    if (last) nextKm = last.odometerKm + everyKm!;
    else if (current) {
      const first = firstKm ?? everyKm!;
      nextKm =
        current.km < first || !iv.repeats
          ? first
          : iv.anchor === 'zero'
            ? nextMultipleAbove(current.km, everyKm!)
            : first + nextMultipleAbove(current.km - first, everyKm!);
    }
  }
  // Time.
  let nextDate: IsoDate | null = null;
  if (usesTime) {
    if (last) nextDate = addMonths(last.date, iv.everyMonths!);
    else if (input.inServiceDate) {
      let d = addMonths(input.inServiceDate, iv.firstMonths ?? iv.everyMonths!);
      // From new with no recorded completion: the next scheduled point not yet passed.
      if (iv.repeats && iv.anchor === 'zero' && compareDates(d, today) <= 0) {
        d = addMonths(input.inServiceDate, iv.everyMonths!);
      }
      while (iv.repeats && compareDates(d, today) <= 0) d = addMonths(d, iv.everyMonths!);
      nextDate = d;
    }
  }

  const unknown: ('distance' | 'time')[] = [];
  if (usesKm && nextKm == null) unknown.push('distance');
  if (usesTime && nextDate == null) unknown.push('time');
  if ((usesKm ? nextKm == null : true) && (usesTime ? nextDate == null : true)) {
    const missing: ('odometer' | 'in_service_date')[] = [];
    if (usesKm && !current) missing.push('odometer');
    if (usesTime && !last && !input.inServiceDate) missing.push('in_service_date');
    return { status: 'insufficient_information', missing };
  }

  const remainingKm = nextKm != null && current ? nextKm - current.km : null;
  const remainingDays = nextDate != null ? daysBetween(today, nextDate) : null;
  const upKm = input.upcomingKm ?? 1500;
  const upDays = input.upcomingDays ?? 30;
  const past =
    (remainingKm != null && remainingKm < 0) || (remainingDays != null && remainingDays < 0);
  const atLimit =
    (remainingKm != null && remainingKm <= 0) || (remainingDays != null && remainingDays <= 0);
  const soon =
    (remainingKm != null && remainingKm <= upKm) ||
    (remainingDays != null && remainingDays <= upDays);
  // "Overdue" only against a recorded completion: missing history is not a skipped service.
  const state: RequirementDueState = past
    ? last
      ? 'overdue'
      : 'due'
    : atLimit
      ? 'due'
      : soon
        ? 'upcoming'
        : 'ok';

  const rate = drivingRate(sorted, input.minRateSpanDays ?? 30);
  const kmForecast: Forecast<IsoDate> | null =
    rate && current && nextKm != null
      ? {
          kind: 'forecast',
          value: addDays(current.date, Math.ceil(Math.max(0, nextKm - current.km) / rate.value)),
          basis: rate.basis,
        }
      : null;

  return {
    status: 'computed',
    nextKm,
    remainingKm,
    nextDate,
    remainingDays,
    state,
    basis: last ? 'last_completion' : 'from_new',
    unknown,
    kmForecast,
  };
}
