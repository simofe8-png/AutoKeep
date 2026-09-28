/**
 * MOCK DATA — UI prototype only (M01–M03, UX_DESIGN_BASELINE "UI-first freeze").
 * These are illustrative placeholders, not real vehicles or real maintenance information.
 * The UI shows a "demo data" banner whenever this source is active.
 */
import type { VehicleSummary } from '@/features/vehicles/types';

export const MOCK_VEHICLES: readonly VehicleSummary[] = [
  {
    id: 'mock-vehicle-car',
    kind: 'car',
    manufacturer: 'טויוטה',
    model: 'קורולה',
    year: 2019,
    registration: '12-345-67',
    odometerKm: 84250,
    odometerMeasuredAt: '2026-09-10',
    archived: false,
    engine: '1.8',
    fuel: 'בנזין',
  },
  {
    id: 'mock-vehicle-motorcycle',
    kind: 'motorcycle',
    manufacturer: 'הונדה',
    model: 'CB500F',
    year: 2021,
    registration: '123-45-678',
    odometerKm: 18420,
    odometerMeasuredAt: '2026-06-02',
    archived: false,
    engine: '471 סמ״ק',
    fuel: 'בנזין',
  },
  {
    id: 'mock-vehicle-scooter',
    kind: 'scooter',
    manufacturer: 'ימאהה',
    model: 'XMAX 300',
    year: 2022,
    registration: '98-765-43',
    odometerKm: 9650,
    odometerMeasuredAt: '2026-09-01',
    archived: false,
    engine: '292 סמ״ק',
    fuel: 'בנזין',
  },
];
