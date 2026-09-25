import {
  compareDates,
  issue,
  newMeta,
  ok,
  touch,
  validate,
  fail,
  type EntityMeta,
  type IdGenerator,
  type IsoDate,
  type OdometerReadingId,
  type ProfileId,
  type Result,
  type Timestamp,
  type VehicleId,
} from './core';

// ---------- Local profile / account (T036) ----------

/**
 * Local identity that exists before any account (registration never blocks first use).
 * `accountUserId` is set when the local data is adopted by an authenticated account (M08).
 */
export interface LocalProfile extends EntityMeta {
  id: ProfileId;
  accountUserId: string | null;
}

export function createLocalProfile(ids: IdGenerator, now: Timestamp): LocalProfile {
  return { id: ids.next<'Profile'>(), accountUserId: null, ...newMeta(now) };
}

// ---------- Vehicle identifiers ----------

export type VehicleType = 'car' | 'motorcycle' | 'scooter';
export const VEHICLE_TYPES: readonly VehicleType[] = ['car', 'motorcycle', 'scooter'];

/** Israeli-style registration: 5–8 digits, stored normalized (digits only), shown with dashes. */
export type RegistrationNumber = string & { readonly __reg: true };

export function parseRegistration(raw: string): RegistrationNumber | null {
  const digits = raw.replace(/[\s-]/g, '');
  return /^\d{5,8}$/.test(digits) ? (digits as RegistrationNumber) : null;
}

/** Display format: 7 digits → 12-345-67, 8 digits → 123-45-678, otherwise digits as-is. */
export function formatRegistration(reg: RegistrationNumber): string {
  if (reg.length === 7) return `${reg.slice(0, 2)}-${reg.slice(2, 5)}-${reg.slice(5)}`;
  if (reg.length === 8) return `${reg.slice(0, 3)}-${reg.slice(3, 5)}-${reg.slice(5)}`;
  return reg;
}

/** VIN / manufacturer identifier: 17 chars, no I/O/Q (ISO 3779). */
export type Vin = string & { readonly __vin: true };

export function parseVin(raw: string): Vin | null {
  const v = raw.trim().toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(v) ? (v as Vin) : null;
}

/** Presentation masking — only the final four characters are exposed (spec §4). */
export function maskVin(vin: Vin): string {
  return `${'•'.repeat(6)}${vin.slice(-4)}`;
}

// ---------- Vehicle ----------

export interface VehicleIdentity {
  manufacturer: string;
  model: string;
  year: number;
  trim?: string;
  modelCode?: string;
  engine?: string;
  fuel?: string;
  transmission?: string;
}

export type VehicleLifecycle = 'active' | 'archived';

export interface Vehicle extends EntityMeta {
  id: VehicleId;
  ownerProfileId: ProfileId;
  type: VehicleType;
  identity: VehicleIdentity;
  registration: RegistrationNumber;
  vin: Vin | null;
  lifecycle: VehicleLifecycle;
  archivedAt: Timestamp | null;
}

export interface NewVehicleInput {
  ownerProfileId: ProfileId;
  type: VehicleType;
  identity: VehicleIdentity;
  registration: string;
  vin?: string | null;
}

export function createVehicle(
  input: NewVehicleInput,
  ids: IdGenerator,
  now: Timestamp,
): Result<Vehicle> {
  const registration = parseRegistration(input.registration);
  const vin = input.vin ? parseVin(input.vin) : null;
  const year = input.identity.year;
  const currentYear = Number(now.slice(0, 4));
  return validate(
    [
      !VEHICLE_TYPES.includes(input.type) &&
        issue('vehicle.type', 'Unsupported vehicle type', 'type'),
      !input.identity.manufacturer.trim() &&
        issue('vehicle.manufacturer', 'Manufacturer is required', 'manufacturer'),
      !input.identity.model.trim() && issue('vehicle.model', 'Model is required', 'model'),
      (!Number.isInteger(year) || year < 1950 || year > currentYear + 1) &&
        issue('vehicle.year', 'Year is out of range', 'year'),
      !registration && issue('vehicle.registration', 'Invalid registration number', 'registration'),
      Boolean(input.vin) && !vin && issue('vehicle.vin', 'Invalid VIN', 'vin'),
    ],
    () => ({
      id: ids.next<'Vehicle'>(),
      ownerProfileId: input.ownerProfileId,
      type: input.type,
      identity: {
        ...input.identity,
        manufacturer: input.identity.manufacturer.trim(),
        model: input.identity.model.trim(),
      },
      registration: registration!,
      vin,
      lifecycle: 'active' as const,
      archivedAt: null,
      ...newMeta(now),
    }),
  );
}

/** Archive is not deletion (invariant 20): data, history and documents are untouched. */
export function archiveVehicle(v: Vehicle, now: Timestamp): Result<Vehicle> {
  if (v.lifecycle === 'archived')
    return fail(issue('vehicle.archived', 'Vehicle is already archived'));
  return ok({ ...v, lifecycle: 'archived', archivedAt: now, ...touch(v, now) });
}

export function restoreVehicle(v: Vehicle, now: Timestamp): Result<Vehicle> {
  if (v.lifecycle !== 'archived')
    return fail(issue('vehicle.notArchived', 'Vehicle is not archived'));
  return ok({ ...v, lifecycle: 'active', archivedAt: null, ...touch(v, now) });
}

// ---------- Odometer (independent per vehicle, invariant 17) ----------

export type OdometerSource = 'user' | 'service_event' | 'document' | 'onboarding';

export interface OdometerReading extends EntityMeta {
  id: OdometerReadingId;
  vehicleId: VehicleId;
  valueKm: number;
  measuredAt: IsoDate;
  source: OdometerSource;
}

export const MAX_ODOMETER_KM = 2_000_000;

export interface NewReadingInput {
  vehicleId: VehicleId;
  valueKm: number;
  measuredAt: IsoDate;
  source: OdometerSource;
  /** The user explicitly confirmed a reading lower than a previous one (e.g. cluster replaced). */
  allowDecrease?: boolean;
}

export function createOdometerReading(
  input: NewReadingInput,
  existing: readonly OdometerReading[],
  ids: IdGenerator,
  now: Timestamp,
): Result<OdometerReading> {
  const prior = latestReadingOnOrBefore(
    existing.filter((r) => r.vehicleId === input.vehicleId),
    input.measuredAt,
  );
  return validate(
    [
      (!Number.isInteger(input.valueKm) || input.valueKm < 0 || input.valueKm > MAX_ODOMETER_KM) &&
        issue('odometer.range', 'Odometer value is out of range', 'valueKm'),
      input.measuredAt > now.slice(0, 10) &&
        issue('odometer.future', 'Measurement date is in the future', 'measuredAt'),
      prior !== null &&
        input.valueKm < prior.valueKm &&
        !input.allowDecrease &&
        issue('odometer.decrease', 'Reading is lower than an earlier reading', 'valueKm'),
    ],
    () => ({
      id: ids.next<'OdometerReading'>(),
      vehicleId: input.vehicleId,
      valueKm: input.valueKm,
      measuredAt: input.measuredAt,
      source: input.source,
      ...newMeta(now),
    }),
  );
}

/** Most recent reading by measurement date, then by record time. */
export function latestReading(readings: readonly OdometerReading[]): OdometerReading | null {
  let best: OdometerReading | null = null;
  for (const r of readings) {
    if (
      !best ||
      compareDates(r.measuredAt, best.measuredAt) > 0 ||
      (r.measuredAt === best.measuredAt && r.createdAt > best.createdAt)
    ) {
      best = r;
    }
  }
  return best;
}

function latestReadingOnOrBefore(
  readings: readonly OdometerReading[],
  date: IsoDate,
): OdometerReading | null {
  return latestReading(readings.filter((r) => r.measuredAt <= date));
}
