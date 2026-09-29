import type { IsoDate, MarketCode } from '@/domain';

import { currentPolicy, policyIssues, type PolicyHistory } from './policy';

/**
 * Israeli Maintenance Source Registry — one record per SOURCE SYSTEM (an importer's or a
 * manufacturer's document system), never per vehicle model.
 *
 * `sourceType` describes what the SOURCE publishes (A–D). It is deliberately a different type
 * from the maintenance EVIDENCE LEVEL (A–E, `EvidenceLevel` in the domain), which is decided per
 * requirement and per vehicle by the engine. The two are never converted into each other.
 */

export type SourceSystemType =
  | 'A_DIRECT_MAINTENANCE_SCHEDULE'
  | 'B_DIGITAL_MANUAL'
  | 'C_STRUCTURED_WEB_MANUAL'
  | 'D_RESTRICTED_OR_UNAVAILABLE';

export type AuthorityClass = 'importer' | 'manufacturer' | 'manufacturer_library';

export type DocumentCategory =
  | 'maintenance_schedule'
  | 'service_booklet'
  | 'owner_manual'
  | 'structured_web_manual'
  | 'quick_guide'
  | 'service_price_list'
  | 'warranty_booklet';

export type DiscoveryMechanism =
  | 'static_links'
  | 'sitemap'
  | 'public_json_api'
  | 'javascript_app'
  | 'form'
  | 'login'
  | 'url_template'
  | 'none';

/** Owner approval of the system as an AUTHORITY (P1 decision: a person approves). */
export type SourceStatus = 'approved' | 'proposed' | 'rejected';

export interface SourceDomain {
  host: string;
  role: 'site' | 'documents' | 'api';
}

/**
 * How an adapter finds documents — DATA, never per-model code. URLs may use {model}, {modelSlug},
 * {model-slug}, {year} and {locale} placeholders.
 *  - listing: an index page / sitemap; follow links matching `follow` up to `depth`; documents
 *    are links matching `documents` (default: PDF) that name the vehicle;
 *  - template: a direct document URL pattern;
 *  - json_api: a public JSON listing; `items` is the path of the array, `model` / `year` /
 *    `document` / `title` are field paths inside each item.
 */
export type EntryPoint =
  | { kind: 'listing'; url: string; follow?: string; depth?: number; documents?: string }
  | { kind: 'template'; url: string; locales?: string[] }
  | {
      kind: 'json_api';
      url: string;
      items: string;
      model: string;
      year?: string;
      document: string;
      title?: string;
    };

export interface SourceSystem {
  sourceSystemId: string;
  /** Normalized manufacturer keys covered (see MANUFACTURER_ALIASES). */
  manufacturers: string[];
  /**
   * Vehicle kinds the system publishes for (a brand's car importer and its two-wheeler importer
   * are different systems). 'motorcycle' covers scooters.
   */
  vehicleKinds: ('car' | 'motorcycle')[];
  /** Legal name of the importer, when the system is an importer's. */
  importer?: string;
  /** The market the system is official for ('IL', or 'GLOBAL' / 'EU' / … for manufacturers). */
  market: MarketCode;
  region: string;
  origin: 'israeli' | 'global';
  domains: SourceDomain[];
  sourceType: SourceSystemType;
  authorityClass: AuthorityClass;
  discovery: { mechanism: DiscoveryMechanism; entryPoints: EntryPoint[] };
  documentCategories: DocumentCategory[];
  /**
   * Official pages a USER may open themselves (the maintenance / manuals page of the importer),
   * offered when AutoKeep may not access the system automatically. Never fetched by AutoKeep.
   */
  officialPages?: string[];
  policy: PolicyHistory;
  status: SourceStatus;
  /** Ownership / authority evidence (who, how, where). */
  authorityEvidence: string;
  notes?: string;
  limitations: string[];
  /** Can model / model year / engine be resolved from the source's own metadata? */
  applicabilityResolution: 'automatic' | 'partial' | 'none' | 'unknown';
  adapterId?: string;
  currentVersion?: { documentsSeen: number; lastCheckedAt: IsoDate };
}

const ID = /^(il|global|eu|uk|us)-[a-z0-9]+(-[a-z0-9]+)*$/;
const HOST = /^(?=.{3,253}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

/** Every coherence problem of a record; an empty list means valid. */
export function sourceSystemIssues(
  s: SourceSystem,
  knownAdapters: readonly string[] = [],
): string[] {
  const issues: string[] = [];
  const p = (m: string) => issues.push(`${s.sourceSystemId}: ${m}`);
  if (!ID.test(s.sourceSystemId)) p('invalid sourceSystemId');
  if (!s.manufacturers.length) p('no manufacturer');
  if (!s.vehicleKinds.length) p('no vehicle kind');
  if (!s.domains.length) p('no domain');
  for (const d of s.domains) if (!HOST.test(d.host)) p(`invalid host ${d.host}`);
  if (s.origin === 'israeli') {
    if (s.market !== 'IL') p('an Israeli system must be official for market IL');
    if (s.authorityClass !== 'importer' && s.authorityClass !== 'manufacturer') {
      p('an Israeli system is an importer or the manufacturer itself');
    }
  } else if (s.market === 'IL') {
    p('a global system cannot claim the Israeli market');
  }
  if (s.authorityClass === 'importer' && !s.importer) p('importer name missing');
  if (s.sourceType === 'D_RESTRICTED_OR_UNAVAILABLE' && s.adapterId) {
    p('a restricted/unavailable system has no retrieval adapter');
  }
  if (s.sourceType !== 'D_RESTRICTED_OR_UNAVAILABLE' && !s.documentCategories.length) {
    p('a publishing system must list its document categories');
  }
  if (s.adapterId && knownAdapters.length && !knownAdapters.includes(s.adapterId)) {
    p(`unknown adapter ${s.adapterId}`);
  }
  if (!s.policy.versions.length) p('no policy');
  else {
    s.policy.versions.forEach((v, i) => {
      if (v.version !== i + 1) p('policy versions must be 1..n');
      for (const issue of policyIssues(v)) p(`policy v${v.version}: ${issue}`);
    });
  }
  for (const page of s.officialPages ?? []) {
    try {
      const host = new URL(page).hostname;
      if (!s.domains.some((d) => host === d.host || host.endsWith(`.${d.host}`))) {
        p(`official page ${page} is outside the system's domains`);
      }
    } catch {
      p(`invalid official page ${page}`);
    }
  }
  for (const ep of s.discovery.entryPoints) {
    try {
      const host = new URL(ep.url.replace(/\{[^}]+\}/g, 'x')).hostname;
      if (!s.domains.some((d) => host === d.host || host.endsWith(`.${d.host}`))) {
        p(`entry point ${ep.url} is outside the system's domains`);
      }
    } catch {
      p(`invalid entry point ${ep.url}`);
    }
  }
  return issues;
}

export function assertValidRegistry(
  systems: readonly SourceSystem[],
  knownAdapters: readonly string[] = [],
) {
  const ids = new Set<string>();
  const issues: string[] = [];
  for (const s of systems) {
    if (ids.has(s.sourceSystemId)) issues.push(`duplicate ${s.sourceSystemId}`);
    ids.add(s.sourceSystemId);
    issues.push(...sourceSystemIssues(s, knownAdapters));
  }
  if (issues.length) throw new Error(`invalid source registry:\n${issues.join('\n')}`);
}

export const policyOf = (s: SourceSystem) => currentPolicy(s.policy);

/** Host → system (the most specific domain wins). */
export function systemForHost(host: string, systems: readonly SourceSystem[]): SourceSystem | null {
  let best: { s: SourceSystem; len: number } | null = null;
  for (const s of systems) {
    for (const d of s.domains) {
      if ((host === d.host || host.endsWith(`.${d.host}`)) && (!best || d.host.length > best.len)) {
        best = { s, len: d.host.length };
      }
    }
  }
  return best?.s ?? null;
}
