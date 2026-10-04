import type { IsoDate, MaintenanceRequirement, RequirementInterval, TaskCode } from '@/domain';
import type {
  ManualScheduleItem,
  ManualScheduleRow,
} from '@/persistence/repositories/manualSchedule';

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

const int = (s: string): number | null | undefined => {
  const t = s.replace(/[,\s]/g, '');
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : undefined;
};

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

/** Where the owner's item starts counting without a stated last service (entry point). */
export function manualStartFrom(
  item: Pick<ManualScheduleItem, 'startKm' | 'startDate'>,
): { date: IsoDate; odometerKm: number } | null {
  return item.startKm != null && item.startDate
    ? { date: item.startDate as IsoDate, odometerKm: item.startKm }
    : null;
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

// ---------- the owner's table (owner decision 2026-10-04) ----------

/** Suggested item names (tap to add a row); each maps to its task. */
export const TABLE_SUGGESTIONS: readonly {
  label: string;
  task: TaskCode;
  action: 'replacement' | 'inspection';
}[] = [
  { label: 'שמן מנוע ומסנן שמן', task: 'engine_oil', action: 'replacement' },
  { label: 'מסנן אוויר', task: 'air_filter', action: 'replacement' },
  { label: 'מסנן מזגן', task: 'cabin_filter', action: 'replacement' },
  { label: 'נוזל בלמים', task: 'brake_fluid', action: 'replacement' },
  { label: 'מצתים', task: 'spark_plugs', action: 'replacement' },
  { label: 'נוזל קירור', task: 'coolant', action: 'replacement' },
  { label: 'רצועת תזמון', task: 'timing_belt', action: 'replacement' },
  { label: 'מסנן דלק', task: 'fuel_filter', action: 'replacement' },
  { label: 'שמן תיבת הילוכים', task: 'transmission_fluid', action: 'replacement' },
  { label: 'טיפול תקופתי', task: 'periodic_service', action: 'replacement' },
  { label: 'שרשרת הנעה', task: 'drive_chain', action: 'replacement' },
  { label: 'בדיקת מרווח שסתומים', task: 'valve_clearance', action: 'inspection' },
];

export interface TableRow {
  /** Stable key in the editor. */
  key: string;
  /** The stored item (absent: a new row). */
  id?: string;
  title: string;
  km: string;
  months: string;
  /** The owner's note on the row (optional; e.g. a part number). */
  note?: string;
}

export const NOTE_MAX = 200;

export type RowErrors = { title?: boolean; km?: boolean; months?: boolean; interval?: boolean };

/**
 * The table as rows to save: a fully empty row is ignored; every other row needs a name and every
 * km and / or every months. A suggested name keeps its task; any other name is the owner's own item
 * (an "inspection" when it says so).
 */
export function tableToRows(
  rows: readonly TableRow[],
): { ok: true; rows: ManualScheduleRow[] } | { ok: false; errors: Record<string, RowErrors> } {
  const errors: Record<string, RowErrors> = {};
  const out: ManualScheduleRow[] = [];
  for (const r of rows) {
    const title = r.title.trim();
    const note = (r.note ?? '').trim().slice(0, NOTE_MAX);
    if (!title && !r.km.trim() && !r.months.trim() && !note) continue;
    const km = int(r.km);
    const months = int(r.months);
    const e: RowErrors = {};
    if (!title || title.length > 80) e.title = true;
    if (km === undefined || (km != null && (km < 100 || km > 500_000))) e.km = true;
    if (months === undefined || (months != null && (months < 1 || months > 240))) e.months = true;
    if (!e.km && !e.months && km == null && months == null) e.interval = true;
    if (Object.keys(e).length) {
      errors[r.key] = e;
      continue;
    }
    const known = TABLE_SUGGESTIONS.find((x) => x.label === title);
    out.push({
      ...(r.id ? { id: r.id } : {}),
      task: known?.task ?? 'custom',
      action: known?.action ?? (/^בדיק/.test(title) ? 'inspection' : 'replacement'),
      title,
      intervalKm: km ?? null,
      intervalMonths: months ?? null,
      ...(note ? { note } : {}),
    });
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, rows: out };
}

/** The stored items as editable rows (the owner's own name, else the task's name). */
export function itemsToTable(
  items: readonly ManualScheduleItem[],
  taskName: (task: string) => string,
): TableRow[] {
  return items.map((m) => ({
    key: m.id,
    id: m.id,
    title: m.title || taskName(m.task),
    km: m.intervalKm != null ? String(m.intervalKm) : '',
    months: m.intervalMonths != null ? String(m.intervalMonths) : '',
    note: m.note ?? '',
  }));
}
