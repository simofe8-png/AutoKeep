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

/**
 * T129: a manufacturer item consciously not performed at a service. It stays open (and raises a
 * "deferred" alert) until a later service performs the item.
 */
export function createDeferredItem(
  input: {
    vehicleId: VehicleId;
    maintenanceItemId: MaintenanceItemId;
    deferredAt: IsoDate;
    serviceEventId: ServiceEventId | null;
    reason?: string | null;
  },
  ids: IdGenerator,
  now: Timestamp,
): DeferredItem {
  return {
    id: ids.next<'DeferredItem'>(),
    vehicleId: input.vehicleId,
    maintenanceItemId: input.maintenanceItemId,
    deferredAt: input.deferredAt,
    serviceEventId: input.serviceEventId,
    reason: input.reason?.trim() || null,
    resolvedByServiceEventId: null,
    ...newMeta(now),
  };
}

/** A later service performed the deferred item. */
export function resolveDeferredItem(
  d: DeferredItem,
  byServiceEventId: ServiceEventId,
  now: Timestamp,
): Result<DeferredItem> {
  if (d.resolvedByServiceEventId) return fail(issue('deferred.resolved', 'Already resolved'));
  return ok({ ...d, resolvedByServiceEventId: byServiceEventId, ...touch(d, now) });
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

/** The alert's condition no longer holds (e.g. the service was recorded): resolved, not deleted. */
export function resolveAlert(a: Alert, now: Timestamp): Result<Alert> {
  if (a.status === 'handled') return fail(issue('alert.handled', 'Alert already handled'));
  return ok({
    ...a,
    status: 'handled',
    snoozedUntil: null,
    basis: { ...a.basis, facts: { ...a.basis.facts, resolution: 'condition_cleared' } },
    ...touch(a, now),
  });
}

/** A snooze has ended while the condition still holds: the alert is active again. */
export function reactivateAlert(a: Alert, now: Timestamp): Result<Alert> {
  if (a.status !== 'deferred') return fail(issue('alert.notSnoozed', 'Alert is not snoozed'));
  return ok({ ...a, status: 'active', snoozedUntil: null, ...touch(a, now) });
}

export function snoozeAlert(
  a: Alert,
  until: IsoDate,
  now: Timestamp,
  /** The user's local date (see UserConfirmation.today); the UTC date is only a fallback. */
  today: IsoDate = now.slice(0, 10) as IsoDate,
): Result<Alert> {
  if (a.status === 'handled') return fail(issue('alert.handled', 'Alert already handled'));
  if (until <= today) return fail(issue('alert.snooze', 'Snooze date must be in the future'));
  return ok({ ...a, status: 'deferred', snoozedUntil: until, ...touch(a, now) });
}
