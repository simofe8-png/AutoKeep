import {
  normalizeManufacturer,
  type ManufacturerAliases,
  type OfficialDomainEntry,
} from './authority';
import type { DiscoveryProvider, SourceCandidate, VehicleIdentityQuery } from './types';

/**
 * Zero-cost web discovery (G3): instead of a paid search API, crawl ONLY the verified official
 * domains of the vehicle's manufacturer through their public robots.txt + sitemaps, and propose
 * PDF documents that look like manuals / maintenance schedules. Bounded (sitemaps, URLs, bytes,
 * time), robots-respecting, and — like every discovery tier — returns CANDIDATES only: retrieval,
 * coverage read from the document itself, exact applicability and grounding still decide trust.
 */

export type HttpText = (url: string) => Promise<{ ok: boolean; text: string }>;

export const LIMITS = { sitemaps: 6, urls: 20_000, candidates: 10 };

const DOC_HINT = /(manual|owner|maintenance|service|handbook|guide|ספר|תחזוקה|טיפולים)/i;

/** RFC 9309 path pattern: prefix match, `*` = any run of characters, trailing `$` = end. */
function robotsMatch(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const re = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${re}${anchored ? '$' : ''}`).test(path);
}

function robotsAllows(robots: string, path: string): boolean {
  // robots.txt for the "*" group (RFC 9309): the longest matching rule wins; Allow wins a tie.
  let applies = false;
  let best: { len: number; allow: boolean } | null = null;
  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    const m = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      applies = val === '*';
      continue;
    }
    if (!applies || !val) continue;
    if (
      robotsMatch(val, path) &&
      (!best || val.length > best.len || (val.length === best.len && key === 'allow'))
    ) {
      best = { len: val.length, allow: key === 'allow' };
    }
  }
  return best ? best.allow : true;
}

const locs = (xml: string) =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));

const tokens = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9֐-׿]+/)
    .filter((t) => t.length >= 2);

export class OfficialSiteDiscoveryProvider implements DiscoveryProvider {
  readonly id = 'official-site-sitemaps';

  constructor(
    private readonly registry: readonly OfficialDomainEntry[],
    private readonly aliases: ManufacturerAliases,
    private readonly get: HttpText,
  ) {}

  async search(q: VehicleIdentityQuery): Promise<SourceCandidate[]> {
    const key = normalizeManufacturer(q.manufacturer, this.aliases);
    const domains = this.registry.filter((e) => e.manufacturer === key).map((e) => e.domain);
    const modelTokens = tokens(q.model);
    const out: SourceCandidate[] = [];
    for (const domain of domains) {
      const origin = `https://${domain}`;
      const robots = await this.get(`${origin}/robots.txt`).catch(() => ({ ok: false, text: '' }));
      const robotsText = robots.ok ? robots.text : '';
      const declared = [...robotsText.matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)].map((m) => m[1]);
      const queue = declared.length ? declared : [`${origin}/sitemap.xml`];
      const seen = new Set<string>();
      let urls = 0;
      while (queue.length && seen.size < LIMITS.sitemaps && urls < LIMITS.urls) {
        const sm = queue.shift()!;
        if (seen.has(sm) || !sm.startsWith(origin)) continue;
        seen.add(sm);
        const r = await this.get(sm).catch(() => ({ ok: false, text: '' }));
        if (!r.ok) continue;
        for (const u of locs(r.text)) {
          urls += 1;
          if (/\.xml(\.gz)?$/i.test(u)) {
            queue.push(u);
            continue;
          }
          if (!/\.pdf(\?|$)/i.test(u) || !u.startsWith(origin)) continue;
          const path = new URL(u).pathname;
          if (!robotsAllows(robotsText, path)) continue;
          const t = tokens(decodeURIComponent(path));
          const modelHit = modelTokens.some((m) => t.includes(m));
          if (!modelHit && !DOC_HINT.test(path)) continue;
          out.push({
            url: u,
            title: decodeURIComponent(path.split('/').pop() ?? u),
            discoveredBy: this.id,
          });
          if (out.length >= LIMITS.candidates) return out;
        }
      }
    }
    return out;
  }
}

export { robotsAllows };
