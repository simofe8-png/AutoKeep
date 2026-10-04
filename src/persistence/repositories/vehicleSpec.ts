import type { Timestamp, VehicleId } from '@/domain';

import type { Executor } from './base';

/**
 * The vehicle's specification as the owner enters it (migration v17, LOCAL ONLY): oil, fluids,
 * tyres and free notes. Free text as typed (e.g. "5W-30", "VW 504.00", "DOT 4"); null = not
 * entered. Vehicle-scoped: every query filters by vehicle_id.
 */
export interface VehicleSpec {
  oilViscosity: string | null;
  oilStandard: string | null;
  oilCapacity: string | null;
  coolant: string | null;
  brakeFluid: string | null;
  transmissionOil: string | null;
  tireSize: string | null;
  tirePressureFront: string | null;
  tirePressureRear: string | null;
  notes: string | null;
}

export type VehicleSpecField = keyof VehicleSpec;

export const VEHICLE_SPEC_FIELDS: readonly VehicleSpecField[] = [
  'oilViscosity',
  'oilStandard',
  'oilCapacity',
  'coolant',
  'brakeFluid',
  'transmissionOil',
  'tireSize',
  'tirePressureFront',
  'tirePressureRear',
  'notes',
];

export const EMPTY_VEHICLE_SPEC: VehicleSpec = {
  oilViscosity: null,
  oilStandard: null,
  oilCapacity: null,
  coolant: null,
  brakeFluid: null,
  transmissionOil: null,
  tireSize: null,
  tirePressureFront: null,
  tirePressureRear: null,
  notes: null,
};

const COLUMNS: Record<VehicleSpecField, string> = {
  oilViscosity: 'oil_viscosity',
  oilStandard: 'oil_standard',
  oilCapacity: 'oil_capacity',
  coolant: 'coolant',
  brakeFluid: 'brake_fluid',
  transmissionOil: 'transmission_oil',
  tireSize: 'tire_size',
  tirePressureFront: 'tire_pressure_front',
  tirePressureRear: 'tire_pressure_rear',
  notes: 'notes',
};

export class VehicleSpecRepository {
  constructor(private readonly db: Executor) {}

  async get(vehicleId: VehicleId): Promise<VehicleSpec> {
    const cols = VEHICLE_SPEC_FIELDS.map((f) => COLUMNS[f]);
    const row = await this.db.first<Record<string, string | null>>(
      `SELECT ${cols.join(', ')} FROM vehicle_spec WHERE vehicle_id = ?`,
      [vehicleId],
    );
    if (!row) return EMPTY_VEHICLE_SPEC;
    const spec = { ...EMPTY_VEHICLE_SPEC };
    for (const f of VEHICLE_SPEC_FIELDS) spec[f] = row[COLUMNS[f]] ?? null;
    return spec;
  }

  async save(vehicleId: VehicleId, spec: VehicleSpec, now: Timestamp): Promise<void> {
    const cols = VEHICLE_SPEC_FIELDS.map((f) => COLUMNS[f]);
    await this.db.run(
      `INSERT INTO vehicle_spec (vehicle_id, ${cols.join(', ')}, updated_at)
       VALUES (?, ${cols.map(() => '?').join(', ')}, ?)
       ON CONFLICT(vehicle_id) DO UPDATE SET ${cols
         .map((c) => `${c} = excluded.${c}`)
         .join(', ')}, updated_at = excluded.updated_at`,
      [vehicleId, ...VEHICLE_SPEC_FIELDS.map((f) => spec[f]), now],
    );
  }
}
