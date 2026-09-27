import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { safeErrorText } from '@/security/redact';
import { AppState, StyleSheet, View } from 'react-native';

import type { IdGenerator } from '@/domain';
import { he } from '@/i18n/he';
import type { SqlDatabase } from '@/persistence';
import type { AccountBackend } from '@/features/account/backend';
import { planOfficialSource, type SourceServices } from '@/features/sources/sourceService';
import type { NetworkMonitor } from '@/providers/network/types';
import type { OriginalFileStore } from '@/providers/storage/types';
import { colors, Dialog, ErrorState, LoadingState } from '@/ui';

import {
  DataCtx,
  emptyBundle,
  type AccountResult,
  type AccountState,
  type AppDataValue,
  type NetworkMode,
} from './DataContext';
import { LocalStore, type Clock, type Snapshot, type SyncAttempt } from './localStore';
import { SyncScheduler } from './syncScheduler';

export interface LocalDataProviderProps {
  openDatabase: () => Promise<SqlDatabase>;
  ids: IdGenerator;
  clock: Clock;
  files: OriginalFileStore | null;
  account?: AccountBackend | null;
  network?: NetworkMonitor | null;
  sources?: Omit<SourceServices, 'uriFor'> | null;
  children: ReactNode;
}

type Phase = { kind: 'loading' } | { kind: 'ready'; snapshot: Snapshot } | { kind: 'failed' };

/** Holds the open store and serializes writes so they apply in the user's order. */
class StoreRuntime {
  private store: LocalStore | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  /** Latest connectivity and account backend, read by the background backup. */
  private online = true;
  private backend: AccountBackend | null = null;

  setOnline(on: boolean) {
    this.online = on;
  }

  setBackend(b: AccountBackend | null) {
    this.backend = b;
  }

  /** One automatic backup step (skipped offline or signed out). */
  backUp(onSnapshot: (s: Snapshot) => void, onReadFailed: () => void) {
    return this.task<SyncAttempt | 'skipped'>(
      async (s) => {
        const backend = this.backend;
        if (!backend || !this.online) return 'skipped';
        if ((await backend.currentUsername()) === null) return 'skipped';
        return s.backUp(backend);
      },
      { ok: false, transient: true },
      onSnapshot,
      onReadFailed,
    );
  }

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
  account: backend = null,
  network: monitor = null,
  sources = null,
  children,
}: LocalDataProviderProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountState>({ hasAccount: false });
  const [username, setUsername] = useState<string | null>(null);
  const [network, setNetwork] = useState<NetworkMode>('online');
  const [runtime] = useState(() => new StoreRuntime());
  const [attempt, setAttempt] = useState(0);

  const toReady = (next: Snapshot) => setPhase({ kind: 'ready', snapshot: next });
  const toFailed = () => setPhase({ kind: 'failed' });

  // P2A (Y4): WHEN to back up is decided by one scheduler; every trigger is best effort.
  const [scheduler] = useState(
    () =>
      new SyncScheduler({
        run: () =>
          runtime.backUp(
            (next) => setPhase({ kind: 'ready', snapshot: next }),
            () => setPhase({ kind: 'failed' }),
          ),
      }),
  );
  useEffect(() => () => scheduler.dispose(), [scheduler]);
  useEffect(() => runtime.setBackend(backend), [runtime, backend]);

  // T151: real connectivity. The app never blocks on it; it explains, and resumes when back.
  // T156: when the connection returns, pending changes are backed up.
  useEffect(() => {
    if (!monitor) return;
    let cancelled = false;
    let offline = false;
    const apply = (on: boolean) => {
      if (cancelled) return;
      runtime.setOnline(on);
      setNetwork(on ? 'online' : 'offline');
      if (!on) {
        offline = true;
        return;
      }
      if (!offline) return;
      offline = false;
      scheduler.request('now');
    };
    void monitor.isOnline().then(apply);
    const unsubscribe = monitor.subscribe(apply);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [monitor, scheduler, runtime]);

  // Foreground: refresh tokens only while active (React Native guidance) and back up.
  useEffect(() => {
    if (!backend) return;
    backend.setActive(AppState.currentState === 'active');
    const sub = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      backend.setActive(active);
      if (active) scheduler.request('now');
    });
    return () => sub.remove();
  }, [backend, scheduler]);

  // Session changes made elsewhere (refresh failed, signed out, account deleted) are reflected.
  useEffect(() => {
    if (!backend) return;
    return backend.onSessionChange((u) => setUsername(u));
  }, [backend]);

  // The signed-in account (session persisted securely by the backend).
  useEffect(() => {
    if (!backend) return;
    let cancelled = false;
    void backend
      .currentUsername()
      .then((e) => {
        if (!cancelled) setUsername(e);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [backend]);

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
        scheduler.request('now');
      } catch (e) {
        if (__DEV__) console.warn('AutoKeep: local data failed to open', safeErrorText(e));
        if (!cancelled) setPhase({ kind: 'failed' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [openDatabase, ids, clock, files, attempt, runtime, scheduler]);

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
      // A local change is backed up after a short quiet period (if signed in and online).
      if (username !== null) scheduler.request('soon');
    };
    // Adoption/sync failures are recorded in the backup status, not raised as write failures.
    const quietly = (op: (s: LocalStore) => Promise<unknown>) =>
      write((s) => op(s).catch(() => undefined));
    // After signing in or registering: this device's data is adopted into the account, then
    // backed up (retried if needed).
    const signedIn = async (typed: string, op: () => Promise<AccountResult>) => {
      if (!backend) return { ok: false, reason: 'unknown' } as const;
      const r = await op();
      if (r.ok) {
        setUsername((await backend.currentUsername().catch(() => null)) || typed.trim());
        scheduler.request('now');
      }
      return r;
    };
    return {
      vehicles: snapshot.vehicles,
      getBundle: (id) => snapshot.bundles[id] ?? emptyBundle(),
      planOfficialSource: async (vehicleId, identity, onStep) => {
        if (!sources || !files) {
          onStep('discovery');
          return { status: 'not_found' };
        }
        try {
          return await planOfficialSource(
            vehicleId as never,
            identity,
            { ...sources, uriFor: (k) => files.uriFor(k) },
            ids,
            clock.now,
            onStep,
          );
        } catch {
          return { status: 'not_found' };
        }
      },
      addVehicle: (vehicle, _prototypeBundle, details, plan) => {
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
          const id = await s.addVehicle(vehicle, details, plan ?? null);
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
      getOriginal: (vid, did) =>
        runtime.read((s) => s.original(vid, did, username !== null ? backend : null), null),
      openOriginal: (vid, did) => runtime.read((s) => s.openOriginal(vid, did), false),
      network,
      setNetwork,
      account: backend
        ? {
            hasAccount: username !== null,
            username: username ?? undefined,
            lastBackupAt: snapshot.backup.lastSyncAt?.slice(0, 10),
            available: true,
            adoption: snapshot.backup.adoption,
            pending: snapshot.backup.pending,
            syncError: snapshot.backup.lastError,
            conflicts: snapshot.backup.conflicts,
            notBackedUp: snapshot.backup.notBackedUp,
          }
        : { ...account, available: false },
      setAccount,
      signInAccount: (username, password) =>
        signedIn(username, () => backend!.signIn(username, password)),
      registerAccount: (invitation, username, password) =>
        signedIn(username, () => backend!.register(invitation, username, password)),
      changeAccountPassword: async (password) =>
        backend ? backend.changePassword(password) : { ok: false, reason: 'unknown' },
      syncNow: () => scheduler.request('now'),
      deleteAccount: async () => {
        if (!backend) return { ok: false, reason: 'server' };
        const r = await runtime.task(
          (s) => s.deleteAccount(backend),
          { ok: false, reason: 'server' } as const,
          toReady,
          toFailed,
        );
        if (r.ok) setUsername(null);
        return r;
      },
      acknowledgeConflicts: () => quietly((s) => s.acknowledgeConflicts()),
      signOutAccount: async () => {
        if (!backend) return;
        await backend.signOut().catch(() => undefined);
        setUsername(null);
      },
      isDemoData: false,
      initialActiveVehicleId: snapshot.activeVehicleId,
      // Best effort: a selection that is no longer valid simply is not remembered.
      rememberActiveVehicle: (id) => write((s) => s.setActiveVehicle(id).catch(() => undefined)),
    };
  }, [
    snapshot,
    runtime,
    network,
    account,
    clock,
    backend,
    username,
    sources,
    files,
    ids,
    scheduler,
  ]);

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
