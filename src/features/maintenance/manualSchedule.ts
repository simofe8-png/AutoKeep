import type { IsoDate, MaintenanceRequirement, RequirementInterval, TaskCode } from '@/domain';
import type { ManualScheduleItem } from '@/persistence/repositories/manualSchedule';

/**
 * The owner's own maintenance items (owner decision 2026-10-04: the schedule is what the owner
 * enters or approves). Pure: form validation and the schedule item an entry becomes.
 */

/** Items the owner picks from (any other item is 'custom', named by the owner). */
export const MANUAL_TASKS: readonly TaskCode[] = [
  'periodic_service',
  'engine_oil',
  'oil_filter',
  'air_filter',
  'cabin_filter',
  'fuel_filter',
  'spark_plugs',
  'brake_fluid',
  'coolant',
  'timing_belt',
  'transmission_fluid',
  'drive_chain',
  'valve_clearance',
  'tire_rotation',
];

export type ManualTask = TaskCode | 'custom';

export interface ManualItemForm {
  task: ManualTask | null;
  /** The owner's own name (required for 'custom'). */
  title: string;
  action: 'replacement' | 'inspection';
  km: string;
  months: string;
  lastDate: string;
  lastKm: string;
}

export interface ManualItemErrors {
  task?: boolean;
  title?: boolean;
  interval?: boolean;
  km?: boolean;
  months?: boolean;
  lastDate?: boolean;
  lastKm?: boolean;
}

const int = (s: string): number | null | undefined => {
  const t = s.replace(/[,\s]/g, '');
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : undefined;
};

/**
 * Validates the form. `parseDate` turns the typed date into ISO (null = empty, undefined =
 * invalid). The last-done date may not be in the future.
 */
export function validateManualItem(
  f: ManualItemForm,
  today: string,
  parseDate: (s: string) => string | null | undefined,
):
  | {
      ok: true;
      value: Omit<ManualScheduleItem, 'id' | 'vehicleId'>;
    }
  | { ok: false; errors: ManualItemErrors } {
  const errors: ManualItemErrors = {};
  const km = int(f.km);
  const months = int(f.months);
  const lastKm = int(f.lastKm);
  const lastDate = parseDate(f.lastDate);
  if (!f.task) errors.task = true;
  if (f.task === 'custom' && !f.title.trim()) errors.title = true;
  if (f.title.trim().length > 80) errors.title = true;
  if (km === undefined || (km != null && (km < 100 || km > 500_000))) errors.km = true;
  if (months === undefined || (months != null && (months < 1 || months > 240))) {
    errors.months = true;
  }
  if (!errors.km && !errors.months && km == null && months == null) errors.interval = true;
  if (lastDate === undefined || (lastDate != null && lastDate > today)) errors.lastDate = true;
  if (lastKm === undefined || (lastKm != null && lastKm > 2_000_000)) errors.lastKm = true;
  // "Last done" is optional, but what the interval counts from must be stated: the date for a
  // time interval, the odometer for a distance interval.
  const stated = lastDate != null || lastKm != null;
  if (stated && months != null && lastDate == null) errors.lastDate = true;
  if (stated && km != null && lastKm == null) errors.lastKm = true;
  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      task: f.task!,
      action: f.action,
      title: f.title.trim(),
      intervalKm: km ?? null,
      intervalMonths: months ?? null,
      lastDoneDate: lastDate ?? null,
      lastDoneKm: lastKm ?? null,
    },
  };
}

/**
 * When the item was last done, as the plan counts from it; a date the owner did not state (a
 * distance-only item) sorts before any recorded service, so a recorded service always wins.
 */
export function manualLastDone(
  item: Pick<ManualScheduleItem, 'lastDoneDate' | 'lastDoneKm'>,
): { date: IsoDate; odometerKm: number } | null {
  if (item.lastDoneDate == null && item.lastDoneKm == null) return null;
  return {
    date: (item.lastDoneDate ?? '1900-01-01') as IsoDate,
    odometerKm: item.lastDoneKm ?? 0,
  };
}

/** A custom item has no known task: it is tracked as its own item. */
export const isCustom = (item: Pick<ManualScheduleItem, 'task'>) =>
  !MANUAL_TASKS.includes(item.task as TaskCode);

/** The schedule requirement the owner's item becomes (authority: owner-entered). */
export function manualRequirement(
  item: ManualScheduleItem,
  title: string,
  at: IsoDate,
): MaintenanceRequirement {
  const km = item.intervalKm;
  const months = item.intervalMonths;
  const interval: RequirementInterval = {
    ...(km != null ? { every: { value: km, unit: 'km' as const } } : {}),
    ...(months != null ? { everyMonths: months } : {}),
    rule:
      km != null && months != null ? 'whichever_first' : km != null ? 'distance_only' : 'time_only',
    repeats: true,
  };
  return {
    id: `manual:${item.id}`,
    task: isCustom(item) ? 'general_inspection' : (item.task as TaskCode),
    taskText: title,
    action: item.action,
    interval,
    applicability: {},
    authority: 'owner_entered',
    evidence: [
      {
        documentId: `manual:${item.id}`,
        documentTitle: title,
        authority: 'owner_entered',
        markets: [],
      },
    ],
    verification: 'candidate',
    extraction: { method: 'user_entered', by: 'owner', at },
  };
}
