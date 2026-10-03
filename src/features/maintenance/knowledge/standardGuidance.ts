import { fuelOf } from '@/discovery/maintenance/msource/fingerprint';
import type { VehicleType } from '@/domain';
import { he } from '@/i18n/he';

/**
 * Standard maintenance GUIDANCE by propulsion type (owner decision 2026-10-03, "separate
 * guidance"). General industry intervals — NOT the manufacturer's schedule for this vehicle:
 *  - shown only in their own clearly labelled card, and only while the vehicle has no schedule
 *    item from a manufacturer / owner document;
 *  - never a requirement: they never enter the plan, dues, reminders or "next service", and are
 *    never counted as verified (the product's no-fabrication rule for schedules is unchanged).
 */
export interface GuidanceRow {
  key: string;
  label: string;
  interval: string;
}

export function standardGuidance(
  kind: VehicleType,
  fuel: string | null | undefined,
): GuidanceRow[] {
  const g = he.maintenancePlan.standard;
  if (kind === 'motorcycle' || kind === 'scooter') {
    return [
      { key: 'engine_oil', label: g.engineOil, interval: g.moto },
      { key: 'spark_plugs', label: g.sparkPlug, interval: g.moto },
      { key: 'valve_clearance', label: g.valveClearance, interval: g.moto },
    ];
  }
  const p = fuelOf(fuel ?? undefined);
  const brakes = { key: 'brake_fluid', label: g.brakeFluid, interval: g.every2Years };
  const cabin = { key: 'cabin_filter', label: g.cabinFilter, interval: g.every30k };
  if (p === 'electric') return [brakes, cabin];
  const rows: GuidanceRow[] = [
    { key: 'engine_oil', label: g.oilAndFilter, interval: g.every15kOrYear },
    { key: 'air_filter', label: g.airFilter, interval: g.every30k },
    cabin,
    brakes,
  ];
  // Spark plugs only for spark-ignition engines whose fuel is known (never for diesel / unknown).
  if (p === 'petrol' || p === 'hybrid' || p === 'plugin_hybrid' || p === 'lpg') {
    rows.push({ key: 'spark_plugs', label: g.sparkPlugs, interval: g.every60k });
  }
  return rows;
}
