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
} from '@/domain';
import { alertCandidates, planAlerts, type AlertCandidate } from '@/engine/alerts';
import { computeMaintenance, type EngineResult } from '@/engine/maintenance';
import { adoptLocalData, readAdoptionState, type AdoptionStatus } from '@/account/adoption';
import type { AccountBackend } from '@/features/account/backend';
import type { VehicleSummary } from '@/features/vehicles/types';
import { pendingCount, syncOnce } from '@/sync/engine';
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
} from '@/persistence';

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

export interface Snapshot {
  vehicles: VehicleSummary[];
  bundles: Record<string, VehicleDataBundle>;
  activeVehicleId: string | null;
  /** The user opted in to device notifications (T130). */
  notificationsEnabled: boolean;
  /** Backup/sync state from the local database (T140). */
  backup: BackupStatus;
}

export interface BackupStatus {
  adoption: AdoptionStatus;
  /** Local changes not yet accepted by the server. */
  pending: number;
  lastSyncAt: string | null;
  lastError: 'network' | 'server_rejected' | 'different_account' | 'not_signed_in' | null;
  /** Fields changed on two devices at once, reconciled by sync and not yet acknowledged (T158). */
  conflicts: number;
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
    return new LocalStore(db, ids, clock, profile, files);
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
      summaries.push(toVehicleSummary(v, latestReading(rec.readings)));
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
    };
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
    return {
      conflicts,
      adoption: adoption.status,
      pending: adoption.status === 'adopted' ? await pendingCount(this.db) : 0,
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

  /** The user has seen the reconciled conflicts (the kept values stay; this only clears the notice). */
  async acknowledgeConflicts(): Promise<void> {
    await this.db.run('UPDATE sync_conflicts SET resolved = 1 WHERE resolved = 0');
  }

  /** One sync round (push, then pull). Only for adopted data; failures are recorded, not lost. */
  async sync(backend: AccountBackend): Promise<void> {
    const settings = new SettingsRepository(this.db);
    const r = await syncOnce(this.db, backend.transport, this.clock.now);
    if (r.ok) {
      await settings.set('lastSyncAt', this.clock.now(), this.clock.now());
      await settings.set('syncLastError', null, this.clock.now());
    } else if (r.reason === 'network') {
      await settings.set('syncLastError', 'network', this.clock.now());
    }
  }

  async setNotificationsEnabled(enabled: boolean): Promise<void> {
    await new SettingsRepository(this.db).set('notificationsEnabled', enabled, this.clock.now());
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
        { confirmedBy: 'user', confirmedAt: now },
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

  /** T123/T125: the stored original, re-hashed against the hash recorded at import. */
  async original(vehicleId: string, documentId: string): Promise<OriginalView | null> {
    const doc = await new DocumentRepository(this.db).get(
      vehicleId as VehicleId,
      documentId as VehicleDocument['id'],
    );
    if (!doc || !this.files) return null;
    return {
      uri: this.files.uriFor(doc.original.storageKey),
      mimeType: doc.original.mimeType,
      integrity: await this.files.verify(doc.original.storageKey, doc.original.sha256),
    };
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
    await repo.update(must(snoozeAlert(alert, until, this.clock.now())));
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
