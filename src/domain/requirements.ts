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
  /** Facelift / phase of the generation as the manufacturer names it (e.g. "FL", "phase 2"). */
  phase?: string;
  modelYear?: number;
  /** Production date when known (registry / VIN decoding is NOT used to invent it). */
  productionDate?: IsoDate;
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
  | 'phase'
  | 'modelYear'
  | 'productionDate'
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
  phases?: string[];
  modelYears?: { from?: number; to?: number };
  /** Production period stated by the source (ISO dates, inclusive). */
  productionPeriod?: { from?: IsoDate; to?: IsoDate };
  engineFamilies?: string[];
  engineCodes?: string[];
  displacementCc?: { min?: number; max?: number };
  powertrains?: Powertrain[];
  transmissions?: Transmission[];
  /** Markets the source states it covers ('GLOBAL' = the source states worldwide scope). */
  markets?: MarketCode[];
  serviceRegimes?: string[];
  usage?: UsageCondition;
  /**
   * Dimensions on which the SOURCE's own coverage could not be established (e.g. an owner's
   * manual that never states which model years it covers). Never assumed to match: they keep the
   * requirement at "insufficient information" (evidence level C) whatever the vehicle facts are.
   */
  coverageUnknown?: ApplicabilityDimension[];
}

export type ApplicabilityVerdict = 'applies' | 'does_not_apply' | 'insufficient_information';

export interface RequirementApplicabilityResult {
  verdict: ApplicabilityVerdict;
  /** Constrained dimensions whose vehicle fact is unknown (answerable by the user). */
  missing: ApplicabilityDimension[];
  /** Dimensions on which the source's own coverage is unknown (needs better evidence, not a fact). */
  coverageUnknown?: ApplicabilityDimension[];
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
  | 'reduction_gear_oil'
  /** Scooter CVT drive belt (not the engine auxiliary belt). */
  | 'drive_belt'
  | 'brake_system'
  | 'tire_rotation';

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
  /**
   * How the repeats are laid out from new, when a first occurrence differs from the interval:
   *  - undefined: first, first + every, first + 2·every … (e.g. 20, 60, 100);
   *  - 'zero': first, then the multiples of every (e.g. 1,000 → 5,000 → 10,000), as stated by the
   *    source's own layout ("second at 5,000 km, then every 5,000 km"; milestone columns).
   */
  anchor?: 'zero';
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

export type ExtractionMethod =
  | 'curated'
  | 'user_entered'
  | 'ai_candidate'
  /** Deterministic code read the requirement from the document's text/table structure. */
  | 'deterministic_parser'
  | 'synthetic_test';

export interface ExtractionProvenance {
  method: ExtractionMethod;
  by: string;
  at: IsoDate;
  /** Human review of the extracted fact against the page (required for AI candidates). */
  reviewedBy?: string;
  reviewedAt?: IsoDate;
  /**
   * Deterministic grounding: every value of the requirement (task label and interval numbers) was
   * found again on the cited page of the pinned document edition. Required for parser output.
   */
  grounded?: boolean;
  /**
   * The owner corrected the value read from their own document before accepting it (owner review):
   * the document's original reading is kept here for the audit trail.
   */
  ownerEdit?: {
    original: { intervalKm: number | null; intervalMonths: number | null; text: string };
  };
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

export type Confidence = 'high' | 'medium' | 'low';

export interface Corroboration {
  /** Independent source groups that state this obligation, each grounded (quote re-found). */
  independentSources: number;
  /** Of those, groups that are (copies of) a manufacturer / importer document. */
  officialSources: number;
  confidence: Confidence;
  /** The independence keys (publisher or underlying document), for audit. */
  groups: string[];
}

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
  /**
   * Source-agnostic triangulation (owner instruction 2026-09-30): how independently this exact
   * obligation is corroborated. Source authority and requirement confidence are separate: a
   * non-official requirement can drive a plan only through this record (evidence level T).
   */
  corroboration?: Corroboration;
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
  if (
    r.extraction.method === 'deterministic_parser' &&
    !(r.extraction.grounded && r.evidence.some((e) => Boolean(e.documentSha256)))
  ) {
    return false;
  }
  return true;
}

/**
 * Evidence levels (owner decision 2026-09-29). Per requirement and per vehicle:
 *  - A: verified, applicable, from an authoritative source that names the vehicle's market (IL);
 *  - B: verified official evidence that applies to the exact vehicle, but whose market is not
 *       proven to be the vehicle's (e.g. a UK or US owner's manual) — shown only with that label;
 *  - C: verified official evidence whose applicability to this vehicle has unresolved dimensions
 *       (engine, regime, usage, …) — technically relevant, never scheduled until resolved;
 *  - D: secondary / supporting evidence (press, forums, dealers, user reports) — never scheduled;
 *  - E: an unverified candidate (AI or unreviewed extraction) — never scheduled;
 *  - T: triangulated (2026-09-30; 2026-10-02: one strongly applicable independent source may
 *       suffice at medium confidence): not individually verified, but grounded in independent
 *       source(s) with confidence high / medium, and
 *       applicable to the vehicle. Drives a plan below A and B, always labelled with confidence.
 * A, B and T drive a maintenance plan; A outranks B outranks T per atomic task.
 */
export type EvidenceLevel = 'A' | 'B' | 'C' | 'D' | 'E' | 'T';

export const PLAN_DRIVING_LEVELS: readonly EvidenceLevel[] = ['A', 'B', 'T'];

/** A triangulated requirement that may drive a plan (see level T). */
export function isTriangulated(r: MaintenanceRequirement): boolean {
  const c = r.corroboration;
  return (
    r.verification === 'verified' &&
    Boolean(r.extraction.grounded) &&
    c != null &&
    (c.confidence === 'high' || c.confidence === 'medium') &&
    // One independent source suffices when its confidence is medium/high: the source-specific
    // rules that produce the confidence decide (owner correction 2026-10-02, M-SOURCE V1).
    c.independentSources >= 1
  );
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
