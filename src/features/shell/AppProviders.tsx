import type { ReactNode } from 'react';

import { PrototypeDataProvider, usePrototypeData } from '@/features/data/PrototypeDataContext';
import { ActiveVehicleProvider } from '@/features/vehicles/ActiveVehicleContext';
import { MOCK_VEHICLE_DATA } from '@/mocks/vehicleData';
import { MOCK_VEHICLES } from '@/mocks/vehicles';

function ActiveVehicleBridge({ children }: { children: ReactNode }) {
  const { vehicles, isDemoData } = usePrototypeData();
  return (
    <ActiveVehicleProvider vehicles={vehicles} isDemoData={isDemoData}>
      {children}
    </ActiveVehicleProvider>
  );
}

/**
 * App-wide data providers. M02–M03 use labeled mock data (UI-first); M13 swaps the data source
 * for persistence adapters without changing screens.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PrototypeDataProvider initialVehicles={MOCK_VEHICLES} initialData={MOCK_VEHICLE_DATA}>
      <ActiveVehicleBridge>{children}</ActiveVehicleBridge>
    </PrototypeDataProvider>
  );
}
