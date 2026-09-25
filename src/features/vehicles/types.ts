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
}

export function vehicleDisplayName(v: Pick<VehicleSummary, 'manufacturer' | 'model' | 'year'>) {
  return `${v.manufacturer} ${v.model} ${v.year}`;
}
