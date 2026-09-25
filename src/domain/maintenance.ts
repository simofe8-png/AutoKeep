import {
  issue,
  newMeta,
  validate,
  type EntityMeta,
  type IdGenerator,
  type IntervalId,
  type MaintenanceItemId,
  type Result,
  type ScheduleId,
  type Timestamp,
  type VehicleId,
} from './core';
import {
  decideVerification,
  type Evidence,
  type SourceReference,
  type VerificationRecord,
} from './provenance';

/** Maintenance schedule / interval / item (T038). */

export type ActionType = 'inspection' | 'replacement' | 'other';
export const ACTION_TYPES: readonly ActionType[] = ['inspection', 'replacement', 'other'];

/**
 * How the manufacturer combines distance and time for an interval.
 *  - earliest_of: due when either the distance or the time limit is reached first
 *  - distance_only / time_only: a single dimension
 */
export type IntervalRule = 'earliest_of' | 'distance_only' | 'time_only';

export interface MaintenanceItem {
  id: MaintenanceItemId;
  title: string;
  actionType: ActionType;
  /** What the manufacturer states (from the source; never AI-authored). */
  manufacturerText: string;
  reference: SourceReference;
}

export interface MaintenanceInterval {
  id: IntervalId;
  label: string;
  rule: IntervalRule;
  /** Repeat every N km (if distance applies). */
  everyKm?: number;
  /** Repeat every N months (if time applies). */
  everyMonths?: number;
  /** Optional first occurrence differing from the repeat (e.g. first service at 1,000 km). */
  firstAtKm?: number;
  firstAtMonths?: number;
  items: MaintenanceItem[];
}

export interface Applicability {
  /** Identity fields the source was matched on (manufacturer/model/year/engine/…) */
  matchedOn: string[];
  /** The source is proven to apply to this exact vehicle version. */
  exact: boolean;
}

export interface MaintenanceSchedule extends EntityMeta {
  id: ScheduleId;
  vehicleId: VehicleId;
  intervals: MaintenanceInterval[];
  evidence: Evidence[];
  applicability: Applicability;
  verification: VerificationRecord;
}

function intervalIssues(i: MaintenanceInterval, idx: number) {
  const f = `intervals[${idx}]`;
  const positive = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n > 0);
  return [
    i.rule === 'earliest_of' &&
      (i.everyKm === undefined || i.everyMonths === undefined) &&
      issue('interval.earliestOf', 'earliest_of needs both distance and time', f),
    i.rule === 'distance_only' &&
      i.everyKm === undefined &&
      issue('interval.distance', 'Missing distance', f),
    i.rule === 'time_only' &&
      i.everyMonths === undefined &&
      issue('interval.time', 'Missing time', f),
    (!positive(i.everyKm) ||
      !positive(i.everyMonths) ||
      !positive(i.firstAtKm) ||
      !positive(i.firstAtMonths)) &&
      issue('interval.values', 'Interval values must be positive integers', f),
    i.items.length === 0 && issue('interval.items', 'Interval has no items', f),
    ...i.items.map(
      (item, j) =>
        (!item.title.trim() || !item.manufacturerText.trim()) &&
        issue('item.text', 'Item requires title and manufacturer text', `${f}.items[${j}]`),
    ),
  ];
}

export interface NewScheduleInput {
  vehicleId: VehicleId;
  intervals: MaintenanceInterval[];
  evidence: Evidence[];
  applicability: Applicability;
}

/**
 * Builds a schedule. Its verification is DECIDED from evidence (never passed in): only an
 * exact-applicability manufacturer/importer source yields `verified` (invariants 1–4).
 */
export function createSchedule(
  input: NewScheduleInput,
  ids: IdGenerator,
  now: Timestamp,
): Result<MaintenanceSchedule> {
  const evidence = input.evidence.map((e) => ({
    ...e,
    exactApplicability: e.exactApplicability && input.applicability.exact,
  }));
  return validate(
    [
      input.intervals.length === 0 && issue('schedule.empty', 'Schedule has no intervals'),
      ...input.intervals.flatMap(intervalIssues),
    ],
    () => ({
      id: ids.next<'Schedule'>(),
      vehicleId: input.vehicleId,
      intervals: input.intervals,
      evidence,
      applicability: input.applicability,
      verification: decideVerification('maintenance_requirement', evidence, now),
      ...newMeta(now),
    }),
  );
}

/** Professional recommendations may only come from a verified schedule. */
export function usableSchedule(
  s: MaintenanceSchedule | null | undefined,
): MaintenanceSchedule | null {
  return s && s.verification.state === 'verified' ? s : null;
}
