import { robotsAllows } from '../officialSiteDiscovery';

import type {
  AcquiredDocument,
  BlockedAccess,
  DiscoveryContext,
  SourceLead,
  SourceRegistryEntry,
} from './types';

/**
 * Access policy + acquisition (owner decision P1 §8.4, 2026-09-27): automated retrieval only when
 * BOTH robots.txt/access controls allow it AND the host's terms are known not to prohibit the
 * automation. Unregistered hosts, unapproved registry entries and unknown terms are NOT fetched.
 * Every decision is returned as data so failures can be classified, never silently skipped.
 */

export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    return u.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

/** The most specific registry entry for a host (exact host, else the longest parent domain). */
export function registryEntryFor(
  host: string,
  registry: readonly SourceRegistryEntry[],
): SourceRegistryEntry | null {
  const matches = registry.filter((e) => host === e.host || host.endsWith(`.${e.host}`));
  return matches.sort((a, b) => b.host.length - a.host.length)[0] ?? null;
}

export type AccessDecision =
  | { ok: true; entry: SourceRegistryEntry }
  | { ok: false; blocked: BlockedAccess; entry: SourceRegistryEntry | null };

async function robotsFor(host: string, ctx: DiscoveryContext): Promise<string | null> {
  if (ctx.robots.has(host)) return ctx.robots.get(host)!;
  let text: string | null = null;
  try {
    const r = await ctx.http(`https://${host}/robots.txt`, { maxBytes: 512 * 1024 });
    // A missing robots.txt (404) allows everything; an error/bot wall is treated as unreadable.
    if (r.ok) text = new TextDecoder().decode(r.bytes);
    else if (r.status === 404) text = '';
  } catch {
    text = null;
  }
  ctx.robots.set(host, text);
  return text;
}

export async function accessDecision(url: string, ctx: DiscoveryContext): Promise<AccessDecision> {
  const host = hostOf(url);
  const block = (
    reason: BlockedAccess['reason'],
    entry: SourceRegistryEntry | null,
    detail?: string,
  ) => ({ ok: false, blocked: { url, reason, detail }, entry }) as const;
  if (!host) return block('not_https', null);
  const entry = registryEntryFor(host, ctx.registry);
  if (!entry || entry.status === 'rejected') return block('not_registered', entry);
  if (entry.status === 'proposed' && !ctx.assumeProposedApproved) {
    return block('registry_not_approved', entry);
  }
  if (entry.automation === 'prohibited') return block('terms_prohibit_automation', entry);
  if (entry.automation === 'unknown') return block('terms_unknown', entry);
  const robots = await robotsFor(host, ctx);
  if (robots === null) return block('robots_disallow', entry, 'robots.txt unreadable');
  const u = new URL(url);
  if (!robotsAllows(robots, u.pathname + u.search)) return block('robots_disallow', entry);
  return { ok: true, entry };
}

const BOT_WALL =
  /(captcha|cf-chl|cf_chl|access denied|request unsuccessful\. incapsula|are you a robot|sign in to continue|please log ?in)/i;

export const MAX_DOCUMENT_BYTES = 60 * 1024 * 1024;

export type Acquisition =
  { ok: true; doc: AcquiredDocument } | { ok: false; blocked: BlockedAccess };

function formatOf(bytes: Uint8Array, contentType: string): 'pdf' | 'html' | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return 'pdf';
  }
  if (/html|xml/i.test(contentType)) return 'html';
  const head = new TextDecoder().decode(bytes.slice(0, 512)).trimStart().toLowerCase();
  return head.startsWith('<!doctype html') || head.startsWith('<html') ? 'html' : null;
}

/** Retrieves one lead under the access policy; the final URL after redirects is re-checked. */
export async function acquire(
  lead: SourceLead,
  ctx: DiscoveryContext & { sha256: (b: Uint8Array) => Promise<string> },
): Promise<Acquisition> {
  if (lead.upload) {
    const format = formatOf(lead.upload.bytes, '');
    if (!format) return { ok: false, blocked: { url: lead.url, reason: 'not_a_document' } };
    return {
      ok: true,
      doc: {
        lead,
        url: lead.url,
        finalUrl: lead.url,
        host: 'upload',
        sha256: await ctx.sha256(lead.upload.bytes),
        format,
        bytes: lead.upload.bytes,
        registryEntry: null,
      },
    };
  }
  const decision = await accessDecision(lead.url, ctx);
  if (!decision.ok) return { ok: false, blocked: decision.blocked };
  let res;
  try {
    res = await ctx.http(lead.url, { maxBytes: MAX_DOCUMENT_BYTES });
  } catch (e) {
    return { ok: false, blocked: { url: lead.url, reason: 'network_error', detail: String(e) } };
  }
  if (!res.ok) {
    const reason = res.status === 401 || res.status === 403 ? 'login_or_bot_wall' : 'http_error';
    return { ok: false, blocked: { url: lead.url, reason, detail: `HTTP ${res.status}` } };
  }
  if (res.url !== lead.url) {
    const again = await accessDecision(res.url, ctx);
    if (!again.ok)
      return { ok: false, blocked: { ...again.blocked, detail: `redirected from ${lead.url}` } };
  }
  if (res.bytes.length > MAX_DOCUMENT_BYTES) {
    return { ok: false, blocked: { url: lead.url, reason: 'too_large' } };
  }
  const format = formatOf(res.bytes, res.contentType);
  if (!format)
    return {
      ok: false,
      blocked: { url: lead.url, reason: 'not_a_document', detail: res.contentType },
    };
  if (format === 'html' && BOT_WALL.test(new TextDecoder().decode(res.bytes.slice(0, 200_000)))) {
    return { ok: false, blocked: { url: lead.url, reason: 'login_or_bot_wall' } };
  }
  return {
    ok: true,
    doc: {
      lead,
      url: lead.url,
      finalUrl: res.url,
      host: hostOf(res.url) ?? '',
      sha256: await ctx.sha256(res.bytes),
      format,
      bytes: res.bytes,
      registryEntry: registryEntryFor(hostOf(res.url) ?? '', ctx.registry),
    },
  };
}
