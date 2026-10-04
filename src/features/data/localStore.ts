import {
  addDays,
  asId,
  confirmServiceDraft,
  createAlert,
  createDeferredItem,
  createDocument,
  createGarageRecommendation,
  createOdometerReading,
  createVehicle,
  updateVehicleDetails,
  type ExteriorPhase,
  type VehicleDetailsPatch,
  handleAlert,
  reactivateAlert,
  resolveAlert,
  resolveDeferredItem,
  snoozeAlert,
  isUuid,
  latestReading,
  type DomainIssue,
  type IdGenerator,
  type IsoDate,
  type LocalProfile,
  type Result,
  type SourceId,
  type Timestamp,
  type Id,
  type Vehicle,
  type VehicleDocument,
  type VehicleId,
  confirmOwnership,
  documentFromUpload,
  type UsageCondition,
} from '@/domain';
import { alertCandidates, planAlerts, type AlertCandidate } from '@/engine/alerts';
import { computeMaintenance, type EngineResult } from '@/engine/maintenance';
import { adoptLocalData, readAdoptionState, type AdoptionStatus } from '@/account/adoption';
import { originalPath, type AccountBackend } from '@/features/account/backend';
import type { DeleteAccountResult } from '@/cloud/auth';
import type { VehicleSummary } from '@/features/vehicles/types';
import { parkedCount, pendingCount, syncOnce } from '@/sync/engine';
import type { AcquiredFile } from '@/providers/acquisition/types';
import type { OriginalFileStore } from '@/providers/storage/types';
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
  SettingsRepository,
  SourceRepository,
  VehicleRepository,
  type SqlDatabase,
  MaintenanceKnowledgeRepository,
  MSourceRepository,
  VehicleDatesRepository,
  ManualScheduleRepository,
  type ManualScheduleItem,
  VehicleRegistryRecordRepository,
  type VehicleDates,
} from '@/persistence';
import type { MSourceRun } from '@/discovery/maintenance/msource/run';
import type { OwnerEdit } from '@/discovery/maintenance/msource/ownerReview';
import { ownerReviewState } from '@/features/maintenance/msource/ownerReview';
import type { OwnerDocumentsInput } from '@/features/maintenance/msource/service';

import type { VehicleRegistryRecord } from '@/providers/registry/vehicleRecord';

import { toBundle, toVehicleSummary, type VehicleRecords } from './adapters';
import type { AttachmentInput, OriginalView } from './DataContext';
import { uploadAuthority } from './documentUpload';
import type {
  DocumentKind,
  GarageRecommendationVM,
  ServiceEventVM,
  VehicleDataBundle,
} from './types';

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

const PHOTO_KEY = 'vehiclePhotos';
/** Vehicles whose image prompt the user answered with "לא עכשיו" / "לא בטוח" (device-local UX). */

export interface Snapshot {
  vehicles: VehicleSummary[];
  bundles: Record<string, VehicleDataBundle>;
  activeVehicleId: string | null;
  /** The user opted in to device notifications (T130). */
  notificationsEnabled: boolean;
  /** Backup/sync state from the local database (T140). */
  backup: BackupStatus;
  /** User-provided vehicle photos (device-local, not synced): vehicleId → viewable URI. */
  vehiclePhotos: Record<string, string>;
}

export interface BackupStatus {
  adoption: AdoptionStatus;
  /** Local changes not yet accepted by the server. */
  pending: number;
  lastSyncAt: string | null;
  lastError: 'network' | 'server_rejected' | 'different_account' | 'not_signed_in' | null;
  /** Fields changed on two devices at once, reconciled by sync and not yet acknowledged (T158). */
  conflicts: number;
  /** Local changes the server permanently refused (kept on this device; P2A). */
  notBackedUp: number;
}

/** Result of one sync attempt, for the scheduler (retry with backoff on transient failures). */
export type SyncAttempt = { ok: true } | { ok: false; transient: boolean; retryInMs?: number };

/** Optional identity details captured at onboarding (beyond the display summary). */
export interface VehicleDetails {
  trim?: string;
  engine?: string;
  engineCode?: string;
  fuel?: string;
  color?: string;
  vin?: string;
  modelCode?: string;
  /** Set only from a high-confidence registry rule at onboarding. */
  exteriorPhase?: ExteriorPhase;
  /** Registry first-registration month ("YYYY-MM"), kept in the vehicle's maintenance profile. */
  firstRegistration?: string;
  /** Every valid Ministry fact for the vehicle (Add Vehicle by plate). */
  registryRecord?: VehicleRegistryRecord;
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

/**
 * Test and insurance dates of a vehicle summary (owner decision 2026-10-04): the owner's test date,
 * else the registry's licence validity; insurance only as the owner entered it.
 */
function withDates(
  summary: VehicleSummary,
  registry: VehicleRegistryRecord | null,
  dates: VehicleDates,
): VehicleSummary {
  const registryTest = registry?.facts.find((f) => f.key === 'licenseValidUntil')?.value;
  const testUntil =
    dates.testUntil ??
    (typeof registryTest === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(registryTest)
      ? registryTest
      : undefined);
  const insurance =
    dates.compulsoryUntil || dates.otherUntil
      ? {
          ...(dates.compulsoryUntil ? { compulsoryUntil: dates.compulsoryUntil } : {}),
          ...(dates.otherUntil
            ? { otherUntil: dates.otherUntil, otherKind: dates.otherKind ?? 'comprehensive' }
            : {}),
        }
      : undefined;
  return {
    ...summary,
    ...(testUntil ? { testUntil, testSource: dates.testUntil ? 'user' : 'registry' } : {}),
    ...(insurance ? { insurance } : {}),
  };
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
    private readonly files: OriginalFileStore | null,
  ) {}

  /** Opens the store: runs pending migrations and ensures this device's local profile. */
  static async open(
    db: SqlDatabase,
    ids: IdGenerator,
    clock: Clock,
    files: OriginalFileStore | null = null,
  ): Promise<LocalStore> {
    await migrate(db, MIGRATIONS, clock.now);
    const profile = await new ProfileRepository(db).getOrCreate(ids, clock.now());
    const store = new LocalStore(db, ids, clock, profile, files);
    // An account deletion that succeeded on the server but was interrupted before this device
    // was wiped is completed now (never left half-done).
    const pending = await new SettingsRepository(db).get<{ status: string }>('accountDeletion');
    if (pending?.status === 'local_pending') await store.wipeLocalData();
    return store;
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
      maintenanceProfile: await new MaintenanceKnowledgeRepository(this.db).profile(id),
      knowledgeDocuments: await new MaintenanceKnowledgeRepository(this.db).documents(id),
      claims: await new MaintenanceKnowledgeRepository(this.db).claims(id),
      msource: {
        registry: await new VehicleRegistryRecordRepository(this.db).get(id).catch(() => null),
        owner: ownerReviewState(
          await new MSourceRepository(this.db).latestRun(id),
          await new MSourceRepository(this.db).ownerDecisions(id),
        ),
      },
      manualItems: await new ManualScheduleRepository(this.db).list(id),
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
   * T126: applies the alert lifecycle — persists new justified alerts (identity and status then
   * survive restarts and sync), resolves alerts whose condition cleared, and re-activates alerts
   * whose snooze ended. Returns true if anything changed.
   */
  private async reconcileAlerts(rec: VehicleRecords, candidates: AlertCandidate[]) {
    const now = this.clock.now();
    const plan = planAlerts(rec.alerts, candidates, this.clock.today());
    const repo = new AlertRepository(this.db);
    let changed = false;
    for (const c of plan.create) {
      const r = createAlert(
        { vehicleId: rec.vehicle.id, kind: c.kind, basis: c.basis },
        this.ids,
        now,
      );
      if (r.ok) {
        await repo.add(r.value);
        changed = true;
      }
    }
    for (const a of plan.resolve) {
      const r = resolveAlert(a, now);
      if (r.ok) {
        await repo.update(r.value);
        changed = true;
      }
    }
    for (const a of plan.reactivate) {
      const r = reactivateAlert(a, now);
      if (r.ok) {
        await repo.update(r.value);
        changed = true;
      }
    }
    return changed;
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
      summaries.push(
        withDates(
          toVehicleSummary(v, latestReading(rec.readings)),
          rec.msource?.registry ?? null,
          await new VehicleDatesRepository(this.db).get(v.id),
        ),
      );
      bundles[v.id] = toBundle(rec, result, candidates, this.clock.today());
    }
    const activeVehicleId = await new ActiveVehicleStore(this.db).get();
    const notificationsEnabled =
      (await new SettingsRepository(this.db).get<boolean>('notificationsEnabled')) === true;
    return {
      vehicles: summaries,
      bundles,
      activeVehicleId,
      notificationsEnabled,
      backup: await this.backupStatus(),
      vehiclePhotos: await this.vehiclePhotoUris(),
    };
  }

  // ---------- vehicle photos (user-provided, device-local) ----------

  private async photoKeys(): Promise<Record<string, string>> {
    return (await new SettingsRepository(this.db).get<Record<string, string>>(PHOTO_KEY)) ?? {};
  }

  private async vehiclePhotoUris(): Promise<Record<string, string>> {
    if (!this.files) return {};
    const out: Record<string, string> = {};
    for (const [id, key] of Object.entries(await this.photoKeys()))
      out[id] = this.files.uriFor(key);
    return out;
  }

  /** Stores the user's own photo of a vehicle (replaces a previous one). */
  async setVehiclePhoto(vehicleId: string, file: AcquiredFile): Promise<void> {
    if (!this.files) throw new Error('no file store');
    const stored = await this.files.importFile(file);
    const keys = await this.photoKeys();
    const previous = keys[vehicleId];
    await new SettingsRepository(this.db).set(
      PHOTO_KEY,
      { ...keys, [vehicleId]: stored.storageKey },
      this.clock.now(),
    );
    if (previous) await this.files.remove(previous).catch(() => undefined);
  }

  /** Removes the user's own photo; the approved model reference (if any) shows again. */
  async removeVehiclePhoto(vehicleId: string): Promise<void> {
    const keys = await this.photoKeys();
    const key = keys[vehicleId];
    if (!key) return;
    const rest = { ...keys };
    delete rest[vehicleId];
    await new SettingsRepository(this.db).set(PHOTO_KEY, rest, this.clock.now());
    if (this.files) await this.files.remove(key).catch(() => undefined);
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
            engineCode: details.engineCode?.trim() || undefined,
            fuel: details.fuel?.trim() || undefined,
            color: details.color?.trim() || undefined,
            modelCode: details.modelCode?.trim() || undefined,
            exteriorPhase: details.exteriorPhase,
            exteriorPhaseSource: details.exteriorPhase ? 'registry' : undefined,
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
            this.clock.today(),
          ),
        );
        await new OdometerRepository(tx).add(reading);
      }
      if (details.registryRecord) {
        await new VehicleRegistryRecordRepository(tx).save(vehicle.id, details.registryRecord, now);
      }
      // The registry's first-registration month drives time-based maintenance (day unknown).
      const firstReg = details.firstRegistration?.match(/^(\d{4})-(\d{2})$/);
      if (firstReg) {
        await new MaintenanceKnowledgeRepository(tx).saveProfile(
          vehicle.id,
          {
            inService: {
              date: `${firstReg[1]}-${firstReg[2]}-01` as IsoDate,
              precision: 'month',
              source: 'registry',
            },
          },
          now,
        );
      }
    });
    return vehicle.id;
  }

  // ---------- account / backup (M19) ----------

  async backupStatus(): Promise<BackupStatus> {
    const settings = new SettingsRepository(this.db);
    const adoption = await readAdoptionState(this.db);
    const lastError = (await settings.get<BackupStatus['lastError']>('syncLastError')) ?? null;
    const conflicts =
      (
        await this.db.first<{ n: number }>(
          'SELECT COUNT(*) AS n FROM sync_conflicts WHERE resolved = 0',
        )
      )?.n ?? 0;
    const originalsPending =
      adoption.status === 'adopted' ? (await this.originalsToUpload()).length : 0;
    return {
      conflicts,
      notBackedUp: adoption.status === 'adopted' ? await parkedCount(this.db) : 0,
      adoption: adoption.status,
      pending: adoption.status === 'adopted' ? (await pendingCount(this.db)) + originalsPending : 0,
      lastSyncAt: await settings.get<string>('lastSyncAt'),
      lastError:
        adoption.lastError === 'network' ||
        adoption.lastError === 'server_rejected' ||
        adoption.lastError === 'different_account' ||
        adoption.lastError === 'not_signed_in'
          ? adoption.lastError
          : lastError,
    };
  }

  /**
   * After sign-in: adopt this device's local data into the account (one server transaction,
   * read-back verified — local data is never deleted), then run the first sync.
   */
  async connectAccount(backend: AccountBackend): Promise<void> {
    const r = await adoptLocalData(this.db, backend.adoption, this.profile.id, this.clock.now);
    if (!r.ok) throw new Error(`adoption: ${r.failure}`);
    await this.sync(backend);
  }

  /**
   * One automatic backup step (P2A, Y4): a signed-in device whose adoption did not complete
   * (network drop, app killed) retries it; an adopted device syncs.
   */
  async backUp(backend: AccountBackend): Promise<SyncAttempt> {
    if ((await readAdoptionState(this.db)).status !== 'adopted') {
      const r = await adoptLocalData(this.db, backend.adoption, this.profile.id, this.clock.now);
      if (!r.ok) {
        const transient = r.failure === 'network' || r.failure === 'verification_mismatch';
        return { ok: false, transient };
      }
    }
    return this.sync(backend);
  }

  /**
   * P2A: permanently deletes the account and everything it holds.
   *   1. the server deletes every backed-up original, then the account (rows cascade);
   *   2. only after the server confirmed, this device is wiped (vehicles, records, originals,
   *      sync queue and bookkeeping) and signed out.
   * A failure at step 1 changes nothing on this device and is reported. Step 2 is recorded first,
   * so an interruption is completed on the next start. Retrying is always safe (idempotent).
   */
  async deleteAccount(backend: AccountBackend): Promise<DeleteAccountResult> {
    const settings = new SettingsRepository(this.db);
    const r = await backend.deleteAccount();
    if (!r.ok) {
      // The server may have removed some originals before failing: make sure the next backup
      // re-checks every original instead of trusting the "already uploaded" list.
      await settings.set('uploadedOriginals', [], this.clock.now());
      return r;
    }
    await settings.set('accountDeletion', { status: 'local_pending' }, this.clock.now());
    await this.wipeLocalData();
    await backend.signOut().catch(() => undefined);
    return { ok: true };
  }

  /** Removes every user record and original from this device (the device profile stays). */
  async wipeLocalData(): Promise<void> {
    const docs = await this.allDocuments();
    const photos = Object.values(await this.photoKeys());
    await this.db.transaction(async (tx) => {
      // Local bookkeeping only: nothing of this may be queued for sync.
      await tx.run('UPDATE sync_control SET applying = 1 WHERE id = 1');
      await tx.run('DELETE FROM sources');
      await tx.run('DELETE FROM vehicles'); // every vehicle-scoped table cascades
      await tx.run('DELETE FROM sync_outbox');
      await tx.run('DELETE FROM sync_shadow');
      await tx.run('DELETE FROM sync_conflicts');
      await tx.run('DELETE FROM discovery_misses');
      await tx.run('UPDATE profiles SET account_user_id = NULL');
      await tx.run("DELETE FROM settings WHERE key <> 'accountDeletion'");
      await tx.run('UPDATE sync_control SET applying = 0 WHERE id = 1');
    });
    if (this.files) {
      for (const d of docs) await this.files.remove(d.original.storageKey).catch(() => undefined);
      for (const key of photos) await this.files.remove(key).catch(() => undefined);
    }
    await this.db.run("DELETE FROM settings WHERE key = 'accountDeletion'");
  }

  private async allDocuments(): Promise<VehicleDocument[]> {
    const out: VehicleDocument[] = [];
    for (const v of await new VehicleRepository(this.db).list({ includeArchived: true })) {
      out.push(...(await new DocumentRepository(this.db).list(v.id)));
    }
    return out;
  }

  /**
   * Intact local originals not yet in the account's private bucket. A missing or modified file
   * can never be uploaded, so it is not reported as "waiting for backup".
   */
  private async originalsToUpload(): Promise<VehicleDocument[]> {
    const files = this.files;
    if (!files) return [];
    const done = new Set(
      (await new SettingsRepository(this.db).get<string[]>('uploadedOriginals')) ?? [],
    );
    const refused = new Set(
      (
        await this.db.all<{ entity_id: string }>(
          "SELECT entity_id FROM sync_outbox WHERE entity_table = 'documents' AND parked = 1",
        )
      ).map((r) => r.entity_id),
    );
    const out: VehicleDocument[] = [];
    for (const d of await this.allDocuments()) {
      if (done.has(d.id) || refused.has(d.id)) continue;
      if ((await files.verify(d.original.storageKey, d.original.sha256)) === 'intact') out.push(d);
    }
    return out;
  }

  /**
   * T162: uploads intact originals to the private bucket (after their rows synced). A file that
   * is missing or no longer matches its recorded hash is never uploaded.
   */
  private async uploadOriginals(backend: AccountBackend): Promise<void> {
    if (!this.files) return;
    const userId = await backend.adoption.currentUserId();
    if (!userId) return;
    const settings = new SettingsRepository(this.db);
    const done = (await settings.get<string[]>('uploadedOriginals')) ?? [];
    // originalsToUpload() already re-verified each file against its recorded hash.
    for (const d of await this.originalsToUpload()) {
      const bytes = await this.files.readBytes(d.original.storageKey);
      await backend.originals.upload(
        originalPath(userId, d.vehicleId, d.id),
        bytes,
        d.original.mimeType,
      );
      done.push(d.id);
      await settings.set('uploadedOriginals', done, this.clock.now());
    }
  }

  private async removeDeletedVehicleOriginals(backend: AccountBackend): Promise<void> {
    const pending = await this.db.all<{ entity_id: string }>(
      "SELECT DISTINCT entity_id FROM sync_outbox WHERE entity_table = 'vehicles' AND op = 'delete'",
    );
    if (pending.length === 0) return;
    const userId = await backend.adoption.currentUserId();
    if (!userId) return;
    for (const { entity_id } of pending) {
      await backend.originals.removeFolder(`${userId}/${entity_id}`);
    }
  }

  /** The user has seen the reconciled conflicts (the kept values stay; this only clears the notice). */
  async acknowledgeConflicts(): Promise<void> {
    await this.db.run('UPDATE sync_conflicts SET resolved = 1 WHERE resolved = 0');
  }

  /**
   * One sync round (push, then pull). Only for adopted data; failures are recorded, not lost.
   * Returns whether a retry makes sense (transient failure) and when (backoff).
   */
  async sync(backend: AccountBackend): Promise<SyncAttempt> {
    const settings = new SettingsRepository(this.db);
    const failed = async (retryInMs?: number): Promise<SyncAttempt> => {
      await settings.set('syncLastError', 'network', this.clock.now());
      return { ok: false, transient: true, retryInMs };
    };
    // A permanently deleted vehicle takes its backed-up originals with it. This must happen before
    // the deletion is pushed (storage RLS needs the vehicle row); on failure nothing is pushed.
    try {
      await this.removeDeletedVehicleOriginals(backend);
    } catch {
      return failed();
    }
    const r = await syncOnce(this.db, backend.transport, this.clock.now);
    if (!r.ok) {
      if (r.reason === 'network') return failed(r.retryInMs);
      return { ok: false, transient: false };
    }
    // Vehicles deleted on another device: their rows are gone, so are the local originals.
    if (this.files) {
      for (const key of r.pull.removedOriginals) {
        await this.files.remove(key).catch(() => undefined);
      }
    }
    try {
      await this.uploadOriginals(backend);
    } catch {
      return failed();
    }
    await settings.set('lastSyncAt', this.clock.now(), this.clock.now());
    await settings.set('syncLastError', null, this.clock.now());
    return { ok: true };
  }

  async setNotificationsEnabled(enabled: boolean): Promise<void> {
    await new SettingsRepository(this.db).set('notificationsEnabled', enabled, this.clock.now());
  }

  async setActiveVehicle(id: string): Promise<void> {
    await new ActiveVehicleStore(this.db).set(id as VehicleId, this.clock.now());
  }

  /**
   * Corrects user-editable identity details. The displacement is locked while a VERIFIED schedule
   * exists: that schedule's exact applicability was proven against the current value.
   */
  async updateVehicleDetails(id: string, patch: VehicleDetailsPatch): Promise<void> {
    await this.db.transaction(async (tx) => {
      const repo = new VehicleRepository(tx);
      const v = await repo.get(id as VehicleId);
      if (!v) throw new Error(`Vehicle ${id} not found`);
      if (patch.engine !== undefined && (patch.engine.trim() || undefined) !== v.identity.engine) {
        const schedule = await new ScheduleRepository(tx).current(v.id);
        if (schedule?.verification.state === 'verified') {
          throw new DomainError([
            { code: 'vehicle.engineLocked', message: 'Verified schedule', field: 'engine' },
          ]);
        }
      }
      await repo.update(must(updateVehicleDetails(v, patch, this.clock.now())));
    });
  }

  async archiveVehicle(id: string): Promise<void> {
    must(await lifecycle.archive(this.db, id as VehicleId, this.clock.now()));
  }

  async restoreVehicle(id: string): Promise<void> {
    must(await lifecycle.restore(this.db, id as VehicleId, this.clock.now()));
  }

  /** T145: exact counts of what a permanent deletion would remove. */
  async deletionPreview(id: string) {
    return new VehicleRepository(this.db).deletionPreview(id as VehicleId);
  }

  /**
   * T146: permanent deletion (after preview + explicit confirmation in the UI). All vehicle rows go
   * in one transaction; the stored original files are removed only after that succeeded, so a
   * failure never leaves records pointing at deleted files.
   */
  async deleteVehicle(id: string): Promise<void> {
    await this.removeVehiclePhoto(id);
    const docs = await new DocumentRepository(this.db).list(id as VehicleId);
    await new VehicleRepository(this.db).deletePermanently(id as VehicleId);
    if (this.files) {
      for (const d of docs) await this.files.remove(d.original.storageKey).catch(() => undefined);
    }
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
        this.clock.today(),
      ),
    );
    await repo.add(reading);
  }

  /**
   * T118: stores a user-confirmed service — the review dialog is the explicit confirmation.
   * With an attachment, the original is copied to private storage first, then the document, the
   * service record and its odometer reading are written in ONE transaction; if that fails, the
   * copied file is removed again. A record without its original document can only be a user
   * report — it never claims garage evidence.
   */
  async addServiceEvent(vm: ServiceEventVM, attachment?: AttachmentInput): Promise<void> {
    const now = this.clock.now();
    const vid = vm.vehicleId as VehicleId;
    let doc: VehicleDocument | null = null;
    if (attachment) {
      if (!this.files) throw new Error('No original-file storage configured');
      const stored = await this.files.importFile(attachment.file);
      const created = createDocument(
        {
          vehicleId: vid,
          kind: 'invoice',
          title: attachment.title,
          origin: attachment.file.source === 'camera' ? 'camera_scan' : 'user_upload',
          authority: 'garage_document',
          original: {
            storageKey: stored.storageKey,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            sha256: stored.sha256,
          },
        },
        preferId(attachment.documentId, this.ids),
        now,
      );
      if (!created.ok) {
        await this.files.remove(stored.storageKey);
        throw new DomainError(created.issues);
      }
      doc = created.value;
    }
    const documentIds = [
      ...vm.documentIds.filter(isUuid).map((d) => asId<'Document'>(d)),
      ...(doc ? [doc.id] : []),
    ].filter((d, i, all) => all.indexOf(d) === i);
    try {
      await this.saveServiceEvent(vm, vid, documentIds, now, doc);
    } catch (e) {
      if (doc && this.files) await this.files.remove(doc.original.storageKey);
      throw e;
    }
  }

  private async saveServiceEvent(
    vm: ServiceEventVM,
    vid: VehicleId,
    documentIds: Id<'Document'>[],
    now: Timestamp,
    doc: VehicleDocument | null,
  ): Promise<void> {
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
        { confirmedBy: 'user', confirmedAt: now, today: this.clock.today() },
        preferId(vm.id, this.ids),
      ),
    );
    await this.db.transaction(async (tx) => {
      if (doc) await new DocumentRepository(tx).add(doc);
      await new ServiceRepository(tx).add(event);
      // T129: a later service that performs a deferred item resolves the deferral…
      const deferrals = new DeferredItemRepository(tx);
      const performedItems = new Set(
        event.actions
          .filter((a) => a.performed && a.maintenanceItemId)
          .map((a) => a.maintenanceItemId),
      );
      for (const d of await deferrals.listOpen(vid)) {
        if (performedItems.has(d.maintenanceItemId) && d.deferredAt <= event.date) {
          await deferrals.update(must(resolveDeferredItem(d, event.id, now)));
        }
      }
      // …and items the user consciously deferred now are tracked until done.
      for (const itemId of (vm.deferredItemIds ?? []).filter(isUuid)) {
        if (performedItems.has(itemId as never)) continue;
        await deferrals.add(
          createDeferredItem(
            {
              vehicleId: vid,
              maintenanceItemId: asId<'MaintenanceItem'>(itemId),
              deferredAt: event.date,
              serviceEventId: event.id,
            },
            this.ids,
            now,
          ),
        );
      }
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
        this.clock.today(),
      );
      if (reading.ok) await odo.add(reading.value);
    });
  }

  /** T122: stores an uploaded document; the original is retained, nothing is extracted. */
  async addDocument(vehicleId: string, attachment: AttachmentInput, kind: DocumentKind) {
    if (!this.files) throw new Error('No original-file storage configured');
    const stored = await this.files.importFile(attachment.file);
    const created = createDocument(
      {
        vehicleId: vehicleId as VehicleId,
        kind,
        title: attachment.title,
        origin: attachment.file.source === 'camera' ? 'camera_scan' : 'user_upload',
        authority: uploadAuthority(kind),
        original: {
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          sha256: stored.sha256,
        },
      },
      preferId(attachment.documentId, this.ids),
      this.clock.now(),
    );
    try {
      await new DocumentRepository(this.db).add(must(created));
    } catch (e) {
      await this.files.remove(stored.storageKey);
      throw e;
    }
  }

  /**
   * T123/T125: the stored original, re-hashed against the hash recorded at import. On a device
   * that does not hold it yet (e.g. restored from the account), it is fetched from the private
   * backup and accepted only if its hash matches the record.
   */
  async original(
    vehicleId: string,
    documentId: string,
    backend: AccountBackend | null = null,
  ): Promise<OriginalView | null> {
    const doc = await new DocumentRepository(this.db).get(
      vehicleId as VehicleId,
      documentId as VehicleDocument['id'],
    );
    if (!doc || !this.files) return null;
    const key = doc.original.storageKey;
    let integrity = await this.files.verify(key, doc.original.sha256);
    if (integrity === 'missing' && backend) {
      const userId = await backend.adoption.currentUserId().catch(() => null);
      const bytes = userId
        ? await backend.originals
            .download(originalPath(userId, doc.vehicleId, doc.id))
            .catch(() => null)
        : null;
      if (bytes) {
        await this.files.writeBytes(key, bytes);
        integrity = await this.files.verify(key, doc.original.sha256);
        if (integrity !== 'intact') await this.files.remove(key); // never keep a mismatching copy
        if (integrity !== 'intact') integrity = 'missing';
      }
    }
    return { uri: this.files.uriFor(key), mimeType: doc.original.mimeType, integrity };
  }

  // ---------- maintenance knowledge (owner run 2026-09-29) ----------

  /** The owner's answers that resolve a requirement's applicability (unknown = null). */
  async setMaintenanceAnswers(
    vehicleId: string,
    answers: { serviceRegime?: string | null; usage?: UsageCondition | null },
  ): Promise<void> {
    const vehicle = await new VehicleRepository(this.db).get(vehicleId as VehicleId);
    if (!vehicle) throw new Error('Vehicle not found');
    const regime = answers.serviceRegime?.trim().toUpperCase();
    await new MaintenanceKnowledgeRepository(this.db).saveProfile(
      vehicle.id,
      {
        ...(answers.serviceRegime !== undefined ? { serviceRegime: regime || null } : {}),
        ...(answers.usage !== undefined ? { usage: answers.usage } : {}),
      },
      this.clock.now(),
    );
  }

  /**
   * The owner marks a stored document as this vehicle's maintenance booklet. It becomes a
   * vehicle-scoped knowledge document — confirmed by the owner, NOT verified: its content only
   * counts after a professional review of the edition (docs/release/MAINTENANCE_M1.md).
   */
  /**
   * The owner's decision on one item read from their own document (owner review, D-A3). Only an
   * accepted item becomes a requirement — with the owner's correction, if any (recorded as
   * edited by the owner); the decision is local to this device.
   */
  async decideOwnerProposal(
    vehicleId: string,
    proposalKey: string,
    decision: 'accepted' | 'rejected',
    edit: OwnerEdit | null = null,
  ): Promise<void> {
    const vehicle = await new VehicleRepository(this.db).get(vehicleId as VehicleId);
    if (!vehicle) return;
    await new MSourceRepository(this.db).saveOwnerDecision(
      vehicle.id,
      proposalKey,
      decision,
      this.clock.now(),
      edit,
    );
  }

  async registerMaintenanceBooklet(vehicleId: string, documentId: string): Promise<void> {
    const doc = await new DocumentRepository(this.db).get(
      vehicleId as VehicleId,
      documentId as VehicleDocument['id'],
    );
    if (!doc) throw new Error('Document not found for this vehicle');
    const repo = new MaintenanceKnowledgeRepository(this.db);
    if ((await repo.documents(doc.vehicleId)).some((d) => d.documentId === doc.id)) return;
    const k = confirmOwnership(
      documentFromUpload({
        id: this.ids.next(),
        vehicleId: doc.vehicleId,
        title: doc.title,
        sha256: doc.original.sha256,
        pageCount: doc.original.pageCount,
        claimedAuthority: 'vehicle_document',
      }),
      this.clock.today(),
    );
    await repo.addDocument({ ...k, vehicleId: doc.vehicleId }, doc.id, this.clock.now());
  }

  /** The Ministry record saved at onboarding (vehicle-scoped). */
  async registryRecord(vehicleId: string): Promise<VehicleRegistryRecord | null> {
    return new VehicleRegistryRecordRepository(this.db).get(vehicleId as VehicleId);
  }

  // ---------- the owner's own schedule items (local-only, migration v15) ----------

  /** Adds (no id) or updates the owner's item; returns its id. */
  async saveManualItem(
    vehicleId: string,
    value: Omit<ManualScheduleItem, 'id' | 'vehicleId'>,
    id?: string,
  ): Promise<string> {
    const vehicle = await new VehicleRepository(this.db).get(vehicleId as VehicleId);
    if (!vehicle) throw new Error('Unknown vehicle');
    const itemId = id ?? this.ids.next<'ManualItem'>();
    await new ManualScheduleRepository(this.db).save(
      { ...value, id: itemId, vehicleId },
      this.clock.now(),
    );
    return itemId;
  }

  async removeManualItem(vehicleId: string, id: string): Promise<void> {
    await new ManualScheduleRepository(this.db).remove(vehicleId as VehicleId, id);
  }

  // ---------- test and insurance dates (local-only, migration v14) ----------

  /** The owner's test / insurance dates; absent keys stay unchanged, null clears a date. */
  async setVehicleDates(vehicleId: string, patch: Partial<VehicleDates>): Promise<void> {
    const repo = new VehicleDatesRepository(this.db);
    const current = await repo.get(vehicleId as VehicleId);
    await repo.save(vehicleId as VehicleId, { ...current, ...patch }, this.clock.now());
  }

  // ---------- the owner's own maintenance documents (local-only, migration v10) ----------

  /**
   * What reading the owner's documents needs for one vehicle: its confirmed identity (no plate, no
   * VIN), the owner's regime answer and the maintenance documents the owner uploaded.
   */
  async ownerDocumentsLoad(vehicleId: string): Promise<OwnerDocumentsInput | null> {
    const vehicle = await new VehicleRepository(this.db).get(vehicleId as VehicleId);
    if (!vehicle || vehicle.lifecycle === 'archived') return null;
    const k = new MaintenanceKnowledgeRepository(this.db);
    const profile = await k.profile(vehicle.id);
    const uploads: OwnerDocumentsInput['uploads'] = [];
    if (this.files) {
      for (const kd of await k.documents(vehicle.id)) {
        if (!kd.documentId) continue;
        const doc = await new DocumentRepository(this.db).get(
          vehicle.id,
          kd.documentId as VehicleDocument['id'],
        );
        if (!doc) continue;
        const bytes = await this.files.readBytes(doc.original.storageKey).catch(() => null);
        if (bytes) uploads.push({ id: doc.id, name: doc.title, bytes });
      }
    }
    return {
      vehicleId: vehicle.id,
      input: {
        kind: vehicle.type,
        manufacturer: vehicle.identity.manufacturer,
        model: vehicle.identity.model,
        year: vehicle.identity.year,
        engine: vehicle.identity.engine ?? null,
        engineCode: vehicle.identity.engineCode ?? null,
        fuel: vehicle.identity.fuel ?? null,
        // Body variant as the Ministry record states it (never derived from the model name).
        body: await new VehicleRegistryRecordRepository(this.db)
          .get(vehicle.id)
          .then((r) => {
            const v = r?.facts.find((f) => f.key === 'body')?.value;
            return typeof v === 'string' ? v : null;
          })
          .catch(() => null),
      },
      serviceRegime: profile?.serviceRegime ?? null,
      uploads,
    };
  }

  /** Stores one reading of the owner's documents (its items await owner review). */
  async ownerDocumentsComplete(vehicleId: string, run: MSourceRun): Promise<void> {
    await new MSourceRepository(this.db).saveRun(vehicleId as VehicleId, run, this.clock.now());
  }

  async openOriginal(vehicleId: string, documentId: string): Promise<boolean> {
    const doc = await new DocumentRepository(this.db).get(
      vehicleId as VehicleId,
      documentId as VehicleDocument['id'],
    );
    if (!doc || !this.files) return false;
    return this.files.open(doc.original.storageKey, doc.original.mimeType);
  }

  /** "Remind me later": the alert leaves view until the date, then returns if still justified. */
  async snoozeAlert(vehicleId: string, alertId: string, days: number): Promise<void> {
    const repo = new AlertRepository(this.db);
    const alert = await repo.get(vehicleId as VehicleId, alertId as never);
    if (!alert) throw new Error('Alert not found for this vehicle');
    const until = addDays(this.clock.today(), days);
    await repo.update(must(snoozeAlert(alert, until, this.clock.now(), this.clock.today())));
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
