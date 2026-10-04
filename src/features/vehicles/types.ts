/**
 * UI view-model for a vehicle as displayed by the shell. The authoritative domain model is
 * introduced in M04 (src/domain); adapters map domain → this view-model in M13.
 */
import type { ExteriorPhase } from '@/domain';
import type { VehicleSpec } from '@/persistence/repositories/vehicleSpec';

export type VehicleKind = 'car' | 'motorcycle' | 'scooter';

export interface VehicleSummary {
  id: string;
  kind: VehicleKind;
  manufacturer: string;
  model: string;
  year: number;
  /** Registration (license plate) number, shown to identify the target vehicle. */
  registration: string;
  odometerKm: number;
  /** ISO date of the odometer measurement. */
  odometerMeasuredAt: string;
  archived: boolean;
  /** Identity details when known (never invented; absent stays absent). */
  trim?: string;
  modelCode?: string;
  engine?: string;
  /** Manufacturer engine code (e.g. "CGGB"); absent when unknown. */
  engineCode?: string;
  fuel?: string;
  color?: string;
  /** Exterior phase of the generation, when established (registry rule or the user). */
  exteriorPhase?: ExteriorPhase;
  exteriorPhaseSource?: 'registry' | 'user';
  /** VIN with the final characters masked for display (SPEC: minimise exposure). */
  vinMasked?: string;
  /**
   * Test (טסט) valid until (ISO): the owner's date, else the registry's licence validity (cars;
   * the two-wheeler dataset states none). Absent when unknown.
   */
  testUntil?: string;
  testSource?: 'registry' | 'user';
  /** Insurance expiry dates the owner entered (absent when not entered). */
  insurance?: {
    compulsoryUntil?: string;
    otherUntil?: string;
    otherKind?: 'comprehensive' | 'third_party';
  };
  /** The vehicle's spec as the owner entered it (absent when nothing was entered). */
  spec?: VehicleSpec;
}

export function vehicleDisplayName(v: Pick<VehicleSummary, 'manufacturer' | 'model' | 'year'>) {
  return `${v.manufacturer} ${v.model} ${v.year}`;
}
