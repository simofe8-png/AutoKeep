import type { VehicleSummary } from './types';

/**
 * "השלמת פרופיל הרכב" (owner decision 2026-10-05): what the owner still has to add for the app to
 * work fully, in order of importance. Required items make up the percentage; optional ones never
 * lower it.
 */
export type ProfileItemKey =
  'details' | 'test' | 'odometer' | 'schedule' | 'insurance' | 'pressure' | 'photo';

export interface ProfileItem {
  key: ProfileItemKey;
  done: boolean;
  required: boolean;
}

export interface ProfileCompletion {
  items: ProfileItem[];
  /** 0–100, over the required items only. */
  percent: number;
  /** Every required item is done. */
  complete: boolean;
}

export function profileCompletion(
  vehicle: Pick<VehicleSummary, 'testUntil' | 'testSource' | 'insurance' | 'spec'>,
  facts: { hasSchedule: boolean; hasPhoto: boolean },
): ProfileCompletion {
  const fromRegistry = vehicle.testSource === 'registry';
  const items: ProfileItem[] = [
    // Vehicle details always come from the registry; the test too, for cars.
    { key: 'details', done: true, required: true },
    { key: 'odometer', done: true, required: true },
    { key: 'schedule', done: facts.hasSchedule, required: true },
    // Without a registry test date (two-wheelers), the owner enters it.
    ...(fromRegistry
      ? []
      : [{ key: 'test' as const, done: Boolean(vehicle.testUntil), required: true }]),
    {
      key: 'insurance',
      done: Boolean(vehicle.insurance?.compulsoryUntil || vehicle.insurance?.otherUntil),
      required: true,
    },
    {
      key: 'pressure',
      done: Boolean(vehicle.spec?.tirePressureFront || vehicle.spec?.tirePressureRear),
      required: false,
    },
    { key: 'photo', done: facts.hasPhoto, required: false },
  ];
  const required = items.filter((i) => i.required);
  const percent = Math.round((required.filter((i) => i.done).length / required.length) * 100);
  return { items, percent, complete: required.every((i) => i.done) };
}
