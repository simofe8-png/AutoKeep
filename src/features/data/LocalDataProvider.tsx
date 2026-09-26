import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { IdGenerator } from '@/domain';
import { he } from '@/i18n/he';
import type { SqlDatabase } from '@/persistence';
import type { AccountBackend } from '@/features/account/backend';
import type { OriginalFileStore } from '@/providers/storage/types';
import { colors, Dialog, ErrorState, LoadingState } from '@/ui';

import {
  DataCtx,
  emptyBundle,
  type AccountState,
  type AppDataValue,
  type NetworkMode,
} from './DataContext';
import { LocalStore, type Clock, type Snapshot } from './localStore';

export interface LocalDataProviderProps {
  openDatabase: () => Promise<SqlDatabase>;
  ids: IdGenerator;
  clock: Clock;
  files: OriginalFileStore | null;
  account?: AccountBackend | null;
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
        if (__DEV__) console.warn('AutoKeep: write failed', e);
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
  account: backend = null,
  children,
}: LocalDataProviderProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountState>({ hasAccount: false });
  const [email, setEmail] = useState<string | null>(null);

  // The signed-in account (session persisted securely by the backend).
  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    void backend
      .currentEmail()
      .then((e) => {
        if (!cancelled) setEmail(e);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend]);
  const [network, setNetwork] = useState<NetworkMode>('online');
  const [runtime] = useState(() => new StoreRuntime());
  const [attempt, setAttempt] = useState(0);

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
        if (__DEV__) console.warn('AutoKeep: local data failed to open', e);
        if (!cancelled) setPhase({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openDatabase, ids, clock, files, attempt, runtime]);

  const snapshot = phase.kind === 'ready' ? phase.snapshot : null;

  const value = useMemo<AppDataValue | null>(() => {
    if (!snapshot) return null;
    const write = (op: (s: LocalStore) => Promise<unknown>) =>
      runtime.write(
        op,
        (next) => setPhase({ kind: 'ready', snapshot: next }),
        // Dev builds show the technical cause to speed up diagnosis; users see plain language.
        (e) => setSaveFailed(__DEV__ ? String(e) : ''),
        () => setPhase({ kind: 'failed' }),
      );
    // Adoption/sync failures are recorded in the backup status, not raised as write failures.
    const quietly = (op: (s: LocalStore) => Promise<unknown>) =>
      write((s) => op(s).catch(() => undefined));
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
      archiveVehicle: (id) => write((s) => s.archiveVehicle(id)),
      restoreVehicle: (id) => write((s) => s.restoreVehicle(id)),
      deleteVehicle: (id) => write((s) => s.deleteVehicle(id)),
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
      setAlertHandled: (vid, aid) => write((s) => s.setAlertHandled(vid, aid)),
      snoozeAlert: (vid, aid, days) => write((s) => s.snoozeAlert(vid, aid, days)),
      today: () => clock.today(),
      notificationsEnabled: snapshot.notificationsEnabled,
      setNotificationsEnabled: (enabled) => write((s) => s.setNotificationsEnabled(enabled)),
      addGarageRecommendation: (r) => write((s) => s.addGarageRecommendation(r)),
      addDocument: (vid, attachment, kind) => write((s) => s.addDocument(vid, attachment, kind)),
      // Reads of the original go straight to the store (no snapshot change).
      getOriginal: (vid, did) => runtime.read((s) => s.original(vid, did), null),
      openOriginal: (vid, did) => runtime.read((s) => s.openOriginal(vid, did), false),
      network,
      setNetwork,
      account: backend
        ? {
            hasAccount: email !== null,
            email: email ?? undefined,
            lastBackupAt: snapshot.backup.lastSyncAt?.slice(0, 10),
            available: true,
            adoption: snapshot.backup.adoption,
            pending: snapshot.backup.pending,
            syncError: snapshot.backup.lastError,
          }
        : { ...account, available: false },
      setAccount,
      requestAccountCode: async (e) =>
        backend ? backend.requestCode(e) : { ok: false, reason: 'unknown' },
      verifyAccountCode: async (e, code) => {
        if (!backend) return { ok: false, reason: 'unknown' };
        const r = await backend.verifyCode(e, code);
        if (r.ok) {
          setEmail((await backend.currentEmail().catch(() => null)) ?? e.trim().toLowerCase());
          quietly((s) => s.connectAccount(backend));
        }
        return r;
      },
      syncNow: () => {
        if (backend) quietly((s) => s.sync(backend));
      },
      signOutAccount: async () => {
        if (!backend) return;
        await backend.signOut().catch(() => undefined);
        setEmail(null);
      },
      isDemoData: false,
      initialActiveVehicleId: snapshot.activeVehicleId,
      // Best effort: a selection that is no longer valid simply is not remembered.
      rememberActiveVehicle: (id) => write((s) => s.setActiveVehicle(id).catch(() => undefined)),
    };
  }, [snapshot, runtime, network, account, clock, backend, email]);

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
