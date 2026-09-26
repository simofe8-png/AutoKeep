import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import type { IdGenerator } from '@/domain';
import { he } from '@/i18n/he';
import type { SqlDatabase } from '@/persistence';
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

  /** Runs a write after all earlier writes, then reports a fresh snapshot. */
  write(
    op: (s: LocalStore) => Promise<unknown>,
    onSnapshot: (s: Snapshot) => void,
    onWriteFailed: () => void,
    onReadFailed: () => void,
  ) {
    this.queue = this.queue.then(async () => {
      const s = this.store;
      if (!s) return;
      try {
        await op(s);
      } catch {
        onWriteFailed();
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
export function LocalDataProvider({ openDatabase, ids, clock, children }: LocalDataProviderProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [saveFailed, setSaveFailed] = useState(false);
  const [account, setAccount] = useState<AccountState>({ hasAccount: false });
  const [network, setNetwork] = useState<NetworkMode>('online');
  const [runtime] = useState(() => new StoreRuntime());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openDatabase();
        const s = await LocalStore.open(db, ids, clock);
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
  }, [openDatabase, ids, clock, attempt, runtime]);

  const snapshot = phase.kind === 'ready' ? phase.snapshot : null;

  const value = useMemo<AppDataValue | null>(() => {
    if (!snapshot) return null;
    const write = (op: (s: LocalStore) => Promise<unknown>) =>
      runtime.write(
        op,
        (next) => setPhase({ kind: 'ready', snapshot: next }),
        () => setSaveFailed(true),
        () => setPhase({ kind: 'failed' }),
      );
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
      updateOdometer: (id, km, at) => write((s) => s.updateOdometer(id, km, at)),
      addServiceEvent: (e) => write((s) => s.addServiceEvent(e)),
      setAlertHandled: (vid, aid) => write((s) => s.setAlertHandled(vid, aid)),
      addGarageRecommendation: (r) => write((s) => s.addGarageRecommendation(r)),
      network,
      setNetwork,
      account,
      setAccount,
      isDemoData: false,
      initialActiveVehicleId: snapshot.activeVehicleId,
      // Best effort: a selection that is no longer valid simply is not remembered.
      rememberActiveVehicle: (id) => write((s) => s.setActiveVehicle(id).catch(() => undefined)),
    };
  }, [snapshot, runtime, network, account]);

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
        visible={saveFailed}
        testID="data-save-failed"
        title={he.states.genericErrorTitle}
        message={he.data.saveFailed}
        confirmLabel={he.common.close}
        onConfirm={() => setSaveFailed(false)}
        onCancel={() => setSaveFailed(false)}
      />
    </DataCtx.Provider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', backgroundColor: colors.background },
});
