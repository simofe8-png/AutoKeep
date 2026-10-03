import { MANUFACTURER_ALIASES } from '@/discovery/registry';

import { RegistryDiscovery } from '../sources';
import type { SourceSystem } from '../registry/sourceSystem';
import type { Http, VehicleIdentity } from '../types';
import { makeCandidate, normalizeResearch } from './candidates';
import type { VehicleFingerprint } from './fingerprint';
import { guardedFetch, type GuardedFetchDeps } from './netGuard';
import type { DiscoveryQuery } from './queries';
import type { SourceCandidate } from './types';

/**
 * M-SOURCE discovery adapters (Phase 7). Each returns CANDIDATES only, with a structured outcome;
 * none of them fetches a candidate document (acquisition does that, under the access engine).
 * Source-specific behaviour lives here, never in the resolver.
 */

export interface DiscoveryRunContext {
  fingerprint: VehicleFingerprint;
  queries: DiscoveryQuery[];
  now: () => string;
}

export interface AdapterOutcome {
  adapter: string;
  status: 'ok' | 'empty' | 'unavailable' | 'failed';
  candidates: SourceCandidate[];
  notes: string[];
  /** Sources the adapter saw but that may only be opened by the user (login, paywall). */
  restricted?: { url: string; reason: string }[];
}

export interface DiscoveryAdapter {
  readonly id: string;
  discover(ctx: DiscoveryRunContext): Promise<AdapterOutcome>;
}

// ---------- research assistant (Fable) ----------

/**
 * Port to a research assistant that proposes candidate sources for a fingerprint + queries.
 * Implementations: a recorded research run (worker / tooling host — e.g. a Fable research run
 * stored with the run evidence), or a live provider once approved (gate G3; none is wired).
 */
export interface ResearchProvider {
  readonly id: string;
  research(fp: VehicleFingerprint, queries: DiscoveryQuery[]): Promise<unknown>;
}

/** Candidates from the research assistant — validated, normalized, never evidence. */
export class FableDiscoveryAdapter implements DiscoveryAdapter {
  readonly id = 'fable';

  constructor(private readonly provider: ResearchProvider | null) {}

  async discover(ctx: DiscoveryRunContext): Promise<AdapterOutcome> {
    if (!this.provider) {
      return {
        adapter: this.id,
        status: 'unavailable',
        candidates: [],
        notes: ['research assistant not configured on this host'],
      };
    }
    let raw: unknown;
    try {
      raw = await this.provider.research(ctx.fingerprint, ctx.queries);
    } catch (e) {
      return {
        adapter: this.id,
        status: 'failed',
        candidates: [],
        notes: [`research failed: ${String(e).slice(0, 120)}`],
      };
    }
    const n = normalizeResearch(raw, { adapter: this.id, at: ctx.now() });
    return {
      adapter: this.id,
      status: n.candidates.length ? 'ok' : 'empty',
      candidates: n.candidates,
      notes: [
        `provider ${this.provider.id}`,
        ...n.rejected.map((r) => `rejected #${r.index}: ${r.reason}`),
      ],
      restricted: n.restrictedSeen,
    };
  }
}

/** A recorded research run (JSON produced by the assistant and stored with the run evidence). */
export function recordedResearch(id: string, output: unknown): ResearchProvider {
  return { id, research: async () => output };
}

// ---------- web search ----------

export interface SearchProvider {
  readonly id: string;
  search(query: string): Promise<{ url: string; title?: string; snippet?: string }[]>;
}

export class SearchDiscoveryAdapter implements DiscoveryAdapter {
  readonly id = 'search';

  constructor(
    private readonly provider: SearchProvider | null,
    private readonly maxQueries = 6,
    private readonly perQuery = 5,
  ) {}

  async discover(ctx: DiscoveryRunContext): Promise<AdapterOutcome> {
    if (!this.provider) {
      return {
        adapter: this.id,
        status: 'unavailable',
        candidates: [],
        notes: ['no web search provider is approved (gate G3)'],
      };
    }
    const candidates: SourceCandidate[] = [];
    const notes: string[] = [];
    for (const q of ctx.queries.slice(0, this.maxQueries)) {
      try {
        for (const r of (await this.provider.search(q.text)).slice(0, this.perQuery)) {
          const c = makeCandidate({
            url: r.url,
            title: r.title,
            sourceType: 'other',
            discoveredBy: this.id,
            discoveredAt: ctx.now(),
            query: q.text,
            language: q.language,
            hint: r.snippet?.slice(0, 300),
          });
          if (c) candidates.push(c);
        }
      } catch (e) {
        notes.push(`query ${q.id} failed: ${String(e).slice(0, 80)}`);
      }
    }
    return { adapter: this.id, status: candidates.length ? 'ok' : 'empty', candidates, notes };
  }
}

// ---------- official registry (manufacturer / importer source systems) ----------

/** Wraps the M-SOURCE registry discovery (listings, URL templates) behind the guarded transport. */
export class RegistryDiscoveryAdapter implements DiscoveryAdapter {
  readonly id = 'registry';

  constructor(
    private readonly registry: readonly SourceSystem[],
    private readonly net: GuardedFetchDeps,
  ) {}

  async discover(ctx: DiscoveryRunContext): Promise<AdapterOutcome> {
    const http: Http = async (url, opts) => {
      const r = await guardedFetch(url, this.net, {
        timeoutMs: 30_000,
        maxBytes: opts?.maxBytes ?? 5 * 1024 * 1024,
        maxRedirects: 3,
        retries: 1,
        allowedTypes: ['html', 'json', 'text', 'pdf'],
      });
      return r.ok
        ? {
            ok: true,
            status: r.response.status,
            url: r.response.finalUrl,
            contentType: r.response.contentType,
            bytes: r.response.bytes,
          }
        : { ok: false, status: r.status ?? 0, url, contentType: '', bytes: new Uint8Array() };
    };
    const fp = ctx.fingerprint;
    const identity: VehicleIdentity = {
      kind: fp.kind,
      make: fp.make,
      model: fp.model,
      modelYear: fp.modelYear,
      market: fp.market,
      ...(fp.displacementCc ? { displacementCc: fp.displacementCc } : {}),
      ...(fp.engineCodes[0] ? { engineCode: fp.engineCodes[0] } : {}),
      ...(fp.fuelType ? { powertrain: fp.fuelType } : {}),
    };
    const outcome = await new RegistryDiscovery().discover(identity, {
      http,
      registry: this.registry,
      aliases: MANUFACTURER_ALIASES,
      robots: new Map(),
    });
    const candidates = outcome.leads.flatMap((l) => {
      const c = makeCandidate({
        url: l.url,
        title: l.title,
        sourceType: 'oem_manual',
        discoveredBy: this.id,
        discoveredAt: ctx.now(),
      });
      return c ? [c] : [];
    });
    return {
      adapter: this.id,
      status: candidates.length ? 'ok' : 'empty',
      candidates,
      notes: [
        ...outcome.notes,
        ...(outcome.failures ?? []).map((f) => `${f.sourceSystemId}: ${f.code}`),
      ],
      restricted: (outcome.userActions ?? []).map((u) => ({ url: u.url, reason: u.reason })),
    };
  }
}

// ---------- previously discovered candidates (cache / shared catalog) ----------

export class KnownCandidatesAdapter implements DiscoveryAdapter {
  readonly id = 'catalog';

  constructor(private readonly known: readonly SourceCandidate[]) {}

  async discover(): Promise<AdapterOutcome> {
    return {
      adapter: this.id,
      status: this.known.length ? 'ok' : 'empty',
      candidates: [...this.known],
      notes: [],
    };
  }
}

// ---------- user documents ----------

export class UploadDiscoveryAdapter implements DiscoveryAdapter {
  readonly id = 'upload';

  constructor(
    private readonly uploads: readonly { id: string; name: string; bytes: Uint8Array }[],
  ) {}

  async discover(ctx: DiscoveryRunContext): Promise<AdapterOutcome> {
    const candidates = this.uploads.flatMap((u) => {
      const c = makeCandidate({
        url: `upload:${u.id}`,
        title: u.name,
        sourceType: 'user_upload',
        discoveredBy: this.id,
        discoveredAt: ctx.now(),
        upload: { name: u.name, bytes: u.bytes },
      });
      return c ? [c] : [];
    });
    return { adapter: this.id, status: candidates.length ? 'ok' : 'empty', candidates, notes: [] };
  }
}

// ---------- archived copies ----------

/**
 * Archived copies (Internet Archive availability API) for candidates that are GONE (404/410)
 * only — never for a candidate blocked by robots, policy, login or paywall (that would bypass
 * an access restriction).
 */
export async function archivedCopy(
  candidate: SourceCandidate,
  net: GuardedFetchDeps,
  authorize: (url: string) => Promise<boolean>,
  now: string,
): Promise<SourceCandidate | null> {
  const api = `https://archive.org/wayback/available?url=${encodeURIComponent(candidate.canonicalUrl)}`;
  if (!(await authorize(api))) return null;
  const r = await guardedFetch(api, net, {
    timeoutMs: 20_000,
    maxBytes: 256 * 1024,
    maxRedirects: 2,
    retries: 1,
    allowedTypes: ['json', 'text'],
  });
  if (!r.ok) return null;
  let snap: { available?: boolean; url?: string; status?: string } | undefined;
  try {
    snap = JSON.parse(new TextDecoder().decode(r.response.bytes))?.archived_snapshots?.closest;
  } catch {
    return null;
  }
  if (!snap?.available || !snap.url || snap.status !== '200') return null;
  // "id_" serves the original bytes without the archive toolbar.
  const raw = snap.url.replace(/^http:/, 'https:').replace(/\/web\/(\d+)\//, '/web/$1id_/');
  return makeCandidate({
    url: raw,
    title: candidate.title,
    publisher: candidate.publisher,
    sourceType: candidate.sourceType,
    formatHint: candidate.formatHint,
    discoveredBy: 'archive',
    discoveredAt: now,
    archiveOf: candidate.canonicalUrl,
    parentId: candidate.id,
  });
}
