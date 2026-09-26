import {
  asId,
  confirmServiceDraft,
  createAlert,
  createGarageRecommendation,
  createOdometerReading,
  createVehicle,
  handleAlert,
  isUuid,
  latestReading,
  type DomainIssue,
  type IdGenerator,
  type IsoDate,
  type LocalProfile,
  type Result,
  type SourceId,
  type Timestamp,
  type Vehicle,
  type VehicleId,
} from '@/domain';
import { alertCandidates, type AlertCandidate } from '@/engine/alerts';
import { computeMaintenance, type EngineResult } from '@/engine/maintenance';
import type { VehicleSummary } from '@/features/vehicles/types';
import {
  ActiveVehicleStore,
  AlertRepository,
  DeferredItemRepository,
  DocumentRepository,
  ExtractionRepository,
  GarageRecommendationRepository,
  lifecycle,
  migrate,
  MIGRATIONS,
  OdometerRepository,
  ProfileRepository,
  ScheduleRepository,
  ServiceRepository,
  SourceRepository,
  VehicleRepository,
  type SqlDatabase,
} from '@/persistence';

import { toBundle, toVehicleSummary, type VehicleRecords } from './adapters';
import type { GarageRecommendationVM, ServiceEventVM, VehicleDataBundle } from './types';

/**
 * Local (SQLite) data store behind the approved UI (M13). Reads load persisted domain records,
 * run the deterministic engine and map to view-models; writes go through domain constructors
 * (validation, provenance) and repositories. Every operation takes an explicit vehicle id.
 */

export interface Clock {
  now(): Timestamp;
  today(): IsoDate;
}

export const systemClock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
  today: () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` as IsoDate;
  },
};

export interface Snapshot {
  vehicles: VehicleSummary[];
  bundles: Record<string, VehicleDataBundle>;
  activeVehicleId: string | null;
}

/** Optional identity details captured at onboarding (beyond the display summary). */
export interface VehicleDetails {
  trim?: string;
  engine?: string;
  fuel?: string;
  vin?: string;
}

export class DomainError extends Error {
  constructor(readonly issues: DomainIssue[]) {
    super(issues.map((i) => i.code).join(', '));
  }
}

function must<T>(r: Result<T>): T {
  if (!r.ok) throw new DomainError(r.issues);
  return r.value;
}

/** Uses the id the UI already generated (a UUID) for the first entity, then falls back. */
function preferId(id: string, fallback: IdGenerator): IdGenerator {
  let used = !isUuid(id);
  return {
    next: <Tag extends string>() => {
      if (used) return fallback.next<Tag>();
      used = true;
      return asId<Tag>(id);
    },
  };
}

export class LocalStore {
  private constructor(
    private readonly db: SqlDatabase,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    readonly profile: LocalProfile,
  ) {}

  /** Opens the store: runs pending migrations and ensures this device's local profile. */
  static async open(db: SqlDatabase, ids: IdGenerator, clock: Clock): Promise<LocalStore> {
    await migrate(db, MIGRATIONS, clock.now);
    const profile = await new ProfileRepository(db).getOrCreate(ids, clock.now());
    return new LocalStore(db, ids, clock, profile);
  }

  // ---------- reads ----------

  async records(vehicle: Vehicle): Promise<VehicleRecords> {
    const id = vehicle.id;
    const schedule = await new ScheduleRepository(this.db).current(id);
    const sourceIds = [
      ...new Set(
        (schedule?.evidence ?? [])
          .map((e) => e.reference?.sourceId)
          .filter((s): s is SourceId => Boolean(s)),
      ),
    ];
    return {
      vehicle,
      readings: await new OdometerRepository(this.db).listForVehicle(id),
      schedule,
      sources: await new SourceRepository(this.db).getMany(sourceIds),
      history: await new ServiceRepository(this.db).list(id),
      documents: await new DocumentRepository(this.db).list(id),
      extractions: await new ExtractionRepository(this.db).listForVehicle(id),
      alerts: await new AlertRepository(this.db).list(id),
      garageRecommendations: await new GarageRecommendationRepository(this.db).list(id),
      deferred: await new DeferredItemRepository(this.db).listOpen(id),
    };
  }

  compute(rec: VehicleRecords): { result: EngineResult; candidates: AlertCandidate[] } {
    const today = this.clock.today();
    const result = computeMaintenance({
      today,
      schedule: rec.schedule,
      history: rec.history,
      readings: rec.readings,
      deferred: rec.deferred,
    });
    const candidates = alertCandidates({
      today,
      result,
      schedule: rec.schedule,
      deferred: rec.deferred,
      latestReading: latestReading(rec.readings),
    });
    return { result, candidates };
  }

  /**
   * Persists an alert for every justified candidate that has none yet, so its identity and
   * handled/snoozed status survive restarts and sync. Returns true if anything was added.
   */
  private async reconcileAlerts(rec: VehicleRecords, candidates: AlertCandidate[]) {
    const known = new Set(rec.alerts.map((a) => a.basis.facts.key));
    const repo = new AlertRepository(this.db);
    let added = false;
    for (const c of candidates) {
      if (known.has(c.key)) continue;
      const r = createAlert(
        { vehicleId: rec.vehicle.id, kind: c.kind, basis: c.basis },
        this.ids,
        this.clock.now(),
      );
      if (r.ok) {
        await repo.add(r.value);
        added = true;
      }
    }
    return added;
  }

  async snapshot(): Promise<Snapshot> {
    const vehicles = await new VehicleRepository(this.db).list({ includeArchived: true });
    const summaries: VehicleSummary[] = [];
    const bundles: Record<string, VehicleDataBundle> = {};
    for (const v of vehicles) {
      let rec = await this.records(v);
      const { result, candidates } = this.compute(rec);
      if (await this.reconcileAlerts(rec, candidates)) {
        rec = { ...rec, alerts: await new AlertRepository(this.db).list(v.id) };
      }
      summaries.push(toVehicleSummary(v, latestReading(rec.readings)));
      bundles[v.id] = toBundle(rec, result, candidates, this.clock.today());
    }
    const activeVehicleId = await new ActiveVehicleStore(this.db).get();
    return { vehicles: summaries, bundles, activeVehicleId };
  }

  // ---------- writes ----------

  async addVehicle(vm: VehicleSummary, details: VehicleDetails = {}): Promise<VehicleId> {
    const now = this.clock.now();
    const vehicle = must(
      createVehicle(
        {
          ownerProfileId: this.profile.id,
          type: vm.kind,
          identity: {
            manufacturer: vm.manufacturer,
            model: vm.model,
            year: vm.year,
            trim: details.trim?.trim() || undefined,
            engine: details.engine?.trim() || undefined,
            fuel: details.fuel?.trim() || undefined,
          },
          registration: vm.registration,
          vin: details.vin?.trim() || null,
        },
        preferId(vm.id, this.ids),
        now,
      ),
    );
    await this.db.transaction(async (tx) => {
      await new VehicleRepository(tx).insert(vehicle);
      if (vm.odometerKm > 0) {
        const reading = must(
          createOdometerReading(
            {
              vehicleId: vehicle.id,
              valueKm: vm.odometerKm,
              measuredAt: vm.odometerMeasuredAt as IsoDate,
              source: 'onboarding',
            },
            [],
            this.ids,
            now,
          ),
        );
        await new OdometerRepository(tx).add(reading);
      }
    });
    return vehicle.id;
  }

  async setActiveVehicle(id: string): Promise<void> {
    await new ActiveVehicleStore(this.db).set(id as VehicleId, this.clock.now());
  }

  async archiveVehicle(id: string): Promise<void> {
    must(await lifecycle.archive(this.db, id as VehicleId, this.clock.now()));
  }

  async restoreVehicle(id: string): Promise<void> {
    must(await lifecycle.restore(this.db, id as VehicleId, this.clock.now()));
  }

  async deleteVehicle(id: string): Promise<void> {
    await new VehicleRepository(this.db).deletePermanently(id as VehicleId);
  }

  async updateOdometer(vehicleId: string, km: number, measuredAt: string): Promise<void> {
    const repo = new OdometerRepository(this.db);
    const vid = vehicleId as VehicleId;
    const reading = must(
      createOdometerReading(
        { vehicleId: vid, valueKm: km, measuredAt: measuredAt as IsoDate, source: 'user' },
        await repo.listForVehicle(vid),
        this.ids,
        this.clock.now(),
      ),
    );
    await repo.add(reading);
  }

  /**
   * Stores a user-confirmed service (the review dialog is the explicit confirmation). A record
   * without its original document can only be a user report — it never claims garage evidence.
   */
  async addServiceEvent(vm: ServiceEventVM): Promise<void> {
    const now = this.clock.now();
    const vid = vm.vehicleId as VehicleId;
    const documentIds = vm.documentIds.filter(isUuid).map((d) => asId<'Document'>(d));
    const event = must(
      confirmServiceDraft(
        {
          vehicleId: vid,
          origin: vm.origin === 'document' && documentIds.length > 0 ? 'document' : 'manual',
          date: vm.date,
          odometerKm: vm.odometerKm,
          garageName: vm.garage ?? '',
          notes: vm.notes ?? '',
          actions: vm.actions.map((a) => ({
            title: a.title,
            actionType: a.actionType,
            performed: a.performed,
            maintenanceItemId:
              a.maintenanceItemId && isUuid(a.maintenanceItemId)
                ? asId<'MaintenanceItem'>(a.maintenanceItemId)
                : null,
            unlisted: a.unlisted,
          })),
          documentIds,
          extractionId: null,
        },
        { confirmedBy: 'user', confirmedAt: now },
        preferId(vm.id, this.ids),
      ),
    );
    await this.db.transaction(async (tx) => {
      await new ServiceRepository(tx).add(event);
      // The service odometer is also a reading (only if it does not contradict later readings).
      const odo = new OdometerRepository(tx);
      const reading = createOdometerReading(
        {
          vehicleId: vid,
          valueKm: event.odometerKm,
          measuredAt: event.date,
          source: 'service_event',
        },
        await odo.listForVehicle(vid),
        this.ids,
        now,
      );
      if (reading.ok) await odo.add(reading.value);
    });
  }

  async setAlertHandled(vehicleId: string, alertId: string): Promise<void> {
    const repo = new AlertRepository(this.db);
    const alert = await repo.get(vehicleId as VehicleId, alertId as never);
    if (!alert) throw new Error('Alert not found for this vehicle');
    await repo.update(must(handleAlert(alert, this.clock.now())));
  }

  async addGarageRecommendation(vm: GarageRecommendationVM): Promise<void> {
    const rec = must(
      createGarageRecommendation(
        {
          vehicleId: vm.vehicleId as VehicleId,
          text: vm.text,
          date: vm.date as IsoDate,
          garageName: vm.garage?.trim() || null,
          sourceDocumentId: null,
        },
        preferId(vm.id, this.ids),
        this.clock.now(),
      ),
    );
    await new GarageRecommendationRepository(this.db).add(rec);
  }
}
