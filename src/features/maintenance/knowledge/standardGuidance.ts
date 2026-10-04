import { fuelOf } from '@/discovery/maintenance/msource/fingerprint';
import type { VehicleType } from '@/domain';
import { he } from '@/i18n/he';

import { engineFamilyFor, type GuidanceInterval, type GuidanceItem } from './engineFamilyGuidance';

/**
 * Maintenance GUIDANCE (owner decisions 2026-10-03 / 2026-10-04): never the manufacturer's schedule.
 *  - engine family: when the registry engine code matches one family exactly (engineFamilyGuidance);
 *  - otherwise by propulsion type (petrol / diesel / hybrid / electric / two-wheelers).
 * Shown only in its own labelled card while the vehicle has no schedule item; never a requirement —
 * never in the plan, dues, reminders or "next service", never verified.
 */
export interface GuidanceRow {
  key: string;
  /** The item (with "-inspect" for an inspection): stable test / display id. */
  item: string;
  label: string;
  interval: string;
}

export interface Guidance {
  kind: 'engine_family' | 'propulsion';
  /** The matched family (engine-family guidance only). */
  family?: string;
  rows: GuidanceRow[];
}

const nf = new Intl.NumberFormat('en-US');

function intervalText(i: Pick<GuidanceInterval, 'km' | 'months'>): string {
  const g = he.maintenancePlan.standard;
  if (i.km != null && i.months != null) return g.kmOrMonths(nf.format(i.km), i.months);
  if (i.km != null) return g.km(nf.format(i.km));
  return g.months(i.months ?? 0);
}

function rowText(i: GuidanceInterval): string {
  const g = he.maintenancePlan.standard;
  const every = intervalText(i);
  if (!i.first) return every;
  const first =
    i.first.km != null && i.first.months != null
      ? g.firstKmOrMonths(nf.format(i.first.km), i.first.months)
      : i.first.km != null
        ? g.firstKm(nf.format(i.first.km))
        : g.firstMonths(i.first.months ?? 0);
  return g.firstThen(first, every);
}

function labelOf(item: GuidanceItem, inspect?: boolean): string {
  const g = he.maintenancePlan.standard;
  const base = g.items[item];
  return inspect && !g.inspectionItems.includes(item) ? g.inspectionOf(base) : base;
}

const rows = (intervals: readonly GuidanceInterval[]): GuidanceRow[] =>
  intervals.map((i, n) => ({
    key: `${i.item}${i.inspect ? '-inspect' : ''}-${n}`,
    item: `${i.item}${i.inspect ? '-inspect' : ''}`,
    label: labelOf(i.item, i.inspect),
    interval: rowText(i),
  }));

/** Two-wheelers (owner decision 2026-10-04: concrete values, no ranges). */
const TWO_WHEELER: GuidanceInterval[] = [
  { item: 'oil_and_filter', km: 3000, months: 12 },
  { item: 'spark_plugs', km: 6000, months: 12 },
  { item: 'valve_clearance', km: 6000, months: 12, inspect: true },
  { item: 'brake_fluid', km: 12000, months: 24 },
];

const ICE: GuidanceInterval[] = [
  { item: 'oil_and_filter', km: 15000, months: 12 },
  { item: 'air_filter', km: 30000 },
  { item: 'cabin_filter', km: 30000 },
  { item: 'brake_fluid', months: 24 },
];

export function guidanceFor(vehicle: {
  kind: VehicleType;
  manufacturer: string;
  engineCode?: string | null;
  fuel?: string | null;
}): Guidance {
  if (vehicle.kind === 'car') {
    const family = engineFamilyFor(vehicle);
    if (family) return { kind: 'engine_family', family: family.name, rows: rows(family.intervals) };
  }
  if (vehicle.kind === 'motorcycle' || vehicle.kind === 'scooter') {
    return { kind: 'propulsion', rows: rows(TWO_WHEELER) };
  }
  const p = fuelOf(vehicle.fuel ?? undefined);
  if (p === 'electric') {
    return {
      kind: 'propulsion',
      rows: rows([
        { item: 'brake_fluid', months: 24 },
        { item: 'cabin_filter', km: 30000 },
      ]),
    };
  }
  // Spark plugs only for spark-ignition engines whose fuel is known (never diesel / unknown).
  const spark = p === 'petrol' || p === 'hybrid' || p === 'plugin_hybrid' || p === 'lpg';
  return {
    kind: 'propulsion',
    rows: rows(spark ? [...ICE, { item: 'spark_plugs', km: 60000 }] : ICE),
  };
}
