import type {
  EvidenceLevel,
  MaintenanceRequirement,
  MarketCode,
  Powertrain,
  VehicleFacts,
  VehicleType,
} from '@/domain';

/**
 * Universal maintenance-source pipeline (owner instruction 2026-09-29, "MAINTENANCE IS NOW THE
 * ONLY PRODUCT PRIORITY"). Provider-independent types.
 *
 *   vehicle identity → reusable knowledge lookup → source discovery → access policy →
 *   acquisition → document understanding → maintenance sections → atomic extraction →
 *   grounding → applicability / market / evidence level → per-task resolution → schedule.
 *
 * Core logic contains NO per-model rules. Manufacturer knowledge is DATA (the source registry:
 * domains, roles, access policy, library entry points); a new model never needs code.
 */

/**
 * Source-system types of the removed automatic search (owner decision 2026-10-04); kept as opaque
 * shapes so records stored by earlier versions still type-check. The owner's documents carry none.
 */
type AdapterFailureCode = string;
type SourceStatus = string;
interface SourceSystem {
  id: string;
}

/** What the pipeline is asked about — the registry/user facts of one vehicle (no plate / VIN). */
export interface VehicleIdentity extends VehicleFacts {
  kind: VehicleType;
  make: string;
  model: string;
  modelYear: number;
}

// ---------- source registry ----------
// Source SYSTEMS (importer / manufacturer document systems) with a six-dimension access policy:
// see ./registry/sourceSystem.ts and ./registry/policy.ts.

// ---------- discovery ----------

export type LeadVia =
  | 'knowledge_catalog'
  | 'official_listing'
  | 'official_template'
  | 'official_sitemap'
  | 'user_upload'
  | 'web_search'
  | 'secondary';

/** A document that MIGHT be relevant. Untrusted until acquired, classified and matched. */
export interface SourceLead {
  url: string;
  title?: string;
  via: LeadVia;
  adapter: string;
  /** The source system that published it and its runtime priority (lower = preferred). */
  sourceSystemId?: string;
  priority?: number;
  /** Local bytes for uploads (no URL fetch). */
  upload?: { name: string; bytes: Uint8Array };
}

/** Failure classes are the standard M-SOURCE adapter failure codes (one vocabulary everywhere). */
export type FailureClass = AdapterFailureCode;

export interface BlockedAccess {
  url: string;
  reason:
    | 'not_registered'
    | 'registry_not_approved'
    /** The policy dimension for the activity is NOT_ALLOWED (detail names the dimension). */
    | 'policy_not_allowed'
    /** The policy dimension is UNKNOWN: no automation until evidence decides it. */
    | 'policy_unknown'
    /** The policy dimension requires the rights holder's permission. */
    | 'permission_required'
    | 'robots_disallow'
    | 'not_https'
    | 'http_error'
    | 'login_or_bot_wall'
    | 'too_large'
    | 'not_a_document'
    | 'network_error';
  detail?: string;
}

/**
 * An official place the USER can open themselves (personal use is what most terms allow) when the
 * host may not be accessed automatically — e.g. the manufacturer's manual page for this model.
 */
export interface UserSourceAction {
  url: string;
  host: string;
  title: string;
  reason: BlockedAccess['reason'];
}

export interface DiscoveryOutcome {
  adapter: string;
  leads: SourceLead[];
  blocked: BlockedAccess[];
  userActions?: UserSourceAction[];
  /** Per source system: why it produced no document (standard adapter failure codes). */
  failures?: {
    sourceSystemId: string;
    adapter: string;
    priority: number;
    code: AdapterFailureCode;
    detail: string;
  }[];
  /** e.g. "web search provider not configured". */
  notes: string[];
}

/** Provider-independent discovery port; adapters: catalog, listings, templates, sitemaps, uploads, search. */
export interface SourceDiscovery {
  readonly id: string;
  discover(v: VehicleIdentity, ctx: DiscoveryContext): Promise<DiscoveryOutcome>;
}

export interface HttpResponse {
  ok: boolean;
  status: number;
  url: string;
  contentType: string;
  bytes: Uint8Array;
}

/** Network port (the caller supplies fetch; tests supply fixtures). */
export type Http = (url: string, opts?: { maxBytes?: number }) => Promise<HttpResponse>;

export interface DiscoveryContext {
  http: Http;
  registry: readonly SourceSystem[];
  aliases: Record<string, string>;
  /** Treat 'proposed' registry entries as approved (evaluation only — never in the app). */
  assumeProposedApproved?: boolean;
  /** robots.txt cache per host. */
  robots: Map<string, string | null>;
  log?: (msg: string) => void;
}

// ---------- documents ----------

export interface TextItem {
  str: string;
  x: number;
  y: number;
  w: number;
}

export interface TextLine {
  y: number;
  items: TextItem[];
  text: string;
}

export interface PageText {
  n: number;
  lines: TextLine[];
  text: string;
}

export interface AcquiredDocument {
  lead: SourceLead;
  url: string;
  finalUrl: string;
  host: string;
  sha256: string;
  format: 'pdf' | 'html' | 'image';
  bytes: Uint8Array;
  /** The source system of the final host (null for user uploads). */
  system: SourceSystem | null;
}

/** Text port: PDF (pdfjs, server/tooling side) and HTML readers produce positioned lines. */
export interface TextReader {
  read(doc: AcquiredDocument): Promise<PageText[]>;
}

export type DocumentType =
  | 'owners_manual'
  | 'maintenance_schedule'
  | 'warranty_maintenance_booklet'
  | 'service_manual'
  | 'other';

/** What a document says about itself (read from its text, never from the search result). */
export interface DocumentProfile {
  type: DocumentType;
  authority: MaintenanceRequirement['authority'];
  manufacturer?: string;
  models: string[];
  /** Words that followed the model name where the document named a different variant ("EVO"). */
  modelVariants: string[];
  yearFrom?: number;
  yearTo?: number;
  engines: string[];
  displacementsCc: number[];
  powertrains: Powertrain[];
  markets: MarketCode[];
  marketBasis: 'document_text' | 'host_default' | 'unknown';
  units: 'km' | 'mi' | 'both' | 'unknown';
  regimes: string[];
  hasSevereSchedule: boolean;
  edition?: string;
  language?: string;
}

export interface MaintenanceSection {
  page: number;
  heading: string;
  score: number;
}

/** One atomic requirement read from a document, with the exact tokens it was read from. */
export interface ExtractedRequirement {
  requirement: MaintenanceRequirement;
  /** Tokens that must be present on the cited page (grounding). */
  groundTokens: string[];
  page: number;
  locator: string;
  method: 'table' | 'sentence';
}

// ---------- results ----------

export interface VehicleRunTrace {
  identity: VehicleIdentity;
  /** Tasks the reusable catalog alone resolves at level A/B (then no new research). */
  catalogHits: number;
  /** Catalog requirements whose vehicle-class scope can apply to this vehicle (any level). */
  catalogKnown: number;
  discovery: DiscoveryOutcome[];
  documents: {
    url: string;
    sha256: string;
    format: string;
    host: string;
    authority: string;
    sourceSystemId: string | null;
    registryStatus: SourceStatus | 'unregistered';
    profile: DocumentProfile | null;
    vehicleMatch: 'exact' | 'unresolved' | 'mismatch';
    unresolved: string[];
    sections: MaintenanceSection[];
    extracted: number;
    grounded: number;
    /** Document version at this URL (1 = first seen) and whether its bytes changed. */
    version?: number;
    versionStatus?: 'first' | 'unchanged' | 'new_version';
    /** Unchanged document already turned into verified knowledge: not extracted again. */
    reused?: boolean;
    /** A private upload identical to this known official document version. */
    officialMatch?: string;
    failure?: FailureClass;
    failureDetail?: string;
  }[];
  requirements: MaintenanceRequirement[];
  levels: Record<EvidenceLevel, number>;
  userActions: UserSourceAction[];
  failures: { class: FailureClass; detail: string }[];
}
