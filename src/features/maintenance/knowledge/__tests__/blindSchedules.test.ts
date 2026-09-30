import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { distanceKm, isoDate, type IsoDate, type MaintenanceRequirement } from '@/domain';
import { BLIND } from '@/discovery/maintenance/__live__/blindSet';

import { knownRequirements } from '../knownSources';
import {
  buildMaintenancePlan,
  hasServiceInterval,
  missingCoreTasks,
  type MaintenancePlan,
} from '../plan';
import { triangulatedRequirements } from '../triangulated';

/**
 * Source-agnostic maintenance discovery on the UNCHANGED blind set B1–B12 (2026-09-30): what the
 * app builds for each owner from the evidence AutoKeep holds (official catalog + triangulated
 * research). Deterministic; nothing is invented. The owner answers the one usage question the app
 * asks ("normal" conditions); `WRITE_BLIND_REPORT=1` writes the report.
 */
const today = isoDate('2026-09-30') as IsoDate;
const requirements = [...knownRequirements(), ...triangulatedRequirements()];

type Outcome = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT' | 'CONFLICTING';

const every = (r: MaintenanceRequirement) => {
  const i = r.interval;
  const km = distanceKm(i.every);
  return [
    i.first ? `first ${distanceKm(i.first)} km` : null,
    i.firstMonths ? `first ${i.firstMonths} mo` : null,
    km && i.rule !== 'time_only' ? `${km} km` : null,
    i.everyMonths && i.rule !== 'distance_only' ? `${i.everyMonths} mo` : null,
  ]
    .filter(Boolean)
    .join(' / ');
};

function outcomeOf(plan: MaintenancePlan): Outcome {
  if (plan.status === 'ready') return 'COMPLETE';
  if (plan.status === 'partial') return 'PARTIAL';
  return plan.unresolved.some((u) => u.status === 'conflicting') ? 'CONFLICTING' : 'INSUFFICIENT';
}

const results = BLIND.map(([id, label, v]) => {
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
    profile: {
      inServiceDate: isoDate(`${v.modelYear}-01-01`) as IsoDate,
      serviceRegime: null,
      usage: 'normal',
    },
    requirements,
    history: [],
    readings: [{ date: today, km: 50000 }],
    today,
  });
  const items = plan.items.map((i) => ({
    task: i.task,
    action: i.requirement.action,
    interval: every(i.requirement),
    level: i.level,
    confidence: i.confidence,
    independentSources: i.requirement.corroboration?.independentSources ?? 1,
    officialSources: i.requirement.corroboration?.officialSources ?? 1,
    sources: i.requirement.evidence.map((e) => e.documentTitle),
  }));
  return {
    id,
    vehicle: `${v.make} ${v.model} ${v.modelYear}`,
    label,
    outcome: outcomeOf(plan),
    // Usable = a schedule that at least states when to service the vehicle.
    usable: plan.items.length > 0 && hasServiceInterval(plan.facts, plan.items),
    items,
    confidence: {
      high: items.filter((i) => i.confidence === 'high').length,
      medium: items.filter((i) => i.confidence === 'medium').length,
    },
    missingCore: missingCoreTasks(plan.facts, plan.items).map((t) => t.join('|')),
    conflicts: plan.unresolved
      .filter((u) => u.status === 'conflicting')
      .map((u) => ({
        task: u.task,
        action: u.action,
        positions: u.considered
          .filter((c) => c.role === 'conflicting')
          .map(
            (c) =>
              `${every(c.requirement)} (${c.requirement.evidence.map((e) => e.documentTitle).join(', ')})`,
          ),
      })),
    unresolved: plan.unresolved
      .filter((u) => u.status !== 'conflicting')
      .map((u) => `${u.task}:${u.action}:${u.status}`),
    fallback: plan.fallback !== null,
    uploadOffered: plan.requests.some((r) => r.kind === 'upload_booklet'),
  };
});

it('B1–B12: every vehicle gets a schedule labelled with its true completeness, or the fallback', () => {
  for (const r of results) {
    // No schedule, or no established service interval → the dealer / upload fallback.
    expect(r.fallback).toBe(!r.usable);
    if (r.fallback) expect(r.uploadOffered).toBe(true);
    // Every scheduled item is backed by evidence that can drive a plan.
    for (const i of r.items) expect(['A', 'B', 'T']).toContain(i.level);
    // COMPLETE only when every core item is covered.
    if (r.outcome === 'COMPLETE') expect(r.missingCore).toEqual([]);
  }
  if (process.env.WRITE_BLIND_REPORT) {
    writeFileSync(
      join(process.cwd(), 'docs', 'maintenance', 'data', 'triangulation', 'blind_results.json'),
      JSON.stringify(results, null, 2) + '\n',
    );
  }
});
