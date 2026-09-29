import { isoDate, type MaintenanceRequirement, type TaskCode } from '@/domain';

/**
 * SYNTHETIC maintenance rules for device acceptance only (owner run 2026-09-29). Loaded only in a
 * development bundle started with EXPO_PUBLIC_SYNTHETIC_MAINTENANCE=1, and they apply only to a
 * hand-entered make "SYNTHETIC TEST". The numbers are invented and labelled on screen as test
 * data; they are not manufacturer requirements and never apply to a real vehicle.
 */
let enabled = false;

/** Switched on only by the data source when EXPO_PUBLIC_SYNTHETIC_MAINTENANCE=1 (dev bundles). */
export function enableSyntheticMaintenance(on: boolean): void {
  enabled = on;
}

const TITLE = 'נתוני בדיקה סינתטיים — לא דרישת יצרן';

function rule(
  task: TaskCode,
  action: MaintenanceRequirement['action'],
  interval: MaintenanceRequirement['interval'],
): MaintenanceRequirement {
  return {
    id: `synthetic-demo-${task}`,
    task,
    action,
    interval,
    applicability: { makes: ['synthetic test'], markets: ['IL'] },
    authority: 'manufacturer',
    evidence: [
      {
        documentId: 'synthetic-demo',
        documentTitle: TITLE,
        authority: 'manufacturer',
        markets: ['IL'],
        page: 1,
        table: 'SYNTHETIC',
      },
    ],
    verification: 'verified',
    extraction: { method: 'synthetic_test', by: 'device acceptance', at: isoDate('2026-09-29') },
    synthetic: true,
  };
}

export function syntheticDemoRequirements(): MaintenanceRequirement[] {
  if (!enabled) return [];
  return [
    rule('periodic_service', 'other', {
      every: { value: 11111, unit: 'km' },
      everyMonths: 12,
      rule: 'whichever_first',
      repeats: true,
    }),
    rule('brake_fluid', 'replacement', { everyMonths: 24, rule: 'time_only', repeats: true }),
    rule('air_filter', 'inspection', {
      every: { value: 22222, unit: 'km' },
      rule: 'distance_only',
      repeats: true,
    }),
  ];
}
