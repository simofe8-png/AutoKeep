import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { safeErrorText } from '@/security/redact';
import { StyleSheet, View } from 'react-native';

import type { IdGenerator } from '@/domain';
import { he } from '@/i18n/he';
import type { SqlDatabase } from '@/persistence';
import {
  readOwnerDocumentsFor,
  type OwnerDocumentsHost,
  type OwnerDocumentsStore,
} from '@/features/maintenance/msource/service';
import type { BackupCrypto } from '@/persistence/backup/backup';
import type { BackupFiles } from '@/providers/backup/types';
import type { NetworkMonitor } from '@/providers/network/types';
import type { OriginalFileStore } from '@/providers/storage/types';
import { colors, Dialog, ErrorState, LoadingState } from '@/ui';

import { DataCtx, emptyBundle, type AppDataValue, type NetworkMode } from './DataContext';
import { LocalStore, type Clock, type Snapshot } from './localStore';

export interface LocalDataProviderProps {
  openDatabase: () => Promise<SqlDatabase>;
  ids: IdGenerator;
  clock: Clock;
  files: OriginalFileStore | null;
  /** Where the user saves and picks backup files (null: backup not offered, e.g. tests). */
  backupFiles?: BackupFiles | null;
  backupCrypto?: BackupCrypto | null;
  network?: NetworkMonitor | null;
  /** Reads the owner's uploaded maintenance documents (null: not read, e.g. tests). */
  ownerDocuments?: OwnerDocumentsHost | null;
  children: ReactNode;
}

type Phase = { kind: 'loading' } | { kind: 'ready'; snapshot: Snapshot } | { kind: 'failed' };

/** Holds the open store and serializes writes so they apply in the user's order. */
class StoreRuntime {
  private store: LocalStore | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  attach(store: LocalStore) {
    this.store = store;
  }

  /** A read that waits for pending writes (so it sees them); failures yield the fallback. */
  read<T>(op: (s: LocalStore) => Promise<T>, fallback: T): Promise<T> {
    return this.queue.then(async () => {
      const s = this.store;
      if (!s) return fallback;
      try {
        return await op(s);
      } catch {
        return fallback;
      }
    });
  }

  /**
   * Runs an operation in the write order and returns its result (the fallback if the store is
   * not open or the operation throws); a fresh snapshot is reported afterwards.
   */
  task<T>(
    op: (s: LocalStore) => Promise<T>,
    fallback: T,
    onSnapshot: (s: Snapshot) => void,
    onReadFailed: () => void,
  ): Promise<T> {
    return new Promise<T>((resolve) => {
      this.queue = this.queue.then(async () => {
        const s = this.store;
        if (!s) return resolve(fallback);
        let result = fallback;
        try {
          result = await op(s);
        } catch (e) {
          if (__DEV__) console.warn('AutoKeep: task failed', safeErrorText(e));
        }
        try {
          onSnapshot(await s.snapshot());
        } catch {
          onReadFailed();
        }
        resolve(result);
      });
    });
  }

  /** Runs a write after all earlier writes, then reports a fresh snapshot. */
  write(
    op: (s: LocalStore) => Promise<unknown>,
    onSnapshot: (s: Snapshot) => void,
    onWriteFailed: (e: unknown) => void,
    onReadFailed: () => void,
  ) {
    this.queue = this.queue.then(async () => {
      const s = this.store;
      if (!s) return;
      try {
        await op(s);
      } catch (e) {
        if (__DEV__) console.warn('AutoKeep: write failed', safeErrorText(e));
        onWriteFailed(e);
      }
      try {
        onSnapshot(await s.snapshot());
      } catch {
        onReadFailed();
      }
    });
  }
}

/**
 * Production data source (M13): the on-device SQLite store. Opens and migrates the database,
 * then serves snapshots computed from persisted records. Each write runs through the store and
 * is followed by a fresh snapshot; writes are serialized so they apply in the user's order.
 */
export function LocalDataProvider({
  openDatabase,
  ids,
  clock,
  files,
  backupFiles = null,
  backupCrypto = null,
  network: monitor = null,
  ownerDocuments = null,
  children,
}: LocalDataProviderProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkMode>('online');
  const [runtime] = useState(() => new StoreRuntime());
  const [attempt, setAttempt] = useState(0);

  const toReady = (next: Snapshot) => setPhase({ kind: 'ready', snapshot: next });
  const toFailed = () => setPhase({ kind: 'failed' });

  // T151: real connectivity (registry lookups need it). The app never blocks on it; it explains.
  useEffect(() => {
    if (!monitor) return;
    let cancelled = false;
    const apply = (on: boolean) => {
      if (!cancelled) setNetwork(on ? 'online' : 'offline');
    };
    void monitor.isOnline().then(apply);
    const unsubscribe = monitor.subscribe(apply);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [monitor]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openDatabase();
        const s = await LocalStore.open(db, ids, clock, files);
        const snapshot = await s.snapshot();
        if (cancelled) return;
        runtime.attach(s);
        setPhase({ kind: 'ready', snapshot });
      } catch (e) {
        if (__DEV__) console.warn('AutoKeep: local data failed to open', safeErrorText(e));
        if (!cancelled) setPhase({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openDatabase, ids, clock, files, attempt, runtime]);

  // The owner's uploaded booklet is read OUTSIDE the write queue; its result is written through
  // it (refreshing the snapshot), so the app is never blocked while a document is read.
  const [readDocuments] = useState(() => (vehicleId: string) => {
    if (!ownerDocuments) return;
    const store: OwnerDocumentsStore = {
      load: (id) => runtime.read((s) => s.ownerDocumentsLoad(id), null),
      complete: (id, run) =>
        runtime.task(
          (s) => s.ownerDocumentsComplete(id, run),
          undefined,
          (next) => setPhase({ kind: 'ready', snapshot: next }),
          () => setPhase({ kind: 'failed' }),
        ),
    };
    void readOwnerDocumentsFor(vehicleId, store, ownerDocuments, {
      now: clock.now,
      today: () => clock.today(),
    }).catch((e) => {
      if (__DEV__) console.warn('AutoKeep: reading the booklet failed', safeErrorText(e));
    });
  });

  const snapshot = phase.kind === 'ready' ? phase.snapshot : null;

  const value = useMemo<AppDataValue | null>(() => {
    if (!snapshot) return null;
    const write = (op: (s: LocalStore) => Promise<unknown>) => {
      runtime.write(
        op,
        (next) => setPhase({ kind: 'ready', snapshot: next }),
        // Dev builds show the technical cause to speed up diagnosis; users see plain language.
        (e) => setSaveFailed(__DEV__ ? safeErrorText(e) : ''),
        () => setPhase({ kind: 'failed' }),
      );
    };
    return {
      vehicles: snapshot.vehicles,
      getBundle: (id) => snapshot.bundles[id] ?? emptyBundle(),
      addVehicle: (vehicle, _prototypeBundle, details) => {
        // Shown immediately (onboarding navigates Home at once); the persisted snapshot replaces
        // it, or removes it again if the write fails (and the failure is reported).
        setPhase((p) =>
          p.kind === 'ready'
            ? {
                kind: 'ready',
                snapshot: {
                  ...p.snapshot,
                  vehicles: [...p.snapshot.vehicles, vehicle],
                  bundles: { ...p.snapshot.bundles, [vehicle.id]: emptyBundle() },
                },
              }
            : p,
        );
        write(async (s) => {
          const id = await s.addVehicle(vehicle, details);
          await s.setActiveVehicle(id);
        });
      },
      updateVehicleDetails: (id, patch) => write((s) => s.updateVehicleDetails(id, patch)),
      archiveVehicle: (id) => write((s) => s.archiveVehicle(id)),
      restoreVehicle: (id) => write((s) => s.restoreVehicle(id)),
      deleteVehicle: (id) => write((s) => s.deleteVehicle(id)),
      deleteDocument: (vid, id) => write((s) => s.deleteDocument(vid, id)),
      deletionPreview: (id) =>
        runtime.read((s) => s.deletionPreview(id), {
          serviceEvents: 0,
          documents: 0,
          odometerReadings: 0,
          alerts: 0,
          garageRecommendations: 0,
        }),
      updateOdometer: (id, km, at) => write((s) => s.updateOdometer(id, km, at)),
      addServiceEvent: (e, attachment) => write((s) => s.addServiceEvent(e, attachment)),
      deleteServiceEvent: (vid, id) => write((s) => s.deleteServiceEvent(vid, id)),
      addTrackedItem: (vid, title, done) => write((s) => s.addTrackedItem(vid, title, done)),
      removeTrackedItem: (vid, id) => write((s) => s.removeTrackedItem(vid, id)),
      recordItemDone: (vid, title, date, km) =>
        write((s) => s.recordItemDone(vid, title, date, km)),
      setAlertHandled: (vid, aid) => write((s) => s.setAlertHandled(vid, aid)),
      snoozeAlert: (vid, aid, days) => write((s) => s.snoozeAlert(vid, aid, days)),
      today: () => clock.today(),
      notificationsEnabled: snapshot.notificationsEnabled,
      setNotificationsEnabled: (enabled) => write((s) => s.setNotificationsEnabled(enabled)),
      addGarageRecommendation: (r) => write((s) => s.addGarageRecommendation(r)),
      vehiclePhotos: snapshot.vehiclePhotos,
      profileCard: snapshot.profileCard,
      setProfileCard: (vid, state) => write((s) => s.setProfileCard(vid, state)),
      removeVehiclePhoto: (vid) => write((s) => s.removeVehiclePhoto(vid)),
      setVehiclePhoto: (vid, file) => write((s) => s.setVehiclePhoto(vid, file)),
      setMaintenanceAnswers: (vid, answers) => write((s) => s.setMaintenanceAnswers(vid, answers)),
      setVehicleDates: (vid, patch) => write((s) => s.setVehicleDates(vid, patch)),
      setVehicleSpec: (vid, spec) => write((s) => s.setVehicleSpec(vid, spec)),
      saveManualItem: (vid, value, id) => write((s) => s.saveManualItem(vid, value, id)),
      removeManualItem: (vid, id) => write((s) => s.removeManualItem(vid, id)),
      saveManualSchedule: (vid, rows) => write((s) => s.saveManualSchedule(vid, rows)),
      saveServiceTable: (vid, value) => write((s) => s.saveServiceTable(vid, value)),
      removeServiceTable: (vid) => write((s) => s.removeServiceTable(vid)),
      recordTableDone: (vid, done) => write((s) => s.recordTableDone(vid, done)),
      saveTableService: (vid, input) => write((s) => s.saveTableService(vid, input)),
      registerMaintenanceBooklet: (vid, did) => {
        write((s) => s.registerMaintenanceBooklet(vid, did));
        // The owner's booklet is read; its items are proposed for owner review.
        readDocuments(vid);
      },
      // A cache, not user data: written outside the snapshot cycle (nothing on screen depends on it).
      reviewOwnerDocumentItem: (vid, key, decision, edit) =>
        write((s) => s.decideOwnerProposal(vid, key, decision, edit ?? null)),
      addDocument: (vid, attachment, kind) => write((s) => s.addDocument(vid, attachment, kind)),
      // Reads of the original go straight to the store (no snapshot change).
      getOriginal: (vid, did) => runtime.read((s) => s.original(vid, did), null),
      openOriginal: (vid, did) => runtime.read((s) => s.openOriginal(vid, did), false),
      getRegistryRecord: (vid) => runtime.read((s) => s.registryRecord(vid), null),
      network,
      setNetwork,
      backup: {
        available: backupFiles !== null && backupCrypto !== null,
        lastBackupAt: snapshot.backup.lastBackupAt?.slice(0, 10),
      },
      exportBackup: async (via) => {
        if (!backupFiles || !backupCrypto) return { ok: false, reason: 'unavailable' };
        const made = await runtime.read((s) => s.createBackup(backupCrypto), null);
        if (!made) return { ok: false, reason: 'failed' };
        const name = `autokeep-backup-${clock.today()}.json`;
        const outcome =
          via === 'folder'
            ? await backupFiles.saveToFolder(made.text, name).catch(() => 'failed' as const)
            : await backupFiles.share(made.text, name).catch(() => 'failed' as const);
        if (outcome !== 'saved') return { ok: false, reason: outcome };
        write((s) => s.markBackedUp());
        return {
          ok: true,
          fileCount: made.manifest.fileCount,
          missingFiles: made.manifest.missingFiles.length,
        };
      },
      restoreBackup: async () => {
        if (!backupFiles || !backupCrypto) return { ok: false, reason: 'unavailable' };
        let text: string | null;
        try {
          text = await backupFiles.pick();
        } catch (e) {
          if (__DEV__) console.warn('AutoKeep: reading the backup file failed', safeErrorText(e));
          return { ok: false, reason: 'unreadable' };
        }
        if (text === null) return { ok: false, reason: 'cancelled' };
        const r = await runtime.task(
          (s) => s.restoreBackup(text, backupCrypto),
          { ok: false, reason: 'write_failed' } as const,
          toReady,
          toFailed,
        );
        if (!r.ok) return r;
        // The device profile and every record now come from the backup: reopen the store.
        setAttempt((n) => n + 1);
        return { ok: true, vehicles: r.vehicles, files: r.files, missingFiles: r.missingFiles };
      },
      isDemoData: false,
      initialActiveVehicleId: snapshot.activeVehicleId,
      // Best effort: a selection that is no longer valid simply is not remembered.
      rememberActiveVehicle: (id) => write((s) => s.setActiveVehicle(id).catch(() => undefined)),
    };
  }, [snapshot, runtime, network, clock, backupFiles, backupCrypto, readDocuments]);

  if (phase.kind === 'failed') {
    return (
      <View style={styles.center} testID="data-load-failed">
        <ErrorState
          title={he.data.loadFailedTitle}
          message={he.data.loadFailedBody}
          action={{ label: he.common.retry, onPress: () => setAttempt((n) => n + 1) }}
        />
      </View>
    );
  }
  if (!value) {
    return (
      <View style={styles.center} testID="data-loading">
        <LoadingState />
      </View>
    );
  }
  return (
    <DataCtx.Provider value={value}>
      {children}
      <Dialog
        visible={saveFailed !== null}
        testID="data-save-failed"
        title={he.states.genericErrorTitle}
        message={
          saveFailed
            ? `${he.data.saveFailed}
${saveFailed}`
            : he.data.saveFailed
        }
        confirmLabel={he.common.close}
        onConfirm={() => setSaveFailed(null)}
        onCancel={() => setSaveFailed(null)}
      />
    </DataCtx.Provider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
});
