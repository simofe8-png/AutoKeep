import * as Crypto from 'expo-crypto';
import { createContext, useContext } from 'react';

import type { VehicleSummary } from '@/features/vehicles/types';

import type { GarageRecommendationVM, ServiceEventVM, VehicleDataBundle } from './types';

/**
 * The app's data contract (M13). Screens depend only on this interface; it is provided either by
 * the local SQLite store (production) or by the labeled in-memory prototype (demo mode / UI
 * tests). All reads/writes take an explicit vehicleId — nothing is implicitly scoped to "the
 * active vehicle". Writes are applied asynchronously; failures are surfaced by the provider.
 */

export type NetworkMode = 'online' | 'offline';

export interface AccountState {
  hasAccount: boolean;
  email?: string;
  lastBackupAt?: string;
}

/** Identity details captured at onboarding beyond the display summary. */
export interface VehicleDetailsInput {
  trim?: string;
  engine?: string;
  fuel?: string;
  vin?: string;
}

export interface AppDataValue {
  vehicles: readonly VehicleSummary[];
  getBundle: (vehicleId: string) => VehicleDataBundle;
  addVehicle: (
    vehicle: VehicleSummary,
    bundle?: VehicleDataBundle,
    details?: VehicleDetailsInput,
  ) => void;
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
  /** True while the labeled prototype data is shown (demo banner). */
  isDemoData: boolean;
  /** Persisted active vehicle (restored on launch), if the source remembers one. */
  initialActiveVehicleId?: string | null;
  /** Persists the active-vehicle pointer (display context only, invariant 15). */
  rememberActiveVehicle?: (vehicleId: string) => void;
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

/** New stable id for a record created in the UI (UUIDv4, generated on device, offline-safe). */
export function newLocalId(_kind?: string): string {
  return Crypto.randomUUID();
}

export const DataCtx = createContext<AppDataValue | null>(null);

export function useAppData(): AppDataValue {
  const v = useContext(DataCtx);
  if (!v) throw new Error('useAppData must be used inside a data provider');
  return v;
}

/** Vehicle-scoped bundle for an explicit vehicle id. */
export function useVehicleData(vehicleId: string | null): VehicleDataBundle {
  const { getBundle } = useAppData();
  return vehicleId ? getBundle(vehicleId) : emptyBundle();
}
