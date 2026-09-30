import { isoDate, type IsoDate } from '@/domain';
import { BLIND } from '@/discovery/maintenance/__live__/blindSet';

import { knownRequirements } from '../knownSources';
import { buildMaintenancePlan } from '../plan';

/**
 * §24 on the committed blind set B1–B12: what the app shows each owner today, from the evidence
 * AutoKeep has (the live pipeline extracted nothing for any blind vehicle — see
 * docs/maintenance/ISRAEL_COVERAGE_MATRIX.md). No schedule is invented.
 */
const today = isoDate('2026-09-30') as IsoDate;
const outcomes = BLIND.map(([id, , v]) => {
  const plan = buildMaintenancePlan({
    vehicle: {
      id: `blind-${id}`,
      kind: v.kind,
      manufacturer: v.make,
      model: v.model,
      year: v.modelYear!,
      engine: v.displacementCc ? `${v.displacementCc} cc` : undefined,
      engineCode: v.engineCode,
      fuel: v.powertrain,
    },
    profile: null,
    requirements: knownRequirements(),
    history: [],
    readings: [{ date: today, km: 50000 }],
    today,
  });
  return {
    id,
    usableSchedule: plan.status === 'ready',
    partialSchedule: plan.status === 'partial',
    fallbackTriggered: plan.fallback !== null,
    uploadOffered: plan.requests.some((r) => r.kind === 'upload_booklet'),
    reasons: plan.fallback?.reasons ?? [],
  };
});

it('B1–B12: no guessed schedule; every vehicle gets the fallback with a direct upload', () => {
  for (const o of outcomes) {
    expect(o).toMatchObject({
      usableSchedule: false,
      partialSchedule: false,
      fallbackTriggered: true,
      uploadOffered: true,
    });
  }
  // The recorded reason per vehicle — precise, never a generic "not found".
  expect(Object.fromEntries(outcomes.map((o) => [o.id, o.reasons.join(',')]))).toEqual({
    B1: 'manual_access_required',
    B2: 'permission_required',
    B3: 'access_policy_unresolved',
    B4: 'official_source_pending',
    B5: 'permission_required',
    B6: 'permission_required',
    B7: 'no_digital_source',
    B8: 'no_digital_source',
    B9: 'no_digital_source',
    B10: 'official_source_pending',
    B11: 'permission_required',
    B12: 'official_source_pending',
  });
});
