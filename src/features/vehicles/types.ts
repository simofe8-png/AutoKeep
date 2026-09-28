/**
 * UI view-model for a vehicle as displayed by the shell. The authoritative domain model is
 * introduced in M04 (src/domain); adapters map domain → this view-model in M13.
 */
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
  /** VIN with the final characters masked for display (SPEC: minimise exposure). */
  vinMasked?: string;
}

export function vehicleDisplayName(v: Pick<VehicleSummary, 'manufacturer' | 'model' | 'year'>) {
  return `${v.manufacturer} ${v.model} ${v.year}`;
}
