import type { ManufacturerAliases } from '../authority';
import type { AdapterFailureCode } from './adapters/types';
import { currentPolicy, type PolicyValue } from './registry/policy';
import type { SourceSystem } from './registry/sourceSystem';
import { candidateSystems, fleetByManufacturer, type FleetUniverse } from './registry/universe';

/**
 * Coverage engine (M-SOURCE Step 12). Four metrics, never collapsed into one number:
 *
 *  DOCUMENT COVERAGE        — AutoKeep may automatically obtain an official maintenance-bearing
 *                             document (discovery + fetch + extraction ALLOWED, approved system,
 *                             type A/B/C).
 *  MAINTENANCE-SCHEDULE     — a schedule item is actually scheduled (level A/B) from it.
 *  EXACT-APPLICABILITY      — the document is proven for the exact vehicle (model + years).
 *  ISRAEL-AUTHORITY         — the evidence is Israeli (approved Israeli system / level A).
 *
 * FLEET level (denominator: active vehicles in the Ministry of Transport datasets, grouped by
 * manufacturer): only what the REGISTRY decides per manufacturer is computable, so fleet figures
 * are CEILINGS ("at most this share could be covered"): per-model document availability,
 * applicability and extraction are not known without running the pipeline on every model.
 * SAMPLE level (denominator: the committed blind set): exact outcomes of the pipeline.
 */

export interface Ratio {
  numerator: number;
  denominator: number;
}
export const pct = (r: Ratio) => (r.denominator ? (100 * r.numerator) / r.denominator : 0);

const READ = ['discoveryAllowed', 'automatedFetchAllowed', 'automatedExtractionAllowed'] as const;

export function automatable(s: SourceSystem): boolean {
  if (s.status !== 'approved' || s.sourceType === 'D_RESTRICTED_OR_UNAVAILABLE') return false;
  const p = currentPolicy(s.policy);
  return READ.every((d) => p.dimensions[d].value === 'ALLOWED');
}

/** The deciding blocker of a system, as a standard failure code (null = automatable). */
export function systemBlocker(s: SourceSystem): AdapterFailureCode | null {
  if (automatable(s)) return null;
  // Intrinsic blockers first (what the source itself allows); owner approval last.
  if (s.sourceType === 'D_RESTRICTED_OR_UNAVAILABLE') {
    return s.discovery.mechanism === 'login'
      ? 'AUTH_REQUIRED'
      : s.discovery.mechanism === 'none'
        ? 'NO_DIGITAL_SOURCE'
        : 'SOURCE_UNAVAILABLE';
  }
  const values: PolicyValue[] = READ.map((d) => currentPolicy(s.policy).dimensions[d].value);
  if (values.includes('NOT_ALLOWED')) return 'TERMS_OR_RIGHTS_BLOCK';
  if (values.includes('REQUIRES_PERMISSION')) return 'PERMISSION_REQUIRED';
  if (values.includes('UNKNOWN')) return 'POLICY_UNKNOWN';
  // Policy permits it, but the owner has not approved the system as an authority yet.
  return 'PERMISSION_REQUIRED';
}

export interface ManufacturerCoverage {
  manufacturer: string;
  category: 'car' | 'motorcycle';
  vehicles: number;
  ministryMakes: string[];
  systems: {
    id: string;
    israeli: boolean;
    type: string;
    status: string;
    blocker: AdapterFailureCode | null;
  }[];
  documentCeiling: boolean;
  israelAuthorityCeiling: boolean;
  /** An approved Israeli system publishing documents exists, blocked only by access policy. */
  israeliBlockedByPolicy: boolean;
  /** The deciding failure code for the manufacturer (null = a ceiling is met). */
  failure: AdapterFailureCode | null;
}

export interface FleetCoverage {
  denominator: {
    vehicles: number;
    cars: number;
    motorcycles: number;
    source: FleetUniverse['source'];
  };
  documentCeiling: Ratio;
  scheduleCeiling: Ratio;
  exactApplicabilityCeiling: null;
  israelAuthorityCeiling: Ratio;
  israeliSourceBlockedByPolicy: Ratio;
  unmappedVehicles: Ratio;
  noSourceSystem: Ratio;
  byFailure: Record<string, number>;
  manufacturers: ManufacturerCoverage[];
}

const POLICY_CODES: readonly AdapterFailureCode[] = [
  'POLICY_UNKNOWN',
  'PERMISSION_REQUIRED',
  'TERMS_OR_RIGHTS_BLOCK',
];

export function fleetCoverage(
  u: FleetUniverse,
  systems: readonly SourceSystem[],
  aliases: ManufacturerAliases,
): FleetCoverage {
  const total = u.totals.car + u.totals.motorcycle;
  const { mapped, unmapped } = fleetByManufacturer(u, aliases);
  const manufacturers: ManufacturerCoverage[] = [...mapped.entries()]
    .map(([, m]) => {
      const cands = candidateSystems({ make: m.key, kind: m.category }, systems, aliases);
      const sys = cands.map((c) => ({
        id: c.system.sourceSystemId,
        israeli: c.system.origin === 'israeli',
        type: c.system.sourceType,
        status: c.system.status,
        blocker: systemBlocker(c.system),
      }));
      const documentCeiling = sys.some((s) => s.blocker === null);
      const israelAuthorityCeiling = sys.some((s) => s.israeli && s.blocker === null);
      const israeliBlockedByPolicy = sys.some(
        (s) =>
          s.israeli &&
          s.status === 'approved' &&
          s.type !== 'D_RESTRICTED_OR_UNAVAILABLE' &&
          !!s.blocker &&
          POLICY_CODES.includes(s.blocker),
      );
      const failure = documentCeiling
        ? null
        : !sys.length
          ? ('NO_DIGITAL_SOURCE' as const)
          : (sys.find((s) => s.israeli)?.blocker ?? sys[0].blocker);
      return {
        manufacturer: m.key,
        category: m.category,
        vehicles: m.count,
        ministryMakes: m.makes,
        systems: sys,
        documentCeiling,
        israelAuthorityCeiling,
        israeliBlockedByPolicy,
        failure,
      };
    })
    .sort((a, b) => b.vehicles - a.vehicles || a.manufacturer.localeCompare(b.manufacturer));
  const sum = (f: (m: ManufacturerCoverage) => boolean) =>
    manufacturers.filter(f).reduce((a, m) => a + m.vehicles, 0);
  const unmappedCount = unmapped.reduce((a, m) => a + m.count, 0);
  const byFailure: Record<string, number> = {};
  for (const m of manufacturers)
    if (m.failure) byFailure[m.failure] = (byFailure[m.failure] ?? 0) + m.vehicles;
  if (unmappedCount)
    byFailure.NO_DIGITAL_SOURCE = (byFailure.NO_DIGITAL_SOURCE ?? 0) + unmappedCount;
  const documentCeiling = { numerator: sum((m) => m.documentCeiling), denominator: total };
  return {
    denominator: {
      vehicles: total,
      cars: u.totals.car,
      motorcycles: u.totals.motorcycle,
      source: u.source,
    },
    documentCeiling,
    // A schedule can only come from an obtainable document: the document ceiling bounds it.
    scheduleCeiling: documentCeiling,
    exactApplicabilityCeiling: null,
    israelAuthorityCeiling: { numerator: sum((m) => m.israelAuthorityCeiling), denominator: total },
    israeliSourceBlockedByPolicy: {
      numerator: sum((m) => m.israeliBlockedByPolicy),
      denominator: total,
    },
    unmappedVehicles: { numerator: unmappedCount, denominator: total },
    noSourceSystem: {
      numerator: sum((m) => !m.systems.length) + unmappedCount,
      denominator: total,
    },
    byFailure,
    manufacturers,
  };
}

/** Exact pipeline outcomes on a sample (e.g. the committed blind set). */
export interface SampleOutcome {
  id: string;
  documentRetrieved: boolean;
  exactApplicability: boolean;
  scheduled: boolean;
  israeliAuthority: boolean;
  failures: AdapterFailureCode[];
}

export function sampleCoverage(outcomes: readonly SampleOutcome[]) {
  const n = outcomes.length;
  const count = (f: (o: SampleOutcome) => boolean) => ({
    numerator: outcomes.filter(f).length,
    denominator: n,
  });
  const byFailure: Record<string, number> = {};
  for (const o of outcomes)
    for (const f of new Set(o.failures)) byFailure[f] = (byFailure[f] ?? 0) + 1;
  return {
    document: count((o) => o.documentRetrieved),
    schedule: count((o) => o.scheduled),
    exactApplicability: count((o) => o.exactApplicability),
    israelAuthority: count((o) => o.israeliAuthority),
    byFailure,
  };
}
