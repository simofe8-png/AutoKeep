import * as Crypto from 'expo-crypto';
import { createContext, useContext } from 'react';

import type { VehicleSummary } from '@/features/vehicles/types';
import type { AcquiredFile } from '@/providers/acquisition/types';
import type { Integrity } from '@/providers/storage/types';

import type {
  DocumentKind,
  GarageRecommendationVM,
  ServiceEventVM,
  VehicleDataBundle,
} from './types';

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

/** The original document a service record rests on (stored together with the record). */
export interface AttachmentInput {
  /** Reserved when the file was captured, so an extraction draft can reference it. */
  documentId: string;
  file: AcquiredFile;
  title: string;
}

/** The stored original of a document, re-verified against its recorded hash. */
export interface OriginalView {
  uri: string;
  mimeType: string;
  integrity: Integrity;
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
  /** Explicit user confirmation: stores the record (and its original document) atomically. */
  addServiceEvent: (event: ServiceEventVM, attachment?: AttachmentInput) => void;
  setAlertHandled: (vehicleId: string, alertId: string) => void;
  /** "Remind me later": hidden until the date, then shown again if still justified. */
  snoozeAlert: (vehicleId: string, alertId: string, days: number) => void;
  /** T122: adds an uploaded document (the original is kept; nothing is extracted or trusted). */
  addDocument: (vehicleId: string, attachment: AttachmentInput, kind: DocumentKind) => void;
  /** T123: the stored original (null when there is no file, e.g. prototype data). */
  getOriginal: (vehicleId: string, documentId: string) => Promise<OriginalView | null>;
  openOriginal: (vehicleId: string, documentId: string) => Promise<boolean>;
  addGarageRecommendation: (rec: GarageRecommendationVM) => void;
  network: NetworkMode;
  setNetwork: (mode: NetworkMode) => void;
  account: AccountState;
  setAccount: (account: AccountState) => void;
  /**
   * Today's date (YYYY-MM-DD) from the data source's clock — the same clock that validates writes,
   * so a record dated "today" by a screen can never be judged to be in the future.
   */
  today: () => string;
  /** Device notifications opted in by the user (T130). */
  notificationsEnabled: boolean;
  setNotificationsEnabled: (enabled: boolean) => void;
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
