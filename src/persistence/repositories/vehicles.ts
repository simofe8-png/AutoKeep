import {
  createLocalProfile,
  type IdGenerator,
  type LocalProfile,
  type OdometerReading,
  type ProfileId,
  type RegistrationNumber,
  type Timestamp,
  type Vehicle,
  type VehicleId,
  type Vin,
} from '@/domain';

import { atomic, ConcurrencyError, fromJson, toJson, type Executor } from './base';

// ---------- Profiles ----------

interface ProfileRow {
  id: string;
  account_user_id: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

export class ProfileRepository {
  constructor(private readonly db: Executor) {}

  /**
   * This device's own profile, created on first use (no registration needed). Other devices'
   * profiles may arrive through sync, so the device's profile id is pinned in settings.
   */
  async getOrCreate(ids: IdGenerator, now: Timestamp): Promise<LocalProfile> {
    const settings = new SettingsRepository(this.db);
    const pinned = await settings.get<string>('deviceProfileId');
    const existing = pinned
      ? await this.db.first<ProfileRow>('SELECT * FROM profiles WHERE id = ?', [pinned])
      : await this.db.first<ProfileRow>('SELECT * FROM profiles ORDER BY created_at LIMIT 1');
    if (existing) {
      if (!pinned) await settings.set('deviceProfileId', existing.id, now);
      return {
        id: existing.id as ProfileId,
        accountUserId: existing.account_user_id,
        createdAt: existing.created_at as Timestamp,
        updatedAt: existing.updated_at as Timestamp,
        version: existing.version,
      };
    }
    const p = createLocalProfile(ids, now);
    await this.db.run(
      'INSERT INTO profiles (id, account_user_id, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?)',
      [p.id, p.accountUserId, p.createdAt, p.updatedAt, p.version],
    );
    await settings.set('deviceProfileId', p.id, now);
    return p;
  }
}

// ---------- Vehicles (T044) ----------

interface VehicleRow {
  id: string;
  owner_profile_id: string;
  type: Vehicle['type'];
  manufacturer: string;
  model: string;
  year: number;
  trim: string | null;
  model_code: string | null;
  engine: string | null;
  fuel: string | null;
  transmission: string | null;
  registration: string;
  vin: string | null;
  lifecycle: Vehicle['lifecycle'];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

const opt = (s: string | null) => s ?? undefined;

function toVehicle(r: VehicleRow): Vehicle {
  return {
    id: r.id as VehicleId,
    ownerProfileId: r.owner_profile_id as ProfileId,
    type: r.type,
    identity: {
      manufacturer: r.manufacturer,
      model: r.model,
      year: r.year,
      trim: opt(r.trim),
      modelCode: opt(r.model_code),
      engine: opt(r.engine),
      fuel: opt(r.fuel),
      transmission: opt(r.transmission),
    },
    registration: r.registration as RegistrationNumber,
    vin: r.vin as Vin | null,
    lifecycle: r.lifecycle,
    archivedAt: r.archived_at as Timestamp | null,
    createdAt: r.created_at as Timestamp,
    updatedAt: r.updated_at as Timestamp,
    version: r.version,
  };
}

function vehicleParams(v: Vehicle) {
  const i = v.identity;
  return [
    v.ownerProfileId,
    v.type,
    i.manufacturer,
    i.model,
    i.year,
    i.trim ?? null,
    i.modelCode ?? null,
    i.engine ?? null,
    i.fuel ?? null,
    i.transmission ?? null,
    v.registration,
    v.vin,
    v.lifecycle,
    v.archivedAt,
  ];
}

/** Row counts that a permanent deletion would remove (shown to the user before confirming). */
export interface DeletionPreview {
  serviceEvents: number;
  documents: number;
  odometerReadings: number;
  alerts: number;
  garageRecommendations: number;
}

export class VehicleRepository {
  constructor(private readonly db: Executor) {}

  async insert(v: Vehicle): Promise<void> {
    await this.db.run(
      `INSERT INTO vehicles (owner_profile_id, type, manufacturer, model, year, trim, model_code, engine,
         fuel, transmission, registration, vin, lifecycle, archived_at, id, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [...vehicleParams(v), v.id, v.createdAt, v.updatedAt, v.version],
    );
  }

  /** Saves a new version of the vehicle; `v.version` must be exactly one above the stored row. */
  async update(v: Vehicle): Promise<void> {
    const r = await this.db.run(
      `UPDATE vehicles SET owner_profile_id = ?, type = ?, manufacturer = ?, model = ?, year = ?, trim = ?,
         model_code = ?, engine = ?, fuel = ?, transmission = ?, registration = ?, vin = ?, lifecycle = ?,
         archived_at = ?, updated_at = ?, version = ?
       WHERE id = ? AND version = ?`,
      [...vehicleParams(v), v.updatedAt, v.version, v.id, v.version - 1],
    );
    if (r.changes !== 1) throw new ConcurrencyError('Vehicle', v.id);
  }

  async get(id: VehicleId): Promise<Vehicle | null> {
    const r = await this.db.first<VehicleRow>('SELECT * FROM vehicles WHERE id = ?', [id]);
    return r ? toVehicle(r) : null;
  }

  async list(options: { includeArchived?: boolean } = {}): Promise<Vehicle[]> {
    const rows = await this.db.all<VehicleRow>(
      options.includeArchived
        ? 'SELECT * FROM vehicles ORDER BY created_at, id'
        : "SELECT * FROM vehicles WHERE lifecycle = 'active' ORDER BY created_at, id",
    );
    return rows.map(toVehicle);
  }

  async deletionPreview(id: VehicleId): Promise<DeletionPreview> {
    const count = async (table: string) =>
      (
        await this.db.first<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${table} WHERE vehicle_id = ?`,
          [id],
        )
      )?.n ?? 0;
    return {
      serviceEvents: await count('service_events'),
      documents: await count('documents'),
      odometerReadings: await count('odometer_readings'),
      alerts: await count('alerts'),
      garageRecommendations: await count('garage_recommendations'),
    };
  }

  /**
   * Controlled permanent deletion (separate from archive, invariant 20). Removes the vehicle and all
   * of its vehicle-scoped rows atomically, and clears it as the active vehicle.
   */
  async deletePermanently(id: VehicleId): Promise<void> {
    await atomic(this.db, async (tx) => {
      const r = await tx.run('DELETE FROM vehicles WHERE id = ?', [id]);
      if (r.changes !== 1) throw new Error(`Vehicle ${id} not found`);
      const active = await tx.first<{ value_json: string }>(
        "SELECT value_json FROM settings WHERE key = 'activeVehicleId'",
      );
      if (active && fromJson<string>(active.value_json) === id) {
        await tx.run("DELETE FROM settings WHERE key = 'activeVehicleId'");
      }
    });
  }
}

// ---------- Odometer (T045) ----------

interface ReadingRow {
  id: string;
  vehicle_id: string;
  value_km: number;
  measured_at: string;
  source: OdometerReading['source'];
  created_at: string;
  updated_at: string;
  version: number;
}

const toReading = (r: ReadingRow): OdometerReading => ({
  id: r.id as OdometerReading['id'],
  vehicleId: r.vehicle_id as VehicleId,
  valueKm: r.value_km,
  measuredAt: r.measured_at as OdometerReading['measuredAt'],
  source: r.source,
  createdAt: r.created_at as Timestamp,
  updatedAt: r.updated_at as Timestamp,
  version: r.version,
});

export class OdometerRepository {
  constructor(private readonly db: Executor) {}

  async add(r: OdometerReading): Promise<void> {
    await this.db.run(
      `INSERT INTO odometer_readings (id, vehicle_id, value_km, measured_at, source, created_at, updated_at, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [r.id, r.vehicleId, r.valueKm, r.measuredAt, r.source, r.createdAt, r.updatedAt, r.version],
    );
  }

  /** Readings of ONE vehicle, oldest first. */
  async listForVehicle(vehicleId: VehicleId): Promise<OdometerReading[]> {
    const rows = await this.db.all<ReadingRow>(
      'SELECT * FROM odometer_readings WHERE vehicle_id = ? ORDER BY measured_at, created_at',
      [vehicleId],
    );
    return rows.map(toReading);
  }

  async latest(vehicleId: VehicleId): Promise<OdometerReading | null> {
    const r = await this.db.first<ReadingRow>(
      `SELECT * FROM odometer_readings WHERE vehicle_id = ?
       ORDER BY measured_at DESC, created_at DESC, value_km DESC LIMIT 1`,
      [vehicleId],
    );
    return r ? toReading(r) : null;
  }
}

// ---------- Settings & active vehicle (T044/T048) ----------

export class SettingsRepository {
  constructor(private readonly db: Executor) {}

  async get<T>(key: string): Promise<T | null> {
    const r = await this.db.first<{ value_json: string }>(
      'SELECT value_json FROM settings WHERE key = ?',
      [key],
    );
    return r ? fromJson<T>(r.value_json) : null;
  }

  async set(key: string, value: unknown, now: Timestamp): Promise<void> {
    await this.db.run(
      `INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [key, toJson(value), now],
    );
  }

  async remove(key: string): Promise<void> {
    await this.db.run('DELETE FROM settings WHERE key = ?', [key]);
  }
}

/**
 * Persisted active-vehicle context. Switching only changes this pointer — never ownership or
 * data (invariant 15). Resolves to an existing, non-archived vehicle or null.
 */
export class ActiveVehicleStore {
  private readonly settings: SettingsRepository;
  private readonly vehicles: VehicleRepository;

  constructor(db: Executor) {
    this.settings = new SettingsRepository(db);
    this.vehicles = new VehicleRepository(db);
  }

  async get(): Promise<VehicleId | null> {
    const id = await this.settings.get<string>('activeVehicleId');
    if (id) {
      const v = await this.vehicles.get(id as VehicleId);
      if (v && v.lifecycle === 'active') return v.id;
    }
    const first = (await this.vehicles.list())[0];
    return first?.id ?? null;
  }

  async set(id: VehicleId, now: Timestamp): Promise<void> {
    const v = await this.vehicles.get(id);
    if (!v || v.lifecycle !== 'active')
      throw new Error('Only an existing active vehicle can be selected');
    await this.settings.set('activeVehicleId', id, now);
  }
}
