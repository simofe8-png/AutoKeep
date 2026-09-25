/**
 * Domain primitives: stable IDs, dates and validation results.
 * Pure TypeScript — no React, no I/O, no clock access (time is always passed in).
 */

// ---------- Stable IDs ----------

declare const brand: unique symbol;
export type Id<Tag extends string> = string & { readonly [brand]: Tag };

export type ProfileId = Id<'Profile'>;
export type VehicleId = Id<'Vehicle'>;
export type OdometerReadingId = Id<'OdometerReading'>;
export type DocumentId = Id<'Document'>;
export type ExtractionId = Id<'Extraction'>;
export type SourceId = Id<'Source'>;
export type ScheduleId = Id<'Schedule'>;
export type IntervalId = Id<'Interval'>;
export type MaintenanceItemId = Id<'MaintenanceItem'>;
export type ServiceEventId = Id<'ServiceEvent'>;
export type ServiceActionId = Id<'ServiceAction'>;
export type GarageRecommendationId = Id<'GarageRecommendation'>;
export type AlertId = Id<'Alert'>;
export type DeferredItemId = Id<'DeferredItem'>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/** Casts a validated UUID string to a typed id. Throws on malformed input (programming error). */
export function asId<Tag extends string>(value: string): Id<Tag> {
  if (!isUuid(value)) throw new Error(`Invalid id: ${value}`);
  return value as Id<Tag>;
}

/** Source of new stable ids (UUIDv4). Injected so the domain stays pure and tests deterministic. */
export interface IdGenerator {
  next<Tag extends string>(): Id<Tag>;
}

// ---------- Time ----------

/** Calendar date, ISO `YYYY-MM-DD` (no time zone). */
export type IsoDate = string & { readonly [brand]: 'IsoDate' };
/** Instant, ISO-8601 UTC timestamp. */
export type Timestamp = string & { readonly [brand]: 'Timestamp' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): IsoDate | null {
  const m = ISO_DATE.exec(value);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return value as IsoDate;
}

export function isoDate(value: string): IsoDate {
  const d = parseIsoDate(value);
  if (!d) throw new Error(`Invalid ISO date: ${value}`);
  return d;
}

export function timestamp(value: string): Timestamp {
  if (Number.isNaN(Date.parse(value)) || !value.includes('T')) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return value as Timestamp;
}

export function dateOf(ts: Timestamp): IsoDate {
  return ts.slice(0, 10) as IsoDate;
}

function toUtc(d: IsoDate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

/** Whole days from `a` to `b` (negative if b is before a). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

export function addDays(d: IsoDate, days: number): IsoDate {
  const dt = new Date(toUtc(d) + days * 86_400_000);
  return dt.toISOString().slice(0, 10) as IsoDate;
}

/**
 * Adds calendar months, clamping to the last day of the target month
 * (2026-01-31 + 1 month = 2026-02-28).
 */
export function addMonths(d: IsoDate, months: number): IsoDate {
  const [y, m, day] = d.split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const ty = y + Math.floor(targetMonthIndex / 12);
  const tm = ((targetMonthIndex % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(ty, tm, Math.min(day, lastDay)));
  return dt.toISOString().slice(0, 10) as IsoDate;
}

export function compareDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ---------- Validation ----------

export interface DomainIssue {
  code: string;
  field?: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: DomainIssue[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(...issues: DomainIssue[]): Result<T> {
  return { ok: false, issues };
}

/** Collects issues; returns ok(value()) only if none. */
export function validate<T>(
  issues: (DomainIssue | null | false | undefined)[],
  value: () => T,
): Result<T> {
  const found = issues.filter((i): i is DomainIssue => Boolean(i));
  return found.length > 0 ? { ok: false, issues: found } : ok(value());
}

export function issue(code: string, message: string, field?: string): DomainIssue {
  return { code, message, field };
}

// ---------- Vehicle scoping ----------

export interface VehicleScoped {
  vehicleId: VehicleId;
}

/**
 * Invariant 14/16: vehicle-scoped data explicitly belongs to one vehicle. Returns the records that
 * violate the expected scope (should be empty).
 */
export function outOfScope<T extends VehicleScoped>(
  records: readonly T[],
  vehicleId: VehicleId,
): T[] {
  return records.filter((r) => r.vehicleId !== vehicleId);
}

// ---------- Entity metadata (sync-ready) ----------

/** Every persisted entity carries a stable id and a monotonically increasing version (ADR-0002). */
export interface EntityMeta {
  createdAt: Timestamp;
  updatedAt: Timestamp;
  version: number;
}

export function newMeta(now: Timestamp): EntityMeta {
  return { createdAt: now, updatedAt: now, version: 1 };
}

export function touch(meta: EntityMeta, now: Timestamp): EntityMeta {
  return { createdAt: meta.createdAt, updatedAt: now, version: meta.version + 1 };
}
