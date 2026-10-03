import { distanceKm, KM_PER_MILE, type MaintenanceRequirement, type TaskCode } from '@/domain';

import type { ExtractedRequirement } from '../types';
import type { CanonicalOperation, EvidenceRecord, IntervalRule, MatchResult } from './types';

/**
 * Normalization of extracted requirements into M-SOURCE evidence records (Phase 11). Units are
 * kept as stated (miles stay miles; km are derived); months/years are normalized to months; the
 * operation vocabulary is canonical, and anything that does not map SAFELY is OTHER — it is
 * never forced into a wrong category.
 */

const DIRECT: Partial<Record<TaskCode, CanonicalOperation>> = {
  periodic_service: 'periodic_service',
  engine_oil: 'engine_oil',
  oil_filter: 'oil_filter',
  air_filter: 'air_filter',
  cabin_filter: 'cabin_filter',
  fuel_filter: 'fuel_filter',
  spark_plugs: 'spark_plugs',
  brake_fluid: 'brake_fluid',
  coolant: 'coolant',
  timing_belt: 'timing_belt',
  auxiliary_belt: 'accessory_belt',
  general_inspection: 'general_inspection',
};

/** Canonical operation of a task as the source words it. */
export function canonicalOperation(
  task: TaskCode,
  action: MaintenanceRequirement['action'],
  text: string,
): CanonicalOperation {
  if (task === 'transmission_fluid') {
    if (/manual (transmission|gearbox)|schaltgetriebe|gearbox oil/i.test(text)) {
      return 'manual_transmission_oil';
    }
    if (/automatic|\batf\b|cvt|dct|dsg|automatik/i.test(text))
      return 'automatic_transmission_fluid';
    return 'transmission_fluid';
  }
  if (task === 'timing_chain') return action === 'inspection' ? 'timing_chain_inspection' : 'OTHER';
  if (task === 'brake_system') return action === 'inspection' ? 'brakes_inspection' : 'OTHER';
  return DIRECT[task] ?? 'OTHER';
}

/** Canonical operation from free text (labels, uploads); null when no safe mapping exists. */
export function operationFromText(text: string): CanonicalOperation | null {
  const t = text.toLowerCase();
  if (/battery/.test(t) && /(check|inspect|test)/.test(t) && !/high.?voltage|coolant/.test(t)) {
    return 'battery_inspection';
  }
  return null;
}

export function ruleOf(r: MaintenanceRequirement): IntervalRule {
  if (r.action === 'inspection' && r.interval.rule !== 'time_only') {
    return r.interval.rule === 'whichever_first'
      ? 'WHICHEVER_COMES_FIRST'
      : 'INSPECTION_AT_INTERVAL';
  }
  switch (r.interval.rule) {
    case 'whichever_first':
      return 'WHICHEVER_COMES_FIRST';
    case 'distance_only':
      return 'DISTANCE_ONLY';
    default:
      return 'TIME_ONLY';
  }
}

const clipWords = (s: string, n = 30) => {
  const w = s.replace(/\s+/g, ' ').trim().split(' ');
  return w.length > n ? `${w.slice(0, n).join(' ')} …` : w.join(' ');
};

export function toEvidenceRecord(
  e: ExtractedRequirement,
  sourceId: string,
  match: MatchResult,
  grounded: boolean,
): EvidenceRecord {
  const r = e.requirement;
  const iv = r.interval;
  const miles = iv.every?.unit === 'mi' ? iv.every.value : null;
  const km = distanceKm(iv.every);
  const months = iv.everyMonths ?? null;
  const a = r.applicability;
  const text = r.taskText ?? '';
  const op = operationFromText(text) ?? canonicalOperation(r.task, r.action, text);
  return {
    id: `${sourceId}:${r.id}`,
    sourceId,
    operationKey: op,
    task: r.task,
    originalText: clipWords(text),
    action: r.action,
    inspectionOrReplacement:
      r.action === 'inspection'
        ? 'inspection'
        : r.action === 'replacement'
          ? 'replacement'
          : 'other',
    intervalKm: km,
    intervalMiles: miles,
    intervalMonths: months,
    intervalYears: months != null && months % 12 === 0 ? months / 12 : null,
    firstKm: distanceKm(iv.first),
    firstMonths: iv.firstMonths ?? null,
    whicheverComesFirst: iv.rule === 'whichever_first',
    rule: ruleOf(r),
    normalConditions: a.usage !== 'severe',
    severeConditions: a.usage === 'severe',
    engineApplicability: [
      ...(a.engineCodes ?? []),
      ...(a.displacementCc
        ? [`${a.displacementCc.min ?? ''}–${a.displacementCc.max ?? ''} cc`]
        : []),
      ...(a.powertrains ?? []),
    ],
    modelApplicability: a.models ?? [],
    yearApplicability: a.modelYears
      ? { from: a.modelYears.from ?? null, to: a.modelYears.to ?? null }
      : null,
    marketApplicability: a.markets ?? [],
    notes: [
      ...(a.serviceRegimes?.length ? [`service regime: ${a.serviceRegimes.join(', ')}`] : []),
      ...(miles != null
        ? [`stated in miles: ${miles} mi ≈ ${Math.round(miles * KM_PER_MILE)} km`]
        : []),
    ],
    sourceLocation: { page: e.page, section: r.evidence[0]?.table, locator: e.locator },
    extractionMethod: e.method,
    grounded,
    match,
    requirement: r,
  };
}
