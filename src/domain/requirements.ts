import type { IsoDate } from './core';
import type { VehicleType } from './vehicle';

/**
 * Maintenance knowledge model (M1, owner decision 2026-09-29; see
 * docs/release/MAINTENANCE_ARCHITECTURE_DISCOVERY.md). Pure types and rules — no I/O.
 *
 * A maintenance schedule is not one table per vehicle. It is a set of ATOMIC requirements (one
 * obligation each: "replace the engine oil every …"), each with its own applicability, market,
 * authority, evidence and verification. Which requirement is effective for a vehicle is decided
 * deterministically by the resolution engine (src/engine/requirements). Unknown stays unknown.
 */

// ---------- vehicle facts ----------

export type Powertrain =
  'petrol' | 'diesel' | 'hybrid' | 'plugin_hybrid' | 'electric' | 'lpg' | 'other';
export type Transmission = 'manual' | 'automatic' | 'dct' | 'cvt' | 'amt' | 'single_speed';
/** Market codes: 'IL', 'EU', 'UK', 'US', …; 'GLOBAL' only when a source states worldwide scope. */
export type MarketCode = string;
export type UsageCondition = 'normal' | 'severe';

/** Where a vehicle fact came from — facts are never assumed. */
export type FactSource = 'registry' | 'user' | 'document';

/**
 * What is known about the vehicle. An absent field means UNKNOWN — never "matches anything".
 * `serviceRegime` is a manufacturer-specific code such as SEAT's PR code (QG0 / QG1 / QG2).
 */
export interface VehicleFacts {
  kind?: VehicleType;
  make?: string;
  model?: string;
  generation?: string;
  modelYear?: number;
  engineFamily?: string;
  engineCode?: string;
  displacementCc?: number;
  powertrain?: Powertrain;
  transmission?: Transmission;
  market?: MarketCode;
  serviceRegime?: string;
  usage?: UsageCondition;
  /** First registration / in-service date (registry `moed_aliya_lakvish`). */
  inServiceDate?: IsoDate;
  sources?: Partial<Record<ApplicabilityDimension, FactSource>>;
}

// ---------- applicability ----------

export type ApplicabilityDimension =
  | 'kind'
  | 'make'
  | 'model'
  | 'generation'
  | 'modelYear'
  | 'engineFamily'
  | 'engineCode'
  | 'displacementCc'
  | 'powertrain'
  | 'transmission'
  | 'market'
  | 'serviceRegime'
  | 'usage';

/**
 * The vehicles a requirement applies to, as stated by its source. An absent dimension is
 * unconstrained (the source does not restrict it); a present one must be proven by a known fact.
 */
export interface RequirementApplicability {
  kinds?: VehicleType[];
  makes?: string[];
  models?: string[];
  generations?: string[];
  modelYears?: { from?: number; to?: number };
  engineFamilies?: string[];
  engineCodes?: string[];
  displacementCc?: { min?: number; max?: number };
  powertrains?: Powertrain[];
  transmissions?: Transmission[];
  /** Markets the source states it covers ('GLOBAL' = the source states worldwide scope). */
  markets?: MarketCode[];
  serviceRegimes?: string[];
  usage?: UsageCondition;
}

export type ApplicabilityVerdict = 'applies' | 'does_not_apply' | 'insufficient_information';

export interface RequirementApplicabilityResult {
  verdict: ApplicabilityVerdict;
  /** Constrained dimensions whose vehicle fact is unknown. */
  missing: ApplicabilityDimension[];
  /** Dimensions whose known fact contradicts the requirement. */
  mismatched: ApplicabilityDimension[];
  matched: ApplicabilityDimension[];
}

// ---------- requirements ----------

/** Normalized maintenance tasks (one obligation each). */
export type TaskCode =
  /** The periodic service as defined by the source's own service plan (its content is listed there). */
  | 'periodic_service'
  | 'engine_oil'
  | 'oil_filter'
  | 'air_filter'
  | 'cabin_filter'
  | 'fuel_filter'
  | 'spark_plugs'
  | 'brake_fluid'
  | 'coolant'
  | 'timing_belt'
  | 'timing_chain'
  | 'auxiliary_belt'
  | 'transmission_fluid'
  | 'final_drive_oil'
  | 'valve_clearance'
  | 'drive_chain'
  | 'general_inspection'
  | 'ev_battery_coolant'
  | 'ev_high_voltage_inspection'
  | 'reduction_gear_oil';

export type RequirementAction = 'inspection' | 'replacement' | 'adjustment' | 'other';
export type DistanceUnit = 'km' | 'mi';
export const KM_PER_MILE = 1.609344;

export interface RequirementInterval {
  /** Distance as stated by the source (original unit kept; km are derived). */
  every?: { value: number; unit: DistanceUnit };
  everyMonths?: number;
  /** An initial / exception occurrence (e.g. first service at 1,000 km or 6 months). */
  first?: { value: number; unit: DistanceUnit } | null;
  firstMonths?: number | null;
  rule: 'whichever_first' | 'distance_only' | 'time_only';
  /** false = a one-time obligation (e.g. the first service only). */
  repeats: boolean;
}

/**
 * Who stands behind a requirement. Only `importer`, `manufacturer`, `official_publication` and
 * the vehicle's own official booklet (`vehicle_document`) can ever be verified; user reports
 * and secondary sources (press, forums, parts sellers) never can.
 */
export type RequirementAuthority =
  | 'importer'
  | 'manufacturer'
  | 'official_publication'
  | 'vehicle_document'
  | 'user_report'
  | 'secondary';

export const VERIFIABLE_AUTHORITIES: readonly RequirementAuthority[] = [
  'importer',
  'manufacturer',
  'official_publication',
  'vehicle_document',
];

export type ExtractionMethod = 'curated' | 'user_entered' | 'ai_candidate' | 'synthetic_test';

export interface ExtractionProvenance {
  method: ExtractionMethod;
  by: string;
  at: IsoDate;
  /** Human review of the extracted fact against the page (required for AI candidates). */
  reviewedBy?: string;
  reviewedAt?: IsoDate;
}

/** Where a requirement is written: an exact location in an identified document edition. */
export interface EvidenceRef {
  documentId: string;
  documentTitle: string;
  authority: RequirementAuthority;
  markets: MarketCode[];
  edition?: string;
  publishedOn?: IsoDate;
  page?: number;
  section?: string;
  table?: string;
  /** Free-form locator ("row 3", "service at 30,000 km column"). */
  locator?: string;
  /** Short excerpt only where legally permissible; otherwise omitted (structured facts only). */
  excerpt?: string;
  /** sha256 of the document edition the locator refers to. */
  documentSha256?: string;
}

export type RequirementVerification = 'verified' | 'candidate' | 'rejected';

export interface MaintenanceRequirement {
  id: string;
  task: TaskCode;
  /** The task as the source names it (original language). */
  taskText?: string;
  action: RequirementAction;
  interval: RequirementInterval;
  applicability: RequirementApplicability;
  authority: RequirementAuthority;
  evidence: EvidenceRef[];
  verification: RequirementVerification;
  extraction: ExtractionProvenance;
  /** Test fixtures only: never a real manufacturer fact. */
  synthetic?: true;
}

/** Distance of an interval part in km (derived when the source states miles). */
export function distanceKm(d: { value: number; unit: DistanceUnit } | null | undefined) {
  if (!d) return null;
  return d.unit === 'km' ? d.value : Math.round(d.value * KM_PER_MILE);
}

/**
 * Deterministic trust rule: a requirement counts as verified evidence only if
 *  - it was marked verified,
 *  - its authority is verifiable,
 *  - it cites at least one evidence reference with an exact location (page / section / table),
 *  - and, if an AI proposed it, a human reviewed it against the page. AI output alone is never
 *    verified evidence.
 */
export function isVerifiedRequirement(r: MaintenanceRequirement): boolean {
  if (r.verification !== 'verified') return false;
  if (!VERIFIABLE_AUTHORITIES.includes(r.authority)) return false;
  const located = r.evidence.some(
    (e) => e.page != null || Boolean(e.section) || Boolean(e.table) || Boolean(e.locator),
  );
  if (!located) return false;
  if (r.extraction.method === 'ai_candidate' && !r.extraction.reviewedBy) return false;
  return true;
}

/** Structural checks on a requirement (the interval must be computable and consistent). */
export function requirementIssues(r: MaintenanceRequirement): string[] {
  const issues: string[] = [];
  const { interval: i } = r;
  const km = distanceKm(i.every);
  if (i.rule !== 'time_only' && !(km && km > 0)) issues.push('distance interval missing');
  if (i.rule !== 'distance_only' && !(i.everyMonths && i.everyMonths > 0)) {
    issues.push('time interval missing');
  }
  if (i.rule === 'distance_only' && i.everyMonths) issues.push('distance_only with months');
  if (i.rule === 'time_only' && i.every) issues.push('time_only with distance');
  if (r.verification === 'verified' && r.evidence.length === 0)
    issues.push('verified without evidence');
  return issues;
}
