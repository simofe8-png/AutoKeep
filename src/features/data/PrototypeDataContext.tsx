import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import type { VehicleSummary } from '@/features/vehicles/types';

import type { AlertVM, GarageRecommendationVM, ServiceEventVM, VehicleDataBundle } from './types';

/**
 * PROTOTYPE data store (M02–M03). Holds labeled mock data in memory so the complete approved
 * flows can be exercised end to end (e.g. confirming a service makes it appear in History).
 * Replaced by SQLite repositories (M05) behind adapters (M13). All reads/writes take an explicit
 * vehicleId — nothing is implicitly scoped to "the active vehicle".
 */

export type NetworkMode = 'online' | 'offline';

export interface AccountState {
  hasAccount: boolean;
  email?: string;
  lastBackupAt?: string;
}

export interface PrototypeDataValue {
  vehicles: readonly VehicleSummary[];
  getBundle: (vehicleId: string) => VehicleDataBundle;
  addVehicle: (vehicle: VehicleSummary, bundle?: VehicleDataBundle) => void;
  archiveVehicle: (vehicleId: string) => void;
  restoreVehicle: (vehicleId: string) => void;
  deleteVehicle: (vehicleId: string) => void;
  updateOdometer: (vehicleId: string, km: number, measuredAt: string) => void;
  addServiceEvent: (event: ServiceEventVM) => void;
  setAlertHandled: (vehicleId: string, alertId: string) => void;
  addGarageRecommendation: (rec: GarageRecommendationVM) => void;
  network: NetworkMode;
  setNetwork: (mode: NetworkMode) => void;
  account: AccountState;
  setAccount: (account: AccountState) => void;
  isDemoData: boolean;
}

export function emptyBundle(): VehicleDataBundle {
  return {
    schedule: { status: 'pending', upcoming: [] },
    history: [],
    documents: [],
    alerts: [],
    garageRecommendations: [],
    deferred: [],
  };
}

let idCounter = 0;
export function newLocalId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

const Ctx = createContext<PrototypeDataValue | null>(null);

export interface PrototypeDataProviderProps {
  initialVehicles: readonly VehicleSummary[];
  initialData: Record<string, VehicleDataBundle>;
  isDemoData?: boolean;
  initialNetwork?: NetworkMode;
  children: ReactNode;
}

export function PrototypeDataProvider({
  initialVehicles,
  initialData,
  isDemoData = true,
  initialNetwork = 'online',
  children,
}: PrototypeDataProviderProps) {
  const [vehicles, setVehicles] = useState<VehicleSummary[]>(() => [...initialVehicles]);
  const [data, setData] = useState<Record<string, VehicleDataBundle>>(() => ({ ...initialData }));
  const [network, setNetwork] = useState<NetworkMode>(initialNetwork);
  const [account, setAccount] = useState<AccountState>({ hasAccount: false });

  const getBundle = useCallback((vehicleId: string) => data[vehicleId] ?? emptyBundle(), [data]);

  const updateBundle = useCallback(
    (vehicleId: string, fn: (b: VehicleDataBundle) => VehicleDataBundle) =>
      setData((prev) => ({ ...prev, [vehicleId]: fn(prev[vehicleId] ?? emptyBundle()) })),
    [],
  );

  const addVehicle = useCallback((vehicle: VehicleSummary, bundle?: VehicleDataBundle) => {
    setVehicles((prev) => [...prev, vehicle]);
    setData((prev) => ({ ...prev, [vehicle.id]: bundle ?? emptyBundle() }));
  }, []);

  const setArchived = useCallback((vehicleId: string, archived: boolean) => {
    setVehicles((prev) => prev.map((v) => (v.id === vehicleId ? { ...v, archived } : v)));
  }, []);

  const deleteVehicle = useCallback((vehicleId: string) => {
    setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
    setData((prev) => {
      const next = { ...prev };
      delete next[vehicleId];
      return next;
    });
  }, []);

  const updateOdometer = useCallback((vehicleId: string, km: number, measuredAt: string) => {
    setVehicles((prev) =>
      prev.map((v) =>
        v.id === vehicleId ? { ...v, odometerKm: km, odometerMeasuredAt: measuredAt } : v,
      ),
    );
    // A fresh reading resolves a stale-odometer alert for this vehicle only.
    setData((prev) => {
      const b = prev[vehicleId];
      if (!b) return prev;
      return {
        ...prev,
        [vehicleId]: {
          ...b,
          alerts: b.alerts.map((a) => (a.kind === 'stale_odometer' ? { ...a, handled: true } : a)),
        },
      };
    });
  }, []);

  const addServiceEvent = useCallback(
    (event: ServiceEventVM) =>
      updateBundle(event.vehicleId, (b) => ({
        ...b,
        history: [event, ...b.history].sort((x, y) => y.date.localeCompare(x.date)),
      })),
    [updateBundle],
  );

  const setAlertHandled = useCallback(
    (vehicleId: string, alertId: string) =>
      updateBundle(vehicleId, (b) => ({
        ...b,
        alerts: b.alerts.map((a: AlertVM) => (a.id === alertId ? { ...a, handled: true } : a)),
      })),
    [updateBundle],
  );

  const addGarageRecommendation = useCallback(
    (rec: GarageRecommendationVM) =>
      updateBundle(rec.vehicleId, (b) => ({
        ...b,
        garageRecommendations: [rec, ...b.garageRecommendations],
      })),
    [updateBundle],
  );

  const value = useMemo<PrototypeDataValue>(
    () => ({
      vehicles,
      getBundle,
      addVehicle,
      archiveVehicle: (id) => setArchived(id, true),
      restoreVehicle: (id) => setArchived(id, false),
      deleteVehicle,
      updateOdometer,
      addServiceEvent,
      setAlertHandled,
      addGarageRecommendation,
      network,
      setNetwork,
      account,
      setAccount,
      isDemoData,
    }),
    [
      vehicles,
      getBundle,
      addVehicle,
      setArchived,
      deleteVehicle,
      updateOdometer,
      addServiceEvent,
      setAlertHandled,
      addGarageRecommendation,
      network,
      account,
      isDemoData,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrototypeData(): PrototypeDataValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePrototypeData must be used inside PrototypeDataProvider');
  return v;
}

/** Vehicle-scoped bundle for an explicit vehicle id. */
export function useVehicleData(vehicleId: string | null): VehicleDataBundle {
  const { getBundle } = usePrototypeData();
  return vehicleId ? getBundle(vehicleId) : emptyBundle();
}
