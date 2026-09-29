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

/** What the pipeline is asked about — the registry/user facts of one vehicle (no plate / VIN). */
export interface VehicleIdentity extends VehicleFacts {
  kind: VehicleType;
  make: string;
  model: string;
  modelYear: number;
}

// ---------- source registry (data) ----------

export type HostRole = 'manufacturer' | 'importer' | 'manual_library';
/** Owner approval of the host as an authority (P1 decision 2026-09-27: a person approves). */
export type RegistryStatus = 'approved' | 'proposed' | 'rejected';
/**
 * Automated retrieval policy (P1 decision §8.4): allowed only when robots AND terms permit it;
 * 'unknown' (terms unreadable / not found with certainty) means no automation.
 */
export type AutomationPolicy = 'permitted' | 'prohibited' | 'unknown';
/** May requirements derived from this host be stored as reusable knowledge (§8.5)? */
export type ReusePolicy = 'permitted' | 'prohibited' | 'unknown';

/**
 * How an adapter finds documents on a host — data, never per-model code.
 *  - listing: fetch an index page (URL may use {model}/{year}/{locale} placeholders), follow
 *    links matching `follow` up to `depth`, propose documents whose link text/URL names the model;
 *  - template: a document URL pattern with placeholders (e.g. …/{modelSlug}/{locale}/manual.pdf);
 *  - sitemap: the host's robots.txt sitemaps.
 */
export type EntryPoint =
  | { kind: 'listing'; url: string; follow?: string; depth?: number; documents?: string }
  | { kind: 'template'; url: string; locales?: string[] }
  | { kind: 'sitemap' };

export interface SourceRegistryEntry {
  /** Normalized manufacturer key(s) the host speaks for. */
  manufacturers: string[];
  host: string;
  role: HostRole;
  /** Market the host is official for; undefined = the manufacturer's global/regional site. */
  markets?: MarketCode[];
  /** Markets a document from this host covers when the document itself does not say. */
  defaultDocumentMarkets?: MarketCode[];
  status: RegistryStatus;
  automation: AutomationPolicy;
  reuse: ReusePolicy;
  entryPoints?: EntryPoint[];
  /** Evidence for ownership and policy (who/when/how). */
  evidence: string;
}

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
  /** Local bytes for uploads (no URL fetch). */
  upload?: { name: string; bytes: Uint8Array };
}

export type FailureClass =
  | 'no_source'
  | 'blocked_source'
  | 'access_restriction'
  | 'vehicle_identity_insufficient'
  | 'market_ambiguity'
  | 'engine_ambiguity'
  | 'service_regime_ambiguity'
  | 'document_parsing_failure'
  | 'conflicting_evidence'
  | 'unsupported_manufacturer'
  | 'provider_not_configured'
  | 'other';

export interface BlockedAccess {
  url: string;
  reason:
    | 'not_registered'
    | 'registry_not_approved'
    | 'terms_prohibit_automation'
    | 'terms_unknown'
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
  registry: readonly SourceRegistryEntry[];
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
  format: 'pdf' | 'html';
  bytes: Uint8Array;
  registryEntry: SourceRegistryEntry | null;
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
    registryStatus: RegistryStatus | 'unregistered';
    profile: DocumentProfile | null;
    vehicleMatch: 'exact' | 'unresolved' | 'mismatch';
    unresolved: string[];
    sections: MaintenanceSection[];
    extracted: number;
    grounded: number;
    failure?: FailureClass;
    failureDetail?: string;
  }[];
  requirements: MaintenanceRequirement[];
  levels: Record<EvidenceLevel, number>;
  userActions: UserSourceAction[];
  failures: { class: FailureClass; detail: string }[];
}
