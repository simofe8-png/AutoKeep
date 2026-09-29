import type { DocumentCategory, SourceSystem } from '../registry/sourceSystem';
import type { DiscoveryContext, SourceLead, UserSourceAction, VehicleIdentity } from '../types';

/**
 * Source adapters (M-SOURCE Step 6; docs/maintenance/SOURCE_ADAPTER_SPEC.md). An adapter speaks
 * to one KIND of document system (static listing, URL template, JSON manual API, restricted),
 * configured by registry data — never to one vehicle model. It returns normalized results; the
 * UI never sees source-specific logic.
 */

export const ADAPTER_FAILURE_CODES = [
  'NO_DIGITAL_SOURCE',
  'AUTH_REQUIRED',
  'MODEL_YEAR_NOT_LISTED',
  'VARIANT_AMBIGUOUS',
  'ENGINE_AMBIGUOUS',
  'MARKET_AMBIGUOUS',
  'PDF_PARSE_FAILURE',
  'MAINTENANCE_TABLE_NOT_FOUND',
  'TERMS_OR_RIGHTS_BLOCK',
  'POLICY_UNKNOWN',
  'PERMISSION_REQUIRED',
  'SOURCE_UNAVAILABLE',
  'OTHER',
] as const;
export type AdapterFailureCode = (typeof ADAPTER_FAILURE_CODES)[number];

/** A document an adapter found for the vehicle, with what the SOURCE's metadata says about it. */
export interface DocumentRef {
  sourceSystemId: string;
  url: string;
  title: string;
  category: DocumentCategory;
  /** How the source's own listing names the model: exactly, as another variant, or not at all. */
  modelMatch: 'exact' | 'variant' | 'unstated';
  /** Model years the source's own listing states for the document (never inferred). */
  statedYears?: { from: number; to: number };
  /** Version metadata when the source exposes it without downloading (etag, date, size). */
  versionHint?: { etag?: string; lastModified?: string; size?: number };
}

export type AdapterResult =
  | { status: 'documents'; documents: DocumentRef[]; notes: string[] }
  | {
      status: 'failed';
      failure: AdapterFailureCode;
      detail: string;
      /** An official page the USER may open themselves, when AutoKeep may not access it. */
      userAction?: UserSourceAction;
    };

export interface AdapterRun {
  system: SourceSystem;
  vehicle: VehicleIdentity;
  ctx: DiscoveryContext;
}

export interface SourceAdapter {
  readonly id: string;
  findDocuments(run: AdapterRun): Promise<AdapterResult>;
}

/** Documents → pipeline leads (the pipeline still applies the fetch/extraction policy). */
export function leadsOf(result: AdapterResult, adapterId: string): SourceLead[] {
  if (result.status !== 'documents') return [];
  return result.documents.map((d) => ({
    url: d.url,
    title: d.title,
    via: 'official_listing' as const,
    adapter: adapterId,
  }));
}
