import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { todayIso } from '@/features/vehicles/format';
import type { VehicleSummary } from '@/features/vehicles/types';

import {
  DataCtx,
  emptyBundle,
  type AccountState,
  type AttachmentInput,
  type AppDataValue,
  type NetworkMode,
} from './DataContext';
import { uploadAuthority } from './documentUpload';
import type {
  AlertVM,
  DocumentKind,
  GarageRecommendationVM,
  ServiceEventVM,
  VehicleDataBundle,
} from './types';

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
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

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
    (event: ServiceEventVM, attachment?: AttachmentInput) =>
      updateBundle(event.vehicleId, (b) => ({
        ...b,
        history: [event, ...b.history].sort((x, y) => y.date.localeCompare(x.date)),
        deferred: [
          ...(event.deferredItemIds ?? []).map((itemId) => ({
            id: `def-${event.id}-${itemId}`,
            vehicleId: event.vehicleId,
            title: b.schedule.next?.items.find((i) => i.id === itemId)?.title ?? itemId,
            deferredAt: event.date,
          })),
          ...b.deferred,
        ],
        documents: attachment
          ? [
              {
                id: attachment.documentId,
                vehicleId: event.vehicleId,
                kind: 'invoice' as const,
                title: attachment.title,
                addedAt: event.date,
                pages: 1,
                authority: 'garage_document' as const,
                verification: 'pending' as const,
                extraction: 'partial' as const,
              },
              ...b.documents,
            ]
          : b.documents,
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

  const addDocument = useCallback(
    (vehicleId: string, attachment: AttachmentInput, kind: DocumentKind) =>
      updateBundle(vehicleId, (b) => ({
        ...b,
        documents: [
          {
            id: attachment.documentId,
            vehicleId,
            kind,
            title: attachment.title,
            addedAt: new Date().toISOString().slice(0, 10),
            authority: uploadAuthority(kind),
            verification: 'pending' as const,
            extraction: 'none' as const,
          },
          ...b.documents,
        ],
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
      addDocument,
      deletionPreview: async (vehicleId: string) => {
        const b = data[vehicleId] ?? emptyBundle();
        return {
          serviceEvents: b.history.length,
          documents: b.documents.length,
          odometerReadings: b.readings?.length ?? 1,
          alerts: b.alerts.length,
          garageRecommendations: b.garageRecommendations.length,
        };
      },
      // Prototype: a snoozed alert simply leaves the list for this session.
      snoozeAlert: (vehicleId: string, alertId: string) =>
        updateBundle(vehicleId, (b) => ({
          ...b,
          alerts: b.alerts.filter((a) => a.id !== alertId),
        })),
      // Prototype documents have no stored file.
      getOriginal: async () => null,
      openOriginal: async () => false,
      network,
      setNetwork,
      account,
      setAccount,
      // Prototype: nothing is sent anywhere (the demo account screen sets the state directly).
      requestAccountCode: async () => ({ ok: true }) as const,
      verifyAccountCode: async (email: string) => {
        setAccount({ hasAccount: true, email, lastBackupAt: todayIso() });
        return { ok: true } as const;
      },
      syncNow: () => undefined,
      acknowledgeConflicts: () => undefined,
      signOutAccount: async () => setAccount({ hasAccount: false }),
      today: () => todayIso(),
      notificationsEnabled,
      setNotificationsEnabled,
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
      addDocument,
      updateBundle,
      data,
      network,
      account,
      notificationsEnabled,
      isDemoData,
    ],
  );

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
