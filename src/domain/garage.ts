import {
  issue,
  newMeta,
  touch,
  validate,
  type AlertId,
  type DeferredItemId,
  type DocumentId,
  type EntityMeta,
  type GarageRecommendationId,
  type IdGenerator,
  type IntervalId,
  type IsoDate,
  type MaintenanceItemId,
  type OdometerReadingId,
  type Result,
  type ScheduleId,
  type ServiceEventId,
  type Timestamp,
  type VehicleId,
  ok,
  fail,
} from './core';

/**
 * Garage recommendations, deferred items and alerts (T041).
 * Invariant 5: a garage recommendation is its own type — it cannot be turned into a
 * MaintenanceItem (manufacturer requirement) by any function in the domain.
 */

export interface GarageRecommendation extends EntityMeta {
  id: GarageRecommendationId;
  vehicleId: VehicleId;
  text: string;
  date: IsoDate;
  garageName: string | null;
  /** Invoice or garage document the note came from, if any. */
  sourceDocumentId: DocumentId | null;
  authority: 'garage_document' | 'user_report';
}

export function createGarageRecommendation(
  input: Omit<GarageRecommendation, 'id' | 'authority' | keyof EntityMeta>,
  ids: IdGenerator,
  now: Timestamp,
): Result<GarageRecommendation> {
  return validate(
    [!input.text.trim() && issue('garage.text', 'Recommendation text is required', 'text')],
    () => ({
      ...input,
      text: input.text.trim(),
      authority: input.sourceDocumentId ? ('garage_document' as const) : ('user_report' as const),
      id: ids.next<'GarageRecommendation'>(),
      ...newMeta(now),
    }),
  );
}

/** A manufacturer item consciously not performed at a service, to be done later. */
export interface DeferredItem extends EntityMeta {
  id: DeferredItemId;
  vehicleId: VehicleId;
  maintenanceItemId: MaintenanceItemId;
  deferredAt: IsoDate;
  serviceEventId: ServiceEventId | null;
  reason: string | null;
  resolvedByServiceEventId: ServiceEventId | null;
}

// ---------- Alerts ----------

export type AlertKind = 'upcoming' | 'overdue' | 'deferred' | 'stale_odometer';
export type AlertStatus = 'active' | 'handled' | 'deferred';

/** Explainability: exactly what data an alert rests on (spec §14). */
export interface AlertBasis {
  scheduleId?: ScheduleId;
  intervalId?: IntervalId;
  maintenanceItemId?: MaintenanceItemId;
  odometerReadingId?: OdometerReadingId;
  lastServiceEventId?: ServiceEventId;
  deferredItemId?: DeferredItemId;
  /** Machine-readable facts used for the decision (e.g. remainingKm, daysSinceReading). */
  facts: Record<string, number | string>;
}

export interface Alert extends EntityMeta {
  id: AlertId;
  vehicleId: VehicleId;
  kind: AlertKind;
  status: AlertStatus;
  basis: AlertBasis;
  raisedAt: Timestamp;
  snoozedUntil: IsoDate | null;
}

export function createAlert(
  input: { vehicleId: VehicleId; kind: AlertKind; basis: AlertBasis },
  ids: IdGenerator,
  now: Timestamp,
): Result<Alert> {
  const b = input.basis;
  return validate(
    [
      (input.kind === 'upcoming' || input.kind === 'overdue') &&
        (!b.scheduleId || !b.intervalId) &&
        issue('alert.basis', 'Maintenance alerts must reference a verified schedule interval'),
      input.kind === 'deferred' &&
        !b.deferredItemId &&
        issue('alert.basis', 'Deferred alert needs its item'),
      input.kind === 'stale_odometer' &&
        !b.odometerReadingId &&
        issue('alert.basis', 'Stale-odometer alert needs the reading'),
    ],
    () => ({
      id: ids.next<'Alert'>(),
      vehicleId: input.vehicleId,
      kind: input.kind,
      status: 'active' as const,
      basis: input.basis,
      raisedAt: now,
      snoozedUntil: null,
      ...newMeta(now),
    }),
  );
}

export function handleAlert(a: Alert, now: Timestamp): Result<Alert> {
  if (a.status === 'handled') return fail(issue('alert.handled', 'Alert already handled'));
  return ok({ ...a, status: 'handled', ...touch(a, now) });
}

export function snoozeAlert(a: Alert, until: IsoDate, now: Timestamp): Result<Alert> {
  if (a.status === 'handled') return fail(issue('alert.handled', 'Alert already handled'));
  if (until <= now.slice(0, 10))
    return fail(issue('alert.snooze', 'Snooze date must be in the future'));
  return ok({ ...a, status: 'deferred', snoozedUntil: until, ...touch(a, now) });
}
