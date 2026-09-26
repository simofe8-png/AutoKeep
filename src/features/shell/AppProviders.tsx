import { useState, type ReactNode } from 'react';

import { useAppData } from '@/features/data/DataContext';
import { currentDataSource } from '@/features/data/dataSource';
import { LocalDataProvider } from '@/features/data/LocalDataProvider';
import { PrototypeDataProvider } from '@/features/data/PrototypeDataContext';
import { ActiveVehicleProvider } from '@/features/vehicles/ActiveVehicleContext';
import { MOCK_VEHICLE_DATA } from '@/mocks/vehicleData';
import { MOCK_VEHICLES } from '@/mocks/vehicles';

function ActiveVehicleBridge({ children }: { children: ReactNode }) {
  const { vehicles, isDemoData, initialActiveVehicleId, rememberActiveVehicle } = useAppData();
  return (
    <ActiveVehicleProvider
      vehicles={vehicles}
      isDemoData={isDemoData}
      initialActiveId={initialActiveVehicleId}
      onActiveChange={rememberActiveVehicle}
    >
      {children}
    </ActiveVehicleProvider>
  );
}

/**
 * App-wide data providers. Screens consume the AppDataValue contract; the source is the local
 * SQLite store, or the labeled prototype data in explicit demo mode.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [source] = useState(currentDataSource);
  if (source.kind === 'demo') {
    return (
      <PrototypeDataProvider initialVehicles={MOCK_VEHICLES} initialData={MOCK_VEHICLE_DATA}>
        <ActiveVehicleBridge>{children}</ActiveVehicleBridge>
      </PrototypeDataProvider>
    );
  }
  return (
    <LocalDataProvider openDatabase={source.openDatabase} ids={source.ids} clock={source.clock}>
      <ActiveVehicleBridge>{children}</ActiveVehicleBridge>
    </LocalDataProvider>
  );
}
