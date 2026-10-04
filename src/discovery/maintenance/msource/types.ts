import type { MaintenanceRequirement, RequirementAction, TaskCode } from '@/domain';

import type { DocumentProfile, DocumentType } from '../types';

/**
 * M-SOURCE V1 records (ADR-0020). Candidates are untrusted until acquired, extracted and matched;
 * provenance is immutable once captured and travels with every evidence record into the resolved
 * schedule. Discovery hints (search snippets, research-assistant notes) are kept apart from
 * evidence and can never become an interval.
 */

export const MSOURCE_VERSION = 'msource/1';

export type SourceType =
  | 'oem_manual'
  | 'oem_schedule'
  | 'oem_booklet'
  | 'importer'
  | 'dealer'
  | 'service_document'
  | 'independent_database'
  | 'publication'
  | 'forum'
  | 'archive'
  | 'user_upload'
  | 'other';

/** Source types whose documents are (copies of) the manufacturer's / importer's own. */
export const OFFICIAL_SOURCE_TYPES: readonly SourceType[] = [
  'oem_manual',
  'oem_schedule',
  'oem_booklet',
  'importer',
];

/** What a discovery source CLAIMS about applicability (metadata — never evidence). */
export interface StatedApplicability {
  models?: string[];
  yearFrom?: number | null;
  yearTo?: number | null;
  engines?: string[];
  engineCodes?: string[];
  markets?: string[];
}

export interface SourceCandidate {
  /** Stable id from the canonical URL ("upload:<sha>" for uploads). */
  id: string;
  url: string;
  canonicalUrl: string;
  title?: string;
  publisher?: string;
  sourceType: SourceType;
  formatHint: 'pdf' | 'html' | 'unknown';
  /** Adapter that discovered it ("fable", "search", "registry", "catalog", "link", "archive", "upload"). */
  discoveredBy: string;
  discoveredAt: string;
  query?: string;
  language?: string;
  market?: string | null;
  statedApplicability?: StatedApplicability;
  /** Discovery hint (snippet / why relevant). Never evidence. */
  hint?: string;
  /** Archived copy: the original URL it preserves. */
  archiveOf?: string;
  /** Found as a link on another acquired source. */
  parentId?: string;
  /** A user-provided document (bytes in memory; never fetched). */
  upload?: { name: string; bytes: Uint8Array };
}

/**
 * An access decision recorded with a source (web sources of earlier versions; the owner's own
 * documents carry none).
 */
export interface AccessDecision {
  operation: string;
  status: string;
  reason: string;
  url: string;
  host: string | null;
  evidence: { kind: string; ref: string; detail?: string }[];
  decidedAt: string;
  policyVersion: string;
}

/** Immutable provenance of one acquired document. */
export interface SourceProvenance {
  sourceId: string;
  canonicalUrl: string;
  finalUrl: string;
  /** Redirect chain (initial + hops), for audit. */
  chain: string[];
  sourceName: string;
  sourceType: SourceType;
  discoveredBy: string;
  discoveredAt: string;
  retrievedAt: string;
  format: 'pdf' | 'html';
  documentType: DocumentType | null;
  contentSha256: string;
  byteLength: number;
  locale: string | null;
  markets: string[];
  /** Applicability as the document's OWN text states it. */
  statedApplicability: DocumentApplicability | null;
  access: AccessDecision[];
  /** Source identity / authority — independent of the access decisions above. */
  authority?: { official: boolean; basis: 'registry' | 'brand_domain' | 'none'; detail: string };
  extractorVersion: string;
  msourceVersion: string;
  /** Same bytes as an earlier source in this run (not re-extracted; same independence group). */
  duplicateOf?: string;
  archiveOf?: string;
}

/** What the document's text says it covers (read deterministically). */
export interface DocumentApplicability {
  models: string[];
  modelVariants: string[];
  yearFrom: number | null;
  yearTo: number | null;
  /** Engine codes found in the text that relate to the vehicle's code family. */
  engineCodes: string[];
  /** Displacements (cc) the document DECLARES as its scope (titles, model + engine lines). */
  displacementsCc: number[];
  /** Displacements mentioned anywhere in the read scope (can confirm, never exclude). */
  displacementsMentioned?: number[];
  fuels: string[];
  markets: string[];
  /** Where the model years come from: the document text, or trusted official metadata. */
  yearBasis?: 'document_text' | 'official_metadata' | 'all_models_stated';
  /** The designation the years were read from (e.g. "my12_w45"). */
  yearDesignation?: string;
  /** The document states its schedule covers all engines. */
  allEnginesStated?: boolean;
  /** The heading that states it (quoted). */
  allEnginesPhrase?: string;
  /** A body-variant token the OFFICIAL document identity carries ("sc", "st", "estate"). */
  variantToken?: string;
  /** Service-regime words → the codes the document itself maps them to (e.g. FIXED → QG0, QG2). */
  regimeMap?: Record<string, string[]>;
  profile?: DocumentProfile;
}

export const CANONICAL_OPERATIONS = [
  'periodic_service',
  'engine_oil',
  'oil_filter',
  'air_filter',
  'cabin_filter',
  'spark_plugs',
  'brake_fluid',
  'coolant',
  'timing_belt',
  'timing_chain_inspection',
  'transmission_fluid',
  'manual_transmission_oil',
  'automatic_transmission_fluid',
  'fuel_filter',
  'brakes_inspection',
  'battery_inspection',
  'accessory_belt',
  'general_inspection',
  'OTHER',
] as const;
export type CanonicalOperation = (typeof CANONICAL_OPERATIONS)[number];

export type IntervalRule =
  | 'WHICHEVER_COMES_FIRST'
  | 'DISTANCE_ONLY'
  | 'TIME_ONLY'
  | 'INSPECTION_AT_INTERVAL'
  | 'CONDITION_BASED';

export type MatchStatus =
  'EXACT' | 'STRONG' | 'SUPPORTED' | 'PARTIAL' | 'CONFLICTING' | 'NOT_APPLICABLE' | 'INSUFFICIENT';

export type MatchDimension =
  | 'make'
  | 'model'
  | 'generation'
  | 'year'
  | 'displacement'
  | 'engineCode'
  | 'fuel'
  | 'transmission'
  | 'market'
  | 'serviceRegime'
  | 'body';

export type DimensionVerdict =
  /** The source states it and it matches the vehicle. */
  | 'match'
  /** The source states an explicitly listed equivalent engine code (engineAliases.ts). */
  | 'family'
  | 'mismatch'
  /** The source does not restrict this dimension. */
  | 'unstated'
  /** The source restricts it but the vehicle fact is unknown. */
  | 'vehicle_unknown';

export interface MatchResult {
  status: MatchStatus;
  /**
   * Usable once the owner answers a vehicle fact the row depends on (e.g. the service-regime
   * code): `status` is PARTIAL, `baseStatus` is the match the row would have, `conditional` the
   * vehicle-fact values it applies to (as the document maps them).
   */
  baseStatus?: MatchStatus;
  conditional?: { serviceRegimes: string[] };
  dimensions: Partial<Record<MatchDimension, DimensionVerdict>>;
  reasons: string[];
}

export interface EvidenceRecord {
  id: string;
  sourceId: string;
  operationKey: CanonicalOperation;
  task: TaskCode;
  /** The source's own words for the item, short (≤ 30 words). */
  originalText: string;
  action: RequirementAction;
  inspectionOrReplacement: 'inspection' | 'replacement' | 'other';
  intervalKm: number | null;
  intervalMiles: number | null;
  intervalMonths: number | null;
  intervalYears: number | null;
  firstKm: number | null;
  firstMonths: number | null;
  whicheverComesFirst: boolean;
  rule: IntervalRule;
  normalConditions: boolean;
  severeConditions: boolean;
  engineApplicability: string[];
  modelApplicability: string[];
  yearApplicability: { from: number | null; to: number | null } | null;
  marketApplicability: string[];
  notes: string[];
  sourceLocation: { page: number; section?: string; locator: string };
  extractionMethod: 'table' | 'sentence';
  /** Item-level applicability (combined with the document's own in `match`). */
  itemApplicability?: ItemApplicability;
  /** Every value was found again on the cited page. */
  grounded: boolean;
  /** Vehicle applicability of this record (document + row qualifiers). */
  match: MatchResult;
  /** The normalized atomic requirement the record was read as (internal). */
  requirement: MaintenanceRequirement;
}

/**
 * How widely ONE item's interval applies, as the source's structure and wording establish it
 * (owner correction 2026-10-02). Not every operation is satisfied by every scope.
 */
export type ApplicabilityScope =
  | 'EXACT_ENGINE'
  | 'ENGINE_FAMILY'
  | 'ALL_ENGINES'
  | 'MODEL_VARIANT'
  | 'MODEL_YEAR_RANGE'
  | 'GENERATION'
  | 'MODEL_GENERIC';

export interface ItemApplicability {
  scope: ApplicabilityScope;
  /** Why this scope (row qualifier, section statement, document metadata, …). */
  basis: string;
  /** The scope is sufficient for this operation (powertrain-dependent operations need an
   *  engine-level scope or an explicit all-engines statement). */
  sufficient: boolean;
  /** Model years that apply to THIS item (section statement, else the document). */
  years: { from: number; to: number } | null;
  yearsBasis: 'section' | 'document' | 'none';
}

export type ResolutionQuality = 'EXACT' | 'STRONG' | 'SUPPORTED' | 'CONFLICTING' | 'INSUFFICIENT';

export interface ResolvedScheduleItem {
  operation: CanonicalOperation;
  task: TaskCode;
  action: RequirementAction;
  condition: 'normal' | 'severe';
  intervalKm: number | null;
  intervalMonths: number | null;
  firstKm: number | null;
  firstMonths: number | null;
  rule: IntervalRule;
  quality: ResolutionQuality;
  /** Evidence records that state the resolved value. */
  evidenceIds: string[];
  /** Independent source groups behind the value, and how many are official. */
  independentSources: number;
  officialSources: number;
  /** Best applicability among the supporting evidence. */
  applicability: MatchStatus;
  /** Applies only to vehicles with these facts (answered by the owner, e.g. a regime code). */
  conditions?: { serviceRegimes: string[] };
  /** CONDITIONALLY_APPLICABLE while the condition's vehicle fact is unknown. */
  applicabilityStatus?: 'APPLICABLE' | 'CONDITIONALLY_APPLICABLE';
  /** Applicability scope of the supporting evidence. */
  scope?: ApplicabilityScope;
  /** Different values seen for the same obligation (never averaged). */
  conflicts: { intervalKm: number | null; intervalMonths: number | null; evidenceIds: string[] }[];
  notes: string[];
}

export type ScheduleStatus =
  /** Every resolved obligation established, including the core service / oil interval. */
  | 'READY'
  /** Some items established; others conflicting / insufficient / missing (shown as partial). */
  | 'READY_PARTIAL'
  /** Only conditional items: usable once the owner answers the condition (e.g. QG code). */
  | 'CONDITIONAL'
  | 'CONFLICTING_EVIDENCE'
  | 'INSUFFICIENT_EVIDENCE'
  | 'NO_SOURCE_FOUND';

export interface ResolvedSchedule {
  fingerprintKey: string;
  status: ScheduleStatus;
  items: ResolvedScheduleItem[];
  /** Items whose evidence did not reach SUPPORTED (recorded, never scheduled). */
  unresolved: ResolvedScheduleItem[];
  sources: SourceProvenance[];
  evidence: EvidenceRecord[];
  resolvedAt: string;
  msourceVersion: string;
}
