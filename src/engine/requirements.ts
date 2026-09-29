import {
  addDays,
  addMonths,
  compareDates,
  daysBetween,
  distanceKm,
  isVerifiedRequirement,
  type RequirementApplicability,
  type ApplicabilityDimension,
  type RequirementApplicabilityResult,
  type IsoDate,
  type MaintenanceRequirement,
  type RequirementAuthority,
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
  return {
    verdict:
      mismatched.length > 0
        ? 'does_not_apply'
        : missing.length > 0
          ? 'insufficient_information'
          : 'applies',
    missing,
    mismatched,
    matched: pick('match'),
  };
}

// ---------- precedence ----------

/**
 * Explicit, deterministic precedence (lower wins):
 *  1. a source that names the vehicle's market beats one that only covers it as 'GLOBAL';
 *  2. then authority: importer (its market's official schedule) > manufacturer / the vehicle's
 *     own official booklet > official publication.
 * The Israeli override is therefore per task: an applicable verified IL importer requirement
 * wins for THAT task only; every other task resolves on its own evidence.
 */
const AUTHORITY_RANK: Record<RequirementAuthority, number> = {
  importer: 0,
  manufacturer: 1,
  vehicle_document: 1,
  official_publication: 2,
  user_report: 9,
  secondary: 9,
};

export function precedence(r: MaintenanceRequirement, f: VehicleFacts): [number, number] {
  const named =
    f.market != null &&
    (r.applicability.markets ?? []).some((m) => normCode(m) === normCode(f.market!));
  return [named ? 0 : 1, AUTHORITY_RANK[r.authority]];
}

const cmpPrecedence = (a: [number, number], b: [number, number]) => a[0] - b[0] || a[1] - b[1];

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
    (x.firstMonths ?? null) === (y.firstMonths ?? null)
  );
}

// ---------- resolution ----------

export type ConsideredRole =
  | 'effective'
  | 'supporting' // same obligation, same precedence as the effective one
  | 'overridden' // applicable but lower precedence (e.g. generic vs IL importer)
  | 'conflicting'
  | 'insufficient_information'
  | 'not_applicable'
  | 'unverified';

export interface Considered {
  requirement: MaintenanceRequirement;
  applicability: RequirementApplicabilityResult;
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
  status: ResolutionStatus;
  effective: MaintenanceRequirement | null;
  reason: ResolutionReason;
  /** Vehicle facts that would let this task resolve (asked of the user, never assumed). */
  missing: ApplicabilityDimension[];
  considered: Considered[];
}

/**
 * Resolves each task independently. Only verified requirements can become effective; an
 * insufficient-information requirement that could outrank (or tie with) the best applicable one
 * with a different obligation blocks resolution — choosing would be a guess.
 */
export function resolveRequirements(
  requirements: readonly MaintenanceRequirement[],
  facts: VehicleFacts,
): TaskResolution[] {
  const byTask = new Map<TaskCode, MaintenanceRequirement[]>();
  for (const r of requirements) byTask.set(r.task, [...(byTask.get(r.task) ?? []), r]);
  return [...byTask.keys()].sort().map((task) => resolveTask(task, byTask.get(task)!, facts));
}

function resolveTask(
  task: TaskCode,
  reqs: MaintenanceRequirement[],
  facts: VehicleFacts,
): TaskResolution {
  const evaluated = [...reqs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((requirement) => ({
      requirement,
      applicability: evaluateApplicability(requirement.applicability, facts),
      verified: isVerifiedRequirement(requirement),
    }));
  const considered: Considered[] = [];
  const role = (r: MaintenanceRequirement, rl: ConsideredRole) => {
    const e = evaluated.find((x) => x.requirement === r)!;
    considered.push({ requirement: r, applicability: e.applicability, role: rl });
  };

  const verified = evaluated.filter((e) => e.verified);
  const applicable = verified.filter((e) => e.applicability.verdict === 'applies');
  const insufficient = verified.filter(
    (e) => e.applicability.verdict === 'insufficient_information',
  );
  for (const e of evaluated) {
    if (!e.verified) role(e.requirement, 'unverified');
    else if (e.applicability.verdict === 'does_not_apply') role(e.requirement, 'not_applicable');
  }
  const out = (
    status: ResolutionStatus,
    reason: ResolutionReason,
    effective: MaintenanceRequirement | null = null,
    missing: ApplicabilityDimension[] = [],
  ): TaskResolution => ({ task, status, reason, effective, missing, considered });

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
    if (evaluated.some((e) => !e.verified && e.applicability.verdict !== 'does_not_apply')) {
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
  const effective = top[0].requirement;
  role(effective, 'effective');
  top.slice(1).forEach((e) => role(e.requirement, 'supporting'));
  lower.forEach((e) => role(e.requirement, 'overridden'));
  const overrides = lower.some((e) => !sameObligation(e.requirement, effective));
  return out(
    'resolved',
    overrides ? 'market_override' : top.length > 1 ? 'agreeing_sources' : 'single_source',
    effective,
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
