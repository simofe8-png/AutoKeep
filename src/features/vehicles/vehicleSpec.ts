import type { TaskCode } from '@/domain';
import { he } from '@/i18n/he';
import {
  EMPTY_VEHICLE_SPEC,
  VEHICLE_SPEC_FIELDS,
  type VehicleSpec,
  type VehicleSpecField,
} from '@/persistence/repositories/vehicleSpec';

/**
 * "מפרט הרכב" (owner decision 2026-10-05): the owner writes the vehicle's oil, fluids and tyres once;
 * they are shown on the spec page, beside the matching maintenance item and in Garage Mode. Never
 * filled by the app on its own.
 */

export type SpecForm = Record<VehicleSpecField, string>;

/** Field groups on the spec page, in order. */
export const SPEC_GROUPS: readonly {
  key: 'oil' | 'fluids' | 'tires' | 'notes';
  fields: readonly VehicleSpecField[];
}[] = [
  { key: 'oil', fields: ['oilViscosity', 'oilStandard', 'oilCapacity'] },
  { key: 'fluids', fields: ['coolant', 'brakeFluid', 'transmissionOil'] },
  { key: 'tires', fields: ['tireSize', 'tirePressureFront', 'tirePressureRear'] },
  { key: 'notes', fields: ['notes'] },
];

export const SPEC_MAX = 60;
export const SPEC_NOTES_MAX = 500;

export function specToForm(spec: VehicleSpec | undefined): SpecForm {
  const s = spec ?? EMPTY_VEHICLE_SPEC;
  return Object.fromEntries(VEHICLE_SPEC_FIELDS.map((f) => [f, s[f] ?? ''])) as SpecForm;
}

/** The form as stored: trimmed, empty = not entered, capped lengths. */
export function formToSpec(form: SpecForm): VehicleSpec {
  const spec = { ...EMPTY_VEHICLE_SPEC };
  for (const f of VEHICLE_SPEC_FIELDS) {
    const v = (form[f] ?? '').trim();
    spec[f] = v ? v.slice(0, f === 'notes' ? SPEC_NOTES_MAX : SPEC_MAX) : null;
  }
  return spec;
}

export function hasSpec(spec: VehicleSpec | undefined): spec is VehicleSpec {
  return Boolean(spec && VEHICLE_SPEC_FIELDS.some((f) => spec[f]));
}

const join = (parts: (string | null)[]) => parts.filter(Boolean).join(' · ');

/** What the spec says for a maintenance task (e.g. the oil for "engine_oil"); null when nothing. */
export function specForTask(task: TaskCode | string, spec: VehicleSpec | undefined): string | null {
  if (!spec) return null;
  const line =
    task === 'engine_oil' || task === 'periodic_service'
      ? join([spec.oilViscosity, spec.oilStandard, spec.oilCapacity])
      : task === 'brake_fluid'
        ? join([spec.brakeFluid])
        : task === 'coolant'
          ? join([spec.coolant])
          : task === 'transmission_fluid'
            ? join([spec.transmissionOil])
            : '';
  return line || null;
}

/** The spec in short pieces (Garage Mode chips, the vehicle row); empty when nothing entered. */
export function specChips(spec: VehicleSpec | undefined): { label: string; value: string }[] {
  if (!hasSpec(spec)) return [];
  const s = he.vehicleSpec.short;
  const rows: [string, string | null][] = [
    [s.oil, join([spec.oilViscosity, spec.oilStandard, spec.oilCapacity]) || null],
    [s.coolant, spec.coolant],
    [s.brakeFluid, spec.brakeFluid],
    [s.transmissionOil, spec.transmissionOil],
    [s.tires, spec.tireSize],
    [s.pressure, tirePressure(spec)],
  ];
  return rows
    .filter((r): r is [string, string] => Boolean(r[1]))
    .map(([label, value]) => ({ label, value }));
}

/** One line for the vehicle screen row; null when nothing entered (the notes alone count). */
export function specSummary(spec: VehicleSpec | undefined): string | null {
  if (!hasSpec(spec)) return null;
  const chips = specChips(spec);
  return chips.length
    ? chips.map((c) => `${c.label} ${c.value}`).join(' · ')
    : he.vehicleSpec.rowSubtitle;
}

/** Tyre pressure as one value: "front / rear" (or the one entered). */
export function tirePressure(spec: VehicleSpec): string | null {
  const { tirePressureFront: f, tirePressureRear: r } = spec;
  return f && r ? (f === r ? f : `${f} / ${r}`) : (f ?? r);
}
