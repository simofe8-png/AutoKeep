import {
  normalizeManufacturer,
  type ManufacturerAliases,
  type OfficialDomainEntry,
} from './authority';
import type { DiscoveryProvider, SourceCandidate, VehicleIdentityQuery } from './types';

/**
 * Hybrid official-source discovery (ADR-0016, G2):
 *   1. AutoKeep's verified registry of KNOWN official sources (documents listed per model/years);
 *   2. automated web discovery — only when (1) yields nothing.
 * Every result is only a CANDIDATE: authority, retrieval, applicability, grounding and domain
 * verification still decide trust downstream. Ranking here confers nothing.
 */

/** A document known to be published by a verified official source (evidence-backed entry). */
export interface KnownOfficialDocument {
  manufacturer: string;
  url: string;
  title: string;
  models: string[];
  yearFrom?: number;
  yearTo?: number;
  market?: 'IL';
  verifiedBy: string;
  verifiedAt: string;
}

/** Web search port (search API / AI-assisted browsing). The vendor is a separate approval. */
export interface WebSearchPort {
  readonly id: string;
  search(query: string): Promise<{ url: string; title: string; snippet?: string }[]>;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export class KnownSourceProvider implements DiscoveryProvider {
  readonly id = 'known-official-sources';

  constructor(
    private readonly documents: readonly KnownOfficialDocument[],
    private readonly aliases: ManufacturerAliases,
  ) {}

  async search(q: VehicleIdentityQuery): Promise<SourceCandidate[]> {
    const key = normalizeManufacturer(q.manufacturer, this.aliases);
    return this.documents
      .filter(
        (d) =>
          normalizeManufacturer(d.manufacturer, this.aliases) === key &&
          d.models.some((m) => norm(m) === norm(q.model)) &&
          (d.yearFrom === undefined || q.year >= d.yearFrom) &&
          (d.yearTo === undefined || q.year <= d.yearTo),
      )
      .map((d) => ({ url: d.url, title: d.title, discoveredBy: this.id }));
  }
}

/**
 * Web discovery, restricted to the verified official domains of the vehicle's manufacturer where
 * possible (site: filters) — results outside them are still returned as candidates and are then
 * rejected by authority classification, never trusted.
 */
export class WebDiscoveryProvider implements DiscoveryProvider {
  readonly id: string;

  constructor(
    private readonly web: WebSearchPort,
    private readonly registry: readonly OfficialDomainEntry[],
    private readonly aliases: ManufacturerAliases,
  ) {
    this.id = `web:${web.id}`;
  }

  async search(q: VehicleIdentityQuery): Promise<SourceCandidate[]> {
    const key = normalizeManufacturer(q.manufacturer, this.aliases);
    const domains = this.registry.filter((e) => e.manufacturer === key).map((e) => e.domain);
    const base = `${q.manufacturer} ${q.model} ${q.year} owner's manual maintenance schedule pdf`;
    const queries = domains.length ? domains.map((d) => `${base} site:${d}`) : [base];
    const seen = new Set<string>();
    const out: SourceCandidate[] = [];
    for (const query of queries) {
      for (const r of await this.web.search(query)) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        out.push({ url: r.url, title: r.title, snippet: r.snippet, discoveredBy: this.id });
      }
    }
    return out;
  }
}

export class HybridDiscoveryProvider implements DiscoveryProvider {
  readonly id = 'hybrid';

  constructor(
    private readonly known: DiscoveryProvider,
    private readonly web: DiscoveryProvider | null,
  ) {}

  async search(q: VehicleIdentityQuery): Promise<SourceCandidate[]> {
    const known = await this.known.search(q);
    if (known.length > 0 || !this.web) return known;
    return this.web.search(q);
  }
}
