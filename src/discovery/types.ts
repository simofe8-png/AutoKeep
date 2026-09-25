import type { VehicleType } from '@/domain';

/**
 * Official source discovery (M10) — provider-independent types (T079).
 * Pipeline: identity → discovery → authority classification → exact applicability →
 * retrieval → extraction (M11) → evidence linking → validation → structured schedule.
 */

export interface VehicleIdentityQuery {
  type: VehicleType;
  manufacturer: string;
  model: string;
  year: number;
  engine?: string;
  trim?: string;
  modelCode?: string;
  /** Market the vehicle was sold in (applicability can differ per market). */
  market: 'IL';
}

/** A document a discovery provider claims might be relevant. Untrusted until classified. */
export interface SourceCandidate {
  url: string;
  title: string;
  /** Provider-reported language, if any. */
  language?: string;
  snippet?: string;
  /** Provider id that produced it (audit only, never trust). */
  discoveredBy: string;
}

/** Discovery provider port (search API / curated registry / AI browsing — chosen by approval). */
export interface DiscoveryProvider {
  readonly id: string;
  search(query: VehicleIdentityQuery): Promise<SourceCandidate[]>;
}

/**
 * Facts about which vehicles a document covers, extracted from the document itself (M11), never
 * from the search result. Absent facts stay undefined — they are not guessed.
 */
export interface DocumentCoverage {
  manufacturer?: string;
  models: string[];
  yearFrom?: number;
  yearTo?: number;
  engines?: string[];
  modelCodes?: string[];
  markets?: string[];
  edition?: string;
  documentKind: 'owners_manual' | 'maintenance_schedule' | 'other';
}
