import {
  addMonths,
  compareDates,
  daysBetween,
  addDays,
  type DeferredItem,
  type IsoDate,
  type MaintenanceInterval,
  type MaintenanceItem,
  type MaintenanceItemId,
  type MaintenanceSchedule,
  type OdometerReading,
  type ServiceEvent,
  type ServiceEventId,
} from '@/domain';

/**
 * Deterministic maintenance engine (M12, spec §7). Pure: no I/O, no clock — `today` is injected.
 * It computes only from a VERIFIED schedule, recorded history and odometer readings. Anything it
 * cannot establish is reported as unknown; forecasts are a separate, explicitly typed value.
 */

// ---------- types ----------

export type DueStatus = 'ok' | 'upcoming' | 'overdue';

/** A value derived from the driving rate — never a fact; the UI must label it צפי. */
export interface Forecast<T> {
  kind: 'forecast';
  value: T;
  basis: { kmPerDay: number; readings: number; spanDays: number };
}

/** How the next due point was established (explainability). */
export type DueBasis =
  | 'last_service' // from the last recorded performance of this item
  | 'first_service' // the schedule's first-occurrence value, no history
  | 'schedule_milestone' // next schedule multiple, no recorded service for this item
  | 'deferred'; // explicitly deferred at a service: due now

export interface ItemDue {
  item: MaintenanceItem;
  intervalId: MaintenanceInterval['id'];
  intervalLabel: string;
  rule: MaintenanceInterval['rule'];
  basis: DueBasis;
  lastPerformed: { serviceEventId: ServiceEventId; date: IsoDate; odometerKm: number } | null;
  dueKm: number | null;
  dueDate: IsoDate | null;
  remainingKm: number | null;
  remainingDays: number | null;
  /** When the distance limit is forecast to be reached (never presented as a fact). */
  kmDueForecast: Forecast<IsoDate> | null;
  status: DueStatus;
  /** Time dimension could not be computed (no history and no in-service date). */
  timeUnknown: boolean;
  /**
   * Status is not asserted as "overdue" when the vehicle simply has no recorded service for this
   * item: missing history is not evidence that maintenance was skipped.
   */
  historyMissing: boolean;
}

export interface NextService {
  label: string;
  dueKm: number | null;
  dueDate: IsoDate | null;
  remainingKm: number | null;
  remainingDays: number | null;
  forecastDate: Forecast<IsoDate> | null;
  status: DueStatus;
  items: ItemDue[];
}

export type EngineResult =
  | { status: 'schedule_unavailable'; reason: 'no_schedule' | 'not_verified' }
  | {
      status: 'computed';
      items: ItemDue[];
      next: NextService | null;
      odometer: { km: number; measuredAt: IsoDate; stale: boolean; ageDays: number } | null;
      drivingRate: Forecast<number> | null;
    };

export interface EngineThresholds {
  upcomingKm: number;
  upcomingDays: number;
  /** A reading older than this impairs distance-based calculation. */
  staleOdometerDays: number;
  /** Items due within this window of the earliest item are grouped into one garage visit. */
  bundleKm: number;
  bundleDays: number;
  /** Minimum data for a driving-rate forecast. */
  minRateSpanDays: number;
}

export const DEFAULT_THRESHOLDS: EngineThresholds = {
  upcomingKm: 1500,
  upcomingDays: 30,
  staleOdometerDays: 60,
  bundleKm: 1500,
  bundleDays: 45,
  minRateSpanDays: 30,
};

export interface EngineInput {
  today: IsoDate;
  schedule: MaintenanceSchedule | null;
  history: readonly ServiceEvent[];
  readings: readonly OdometerReading[];
  deferred: readonly DeferredItem[];
  /** First registration / on-road date (e.g. from the official registry), if known. */
  inServiceDate?: IsoDate | null;
  thresholds?: Partial<EngineThresholds>;
}

// ---------- T100: driving rate (forecast only) ----------

interface Point {
  date: IsoDate;
  km: number;
}

/** Average km/day between the earliest and latest points, if the span is long enough. */
export function drivingRate(
  points: readonly Point[],
  minSpanDays: number,
): Forecast<number> | null {
  const sorted = [...points].sort((a, b) => compareDates(a.date, b.date) || a.km - b.km);
  if (sorted.length < 2) return null;
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = daysBetween(first.date, last.date);
  const km = last.km - first.km;
  if (span < minSpanDays || km <= 0) return null;
  const kmPerDay = km / span;
  return {
    kind: 'forecast',
    value: kmPerDay,
    basis: { kmPerDay, readings: sorted.length, spanDays: span },
  };
}

function forecastDateForKm(
  targetKm: number,
  from: Point,
  rate: Forecast<number> | null,
): Forecast<IsoDate> | null {
  if (!rate) return null;
  const days = Math.ceil(Math.max(0, targetKm - from.km) / rate.value);
  return { kind: 'forecast', value: addDays(from.date, days), basis: rate.basis };
}

// ---------- T098: history reconciliation ----------

/** Last recorded performance of a manufacturer item (linked by id; unlisted actions never count). */
export function lastPerformance(
  itemId: MaintenanceItemId,
  history: readonly ServiceEvent[],
): { serviceEventId: ServiceEventId; date: IsoDate; odometerKm: number } | null {
  let best: { serviceEventId: ServiceEventId; date: IsoDate; odometerKm: number } | null = null;
  for (const e of history) {
    const done = e.actions.some((a) => a.performed && a.maintenanceItemId === itemId);
    if (!done) continue;
    if (
      !best ||
      compareDates(e.date, best.date) > 0 ||
      (e.date === best.date && e.odometerKm > best.odometerKm)
    ) {
      best = { serviceEventId: e.id, date: e.date, odometerKm: e.odometerKm };
    }
  }
  return best;
}

/** A deferral is open until a LATER service performs the item. */
export function openDeferral(
  itemId: MaintenanceItemId,
  deferred: readonly DeferredItem[],
  last: { date: IsoDate } | null,
): DeferredItem | null {
  const open = deferred
    .filter((d) => d.maintenanceItemId === itemId && d.resolvedByServiceEventId === null)
    .filter((d) => !last || compareDates(last.date, d.deferredAt) <= 0)
    .sort((a, b) => compareDates(b.deferredAt, a.deferredAt));
  return open[0] ?? null;
}

// ---------- T095–T097: per-item due computation ----------

function nextMultipleAbove(value: number, step: number): number {
  return (Math.floor(value / step) + 1) * step;
}

function computeItem(
  item: MaintenanceItem,
  interval: MaintenanceInterval,
  input: EngineInput,
  t: EngineThresholds,
  current: Point | null,
  rate: Forecast<number> | null,
): ItemDue {
  const last = lastPerformance(item.id, input.history);
  const deferral = openDeferral(item.id, input.deferred, last);
  const usesKm = interval.rule !== 'time_only';
  const usesTime = interval.rule !== 'distance_only';

  let basis: DueBasis;
  let dueKm: number | null = null;
  let dueDate: IsoDate | null = null;
  let timeUnknown = false;

  if (deferral) {
    // Consciously postponed at a service: due now.
    basis = 'deferred';
    dueKm = usesKm ? (current?.km ?? null) : null;
    dueDate = deferral.deferredAt;
  } else if (last) {
    basis = 'last_service';
    // T095 mileage: last performance + interval.
    if (usesKm && interval.everyKm) dueKm = last.odometerKm + interval.everyKm;
    // T096 time: last performance date + interval months.
    if (usesTime && interval.everyMonths) dueDate = addMonths(last.date, interval.everyMonths);
  } else if (interval.firstAtKm !== undefined || interval.firstAtMonths !== undefined) {
    basis = 'first_service';
    if (usesKm) dueKm = interval.firstAtKm ?? interval.everyKm ?? null;
    if (usesTime) {
      const months = interval.firstAtMonths ?? interval.everyMonths;
      if (input.inServiceDate && months) dueDate = addMonths(input.inServiceDate, months);
      else timeUnknown = true;
    }
  } else {
    basis = 'schedule_milestone';
    if (usesKm && interval.everyKm) dueKm = nextMultipleAbove(current?.km ?? 0, interval.everyKm);
    if (usesTime && interval.everyMonths) {
      if (input.inServiceDate) {
        const monthsSince =
          Math.floor(
            daysBetween(input.inServiceDate, input.today) / 30.4375 / interval.everyMonths + 1,
          ) * interval.everyMonths;
        dueDate = addMonths(input.inServiceDate, monthsSince);
        while (compareDates(dueDate, input.today) <= 0)
          dueDate = addMonths(dueDate, interval.everyMonths);
      } else timeUnknown = true;
    }
  }

  const remainingKm = dueKm !== null && current ? dueKm - current.km : null;
  const remainingDays = dueDate !== null ? daysBetween(input.today, dueDate) : null;
  const historyMissing = !last && !deferral;

  // T097 earliest-of: whichever limit is reached first determines the status.
  let status: DueStatus = 'ok';
  const kmOverdue = remainingKm !== null && remainingKm <= 0;
  const timeOverdue = remainingDays !== null && remainingDays <= 0;
  if (basis === 'deferred' || ((kmOverdue || timeOverdue) && !historyMissing)) status = 'overdue';
  else if (
    (remainingKm !== null && remainingKm <= t.upcomingKm) ||
    (remainingDays !== null && remainingDays <= t.upcomingDays) ||
    kmOverdue ||
    timeOverdue
  ) {
    status = 'upcoming';
  }

  return {
    item,
    intervalId: interval.id,
    intervalLabel: interval.label,
    rule: interval.rule,
    basis,
    lastPerformed: last,
    dueKm,
    dueDate,
    remainingKm,
    remainingDays,
    kmDueForecast:
      dueKm !== null && current && remainingKm !== null && remainingKm > 0
        ? forecastDateForKm(dueKm, current, rate)
        : null,
    status,
    timeUnknown,
    historyMissing,
  };
}

// ---------- T099: next-due / overdue aggregation ----------

/** Effective date an item becomes due: its date limit, or the forecast date for its km limit. */
function effectiveDate(d: ItemDue): IsoDate | null {
  const candidates = [d.dueDate, d.kmDueForecast?.value].filter((x): x is IsoDate => Boolean(x));
  return candidates.sort(compareDates)[0] ?? null;
}

const STATUS_RANK: Record<DueStatus, number> = { overdue: 0, upcoming: 1, ok: 2 };

function urgencyOrder(a: ItemDue, b: ItemDue): number {
  if (STATUS_RANK[a.status] !== STATUS_RANK[b.status])
    return STATUS_RANK[a.status] - STATUS_RANK[b.status];
  const ra = a.remainingKm ?? Number.POSITIVE_INFINITY;
  const rb = b.remainingKm ?? Number.POSITIVE_INFINITY;
  const da = effectiveDate(a);
  const db = effectiveDate(b);
  if (da && db && da !== db) return compareDates(da, db);
  return ra - rb;
}

function bundleNext(items: ItemDue[], t: EngineThresholds): NextService | null {
  const ranked = items.filter((i) => i.dueKm !== null || i.dueDate !== null).sort(urgencyOrder);
  const lead = ranked[0];
  if (!lead) return null;
  const leadDate = effectiveDate(lead);
  const bundle = ranked.filter((i) => {
    if (i === lead || i.status === 'overdue') return true;
    const kmClose =
      lead.dueKm !== null && i.dueKm !== null && Math.abs(i.dueKm - lead.dueKm) <= t.bundleKm;
    const d = effectiveDate(i);
    const dateClose =
      leadDate !== null && d !== null && Math.abs(daysBetween(leadDate, d)) <= t.bundleDays;
    return kmClose || dateClose;
  });
  const status = bundle.some((i) => i.status === 'overdue')
    ? 'overdue'
    : bundle.some((i) => i.status === 'upcoming')
      ? 'upcoming'
      : 'ok';
  return {
    label: lead.dueKm !== null ? `${lead.intervalLabel} · ${lead.dueKm}` : lead.intervalLabel,
    dueKm: lead.dueKm,
    dueDate: lead.dueDate,
    remainingKm: lead.remainingKm,
    remainingDays: lead.remainingDays,
    forecastDate: lead.kmDueForecast,
    status,
    items: bundle,
  };
}

// ---------- entry point ----------

export function computeMaintenance(input: EngineInput): EngineResult {
  const t = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  if (!input.schedule) return { status: 'schedule_unavailable', reason: 'no_schedule' };
  // Invariant 2/4: professional recommendations only from a verified schedule.
  if (input.schedule.verification.state !== 'verified') {
    return { status: 'schedule_unavailable', reason: 'not_verified' };
  }

  const points: Point[] = [
    ...input.readings.map((r) => ({ date: r.measuredAt, km: r.valueKm })),
    ...input.history.map((e) => ({ date: e.date, km: e.odometerKm })),
  ].filter((p) => compareDates(p.date, input.today) <= 0);
  const current =
    [...points].sort((a, b) => compareDates(b.date, a.date) || b.km - a.km)[0] ?? null;
  const rate = drivingRate(points, t.minRateSpanDays);

  const items = input.schedule.intervals.flatMap((iv) =>
    iv.items.map((item) => computeItem(item, iv, input, t, current, rate)),
  );
  const ageDays = current ? daysBetween(current.date, input.today) : 0;
  return {
    status: 'computed',
    items,
    next: bundleNext(items, t),
    odometer: current
      ? { km: current.km, measuredAt: current.date, stale: ageDays > t.staleOdometerDays, ageDays }
      : null,
    drivingRate: rate,
  };
}
