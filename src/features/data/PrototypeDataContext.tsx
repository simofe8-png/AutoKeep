import { useCallback, useMemo, useState, type ReactNode } from 'react';

import type { VehicleSummary } from '@/features/vehicles/types';

import {
  DataCtx,
  emptyBundle,
  type AccountState,
  type AppDataValue,
  type NetworkMode,
} from './DataContext';
import type { AlertVM, GarageRecommendationVM, ServiceEventVM, VehicleDataBundle } from './types';

/**
 * PROTOTYPE data provider — labeled mock data held in memory (demo mode and UI tests). The app's
 * default source is the local SQLite store (LocalDataProvider, M13). Implements the same
 * AppDataValue contract, so screens do not know which source is active.
 */

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
        // Typed in by the user: never garage-document evidence.
        garageRecommendations: [{ ...rec, authority: 'user_report' }, ...b.garageRecommendations],
      })),
    [updateBundle],
  );

  const value = useMemo<AppDataValue>(
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

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
