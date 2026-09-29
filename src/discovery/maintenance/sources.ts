import { normalizeManufacturer } from '../authority';

import { accessDecision, hostOf } from './access';
import { anchorsOf } from './htmlText';
import type {
  BlockedAccess,
  DiscoveryContext,
  DiscoveryOutcome,
  EntryPoint,
  SourceDiscovery,
  SourceLead,
  SourceRegistryEntry,
  VehicleIdentity,
} from './types';

/**
 * Source-discovery adapters (provider-independent). None of them contains a per-model rule:
 *  - RegistryDiscovery walks the DATA entry points (listings, URL templates, sitemaps) of the
 *    official hosts registered for the vehicle's manufacturer, under the access policy;
 *  - UploadDiscovery offers the user's own uploaded documents;
 *  - WebSearchDiscovery is a port for a search provider (none approved → "not configured");
 *  - SecondaryDiscovery is a port for corroboration sources (never authoritative).
 * The reusable knowledge catalog is consulted before any of these (see pipeline.ts).
 */

/** "C-HR" → "chr", "PCX 125" → "pcx125", "Model 3" → "model3". */
export const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '');

export function modelSlugs(model: string): Record<string, string> {
  const lower = model.trim().toLowerCase();
  return {
    model: encodeURIComponent(model.trim()),
    modelSlug: compact(model),
    'model-slug': lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    model_slug: lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  };
}

export function fillTemplate(t: string, v: VehicleIdentity, locale?: string): string {
  const vars: Record<string, string> = {
    ...modelSlugs(v.model),
    year: String(v.modelYear),
    locale: locale ?? '',
  };
  return t.replace(/\{([a-zA-Z_-]+)\}/g, (m, k: string) => vars[k] ?? m);
}

const YEAR = /\b(19[89]\d|20[0-4]\d)\b/g;

/**
 * Does a text name the vehicle's model — as a whole name, not as part of another one? Separators
 * are ignored ("MT-07" ~ "mt07", "C-HR" ~ "chr"); a token equal to the displacement ("PCX 125") is
 * optional; "sx250" or "jet14evo" never name "SX" or "Jet 14".
 */
export function namesModel(
  hay: string,
  v: Pick<VehicleIdentity, 'model' | 'displacementCc'>,
): boolean {
  const all = v.model
    .toLowerCase()
    .split(/[^a-z0-9֐-׿]+/)
    .filter(Boolean);
  if (!all.length) return false;
  const sep = '[\\s_.-]*';
  const body = all
    .map((t, i) => {
      const e = `${i === 0 ? '' : sep}${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
      const optional = v.displacementCc && /^\d+$/.test(t) && Number(t) === v.displacementCc;
      return optional ? `(?:${e})?` : e;
    })
    .join('');
  // Not followed by another number ("SX 250" is not "SX 125"), except a model year.
  const tail = '(?![a-z0-9])(?![\\s_.-]*(?!(?:19|20)\\d\\d(?!\\d))\\d)';
  return new RegExp(`(?<![a-z0-9])${body}${tail}`, 'i').test(hay.toLowerCase());
}

/** The model's letters appear but not as the model's whole name (e.g. "jet14evo" for "Jet 14"). */
function nearMiss(hay: string, v: Pick<VehicleIdentity, 'model' | 'displacementCc'>): boolean {
  const core = v.model
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !(v.displacementCc && Number(t) === v.displacementCc))
    .join('');
  return core.length >= 3 && compact(hay).includes(core);
}

/**
 * Does a link (its text + URL) name this vehicle? The model must appear (compacted); a stated
 * year or year range must include the vehicle's year. No year stated → kept (checked later).
 */
export function linkNamesVehicle(text: string, href: string, v: VehicleIdentity): boolean {
  let path = href;
  try {
    path = decodeURIComponent(new URL(href).pathname);
  } catch {
    // keep raw
  }
  const hay = `${text} ${path}`;
  if (!namesModel(hay, v)) return false;
  const range = /\b(19[89]\d|20[0-4]\d)\s*[-–—]\s*(19[89]\d|20[0-4]\d)\b/.exec(hay);
  if (range) return v.modelYear >= Number(range[1]) && v.modelYear <= Number(range[2]);
  const years = [...hay.matchAll(YEAR)].map((m) => Number(m[1]));
  return years.length === 0 || years.includes(v.modelYear);
}

type BlockedAccessReason = BlockedAccess['reason'];

/** Sitemaps often list http:// URLs of an https site: same-host links are upgraded to https. */
export function upgradeSameHost(href: string, page: string): string {
  try {
    const h = new URL(href);
    const p = new URL(page);
    if (h.protocol === 'http:' && p.protocol === 'https:' && h.hostname === p.hostname) {
      h.protocol = 'https:';
      return h.toString();
    }
  } catch {
    // keep as is
  }
  return href;
}

const DOC_LINK = /\.pdf(\?|#|$)/i;

export class RegistryDiscovery implements SourceDiscovery {
  readonly id = 'official-registry';

  private assumeProposed = false;

  constructor(private readonly limits = { pages: 40, leads: 12 }) {}

  entriesFor(v: VehicleIdentity, ctx: DiscoveryContext): SourceRegistryEntry[] {
    const key = normalizeManufacturer(v.make, ctx.aliases);
    return ctx.registry.filter((e) => e.manufacturers.includes(key) && e.status !== 'rejected');
  }

  async discover(v: VehicleIdentity, ctx: DiscoveryContext): Promise<DiscoveryOutcome> {
    const outcome: DiscoveryOutcome = { adapter: this.id, leads: [], blocked: [], notes: [] };
    this.assumeProposed = !!ctx.assumeProposedApproved;
    const entries = this.entriesFor(v, ctx);
    if (entries.length === 0) {
      outcome.notes.push('unsupported_manufacturer: no registered official host');
      return outcome;
    }
    const seen = new Set<string>();
    const add = (lead: SourceLead) => {
      if (seen.has(lead.url) || outcome.leads.length >= this.limits.leads) return;
      seen.add(lead.url);
      outcome.leads.push(lead);
    };
    let budget = this.limits.pages;
    for (const entry of entries) {
      if (!entry.entryPoints?.length) {
        outcome.notes.push(`${entry.host}: authority only (no document library entry point)`);
        continue;
      }
      for (const ep of entry.entryPoints) {
        await this.walk(ep, entry, v, ctx, outcome, add, () => budget-- > 0);
      }
    }
    return outcome;
  }

  private offer(
    outcome: DiscoveryOutcome,
    url: string,
    entry: SourceRegistryEntry,
    reason: BlockedAccessReason,
  ) {
    // Only approved official hosts are offered to the user; nothing unverified is pointed at.
    const approved =
      entry.status === 'approved' || (entry.status === 'proposed' && this.assumeProposed);
    if (!approved || !USER_OPENABLE.includes(reason)) return;
    outcome.userActions ??= [];
    if (outcome.userActions.some((a) => a.url === url)) return;
    outcome.userActions.push({
      url,
      host: entry.host,
      title: `${entry.host} (${entry.role})`,
      reason,
    });
  }

  private async walk(
    ep: EntryPoint,
    entry: SourceRegistryEntry,
    v: VehicleIdentity,
    ctx: DiscoveryContext,
    outcome: DiscoveryOutcome,
    add: (l: SourceLead) => void,
    spend: () => boolean,
  ) {
    if (ep.kind === 'template') {
      for (const locale of ep.locales ?? ['']) {
        const url = fillTemplate(ep.url, v, locale);
        const decision = await accessDecision(url, ctx);
        if (decision.ok) {
          add({ url, via: 'official_template', adapter: this.id, title: `${entry.host} template` });
        } else {
          outcome.blocked.push(decision.blocked);
          this.offer(outcome, url, entry, decision.blocked.reason);
        }
      }
      return;
    }
    if (ep.kind === 'sitemap') {
      outcome.notes.push(`${entry.host}: sitemap entry point not used for manuals`);
      return;
    }
    // listing: breadth-first over official pages only.
    const follow = ep.follow ? new RegExp(ep.follow, 'i') : null;
    const docs = ep.documents ? new RegExp(ep.documents, 'i') : DOC_LINK;
    let frontier = [fillTemplate(ep.url, v)];
    const visited = new Set<string>();
    for (let depth = 0; depth <= (ep.depth ?? 1) && frontier.length; depth++) {
      const next: string[] = [];
      for (const url of frontier) {
        if (visited.has(url) || !spend()) continue;
        visited.add(url);
        const decision = await accessDecision(url, ctx);
        if (!decision.ok) {
          outcome.blocked.push(decision.blocked);
          if (depth === 0) this.offer(outcome, url, entry, decision.blocked.reason);
          continue;
        }
        let html: string;
        try {
          const r = await ctx.http(url, { maxBytes: 8 * 1024 * 1024 });
          if (!r.ok) {
            outcome.blocked.push({
              url,
              reason: r.status === 401 || r.status === 403 ? 'login_or_bot_wall' : 'http_error',
              detail: `HTTP ${r.status}`,
            });
            continue;
          }
          html = new TextDecoder().decode(r.bytes);
        } catch (e) {
          outcome.blocked.push({ url, reason: 'network_error', detail: String(e) });
          continue;
        }
        // An XML sitemap lists pages as <loc>; an HTML page as anchors.
        const anchors = (
          /<(urlset|sitemapindex)\b/i.test(html.slice(0, 2000))
            ? [...html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => ({
                href: m[1].replace(/&amp;/g, '&'),
                text: '',
              }))
            : anchorsOf(html, url)
        ).map((a) => ({ ...a, href: upgradeSameHost(a.href, url) }));
        if (anchors.length === 0) outcome.notes.push(`${url}: no static links (JavaScript app?)`);
        // A page reached by following a link that named the vehicle is the vehicle's own page:
        // its document links need not repeat the model name.
        const vehiclePage = depth > 0;
        for (const a of anchors) {
          const named = linkNamesVehicle(a.text, a.href, v);
          if (!named && nearMiss(`${a.text} ${a.href}`, v)) {
            outcome.notes.push(`near miss (different model name?): ${a.href}`);
          }
          if (docs.test(a.href) && (named || vehiclePage)) {
            add({
              url: a.href,
              title: vehiclePage ? `(${url}) ${a.text}`.trim() : a.text,
              via: 'official_listing',
              adapter: this.id,
            });
          } else if (follow?.test(a.href) && named && hostOf(a.href) === hostOf(url)) {
            next.push(a.href);
          }
        }
      }
      frontier = next;
    }
  }
}

/** Hosts the user may open themselves: official, and blocked only for AUTOMATION. */
const USER_OPENABLE: readonly string[] = [
  'terms_prohibit_automation',
  'terms_unknown',
  'robots_disallow',
  'login_or_bot_wall',
];

/** The user's own uploaded documents for this vehicle (never authoritative by upload alone). */
export class UploadDiscovery implements SourceDiscovery {
  readonly id = 'user-upload';

  constructor(private readonly uploads: readonly { name: string; bytes: Uint8Array }[]) {}

  async discover(): Promise<DiscoveryOutcome> {
    return {
      adapter: this.id,
      leads: this.uploads.map((u) => ({
        url: `upload:${u.name}`,
        title: u.name,
        via: 'user_upload' as const,
        adapter: this.id,
        upload: u,
      })),
      blocked: [],
      notes: [],
    };
  }
}

/** Web search port: the vendor is an owner decision (G1/G3: zero-cost, none approved). */
export interface WebSearchProvider {
  readonly id: string;
  search(query: string): Promise<{ url: string; title: string }[]>;
}

export class WebSearchDiscovery implements SourceDiscovery {
  readonly id = 'web-search';

  constructor(private readonly provider: WebSearchProvider | null) {}

  async discover(v: VehicleIdentity): Promise<DiscoveryOutcome> {
    const outcome: DiscoveryOutcome = { adapter: this.id, leads: [], blocked: [], notes: [] };
    if (!this.provider) {
      outcome.notes.push('provider_not_configured: no web search provider is approved');
      return outcome;
    }
    const q = `${v.make} ${v.model} ${v.modelYear} owner's manual maintenance schedule`;
    for (const r of await this.provider.search(q)) {
      // Search results are leads only; the access policy and authority decide downstream.
      outcome.leads.push({ url: r.url, title: r.title, via: 'web_search', adapter: this.id });
    }
    return outcome;
  }
}

/** Secondary corroboration sources (forums, press, parts sellers): level D at most. */
export class SecondaryDiscovery implements SourceDiscovery {
  readonly id = 'secondary';

  async discover(): Promise<DiscoveryOutcome> {
    return {
      adapter: this.id,
      leads: [],
      blocked: [],
      notes: ['provider_not_configured: no secondary-source provider is approved'],
    };
  }
}
