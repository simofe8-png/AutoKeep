import type { PolicyDimension, PolicyValue } from '../registry/policy';
import { policyOf, systemForHost, type SourceSystem } from '../registry/sourceSystem';

import { guardedFetch, validateUrl, type GuardedFetchDeps } from './netGuard';
import { robotsVerdict } from './robots';

/**
 * M-SOURCE access / compliance engine (Phase 8, ADR-0020). Every operation on every source gets
 * its OWN explicit decision, recorded with reason, evidence and time:
 *
 *   DISCOVERY  — recording a candidate's metadata (URL, title). No request is made to the host.
 *   FETCH      — an automated download of that URL.
 *   EXTRACTION — machine-reading structured maintenance facts from what was fetched.
 *   STORAGE    — keeping the document's bytes after extraction.
 *
 * A personal written authorization is never required; explicit restrictions always win.
 *  - FETCH (owner correction 2026-10-02: RFC 9309 semantics; robots.txt is one input, never an
 *    authorization by itself): a recorded registry restriction (NOT_ALLOWED / REQUIRES_PERMISSION)
 *    decides first. Then robots.txt for "AutoKeepBot" (else the "*" group): a matching Disallow
 *    BLOCKS; a matching Allow, or no applicable rule / group, ALLOWS. robots.txt 4xx (except 429)
 *    = unavailable → no robots rule applies (§2.3.1.3). 5xx / 429 / network = unreachable →
 *    BLOCKED for this run, retried on the next run (§2.3.1.4). Login, paywall, CAPTCHA and
 *    401/403 detected at acquisition are BLOCKED.
 *  - EXTRACTION: the fetch was ALLOWED (or the user provided the document), no recorded
 *    restriction and no machine-readable "noai" reservation; only structured facts plus short
 *    locators are kept (no reproduction).
 *  - STORAGE: only a recorded ALLOWED caching policy (licence / owner decision) or the user's own
 *    private document; otherwise UNKNOWN → bytes are discarded, the sha256 is kept.
 * Explicit restrictions (robots Disallow, terms, login, paywall, CAPTCHA) are never bypassed.
 */

export const ACCESS_POLICY_VERSION = 'msource-access/2';
export const CRAWLER_TOKEN = 'AutoKeepBot';

export type AccessOperation = 'DISCOVERY' | 'FETCH' | 'EXTRACTION' | 'STORAGE';
export type AccessStatus = 'ALLOWED' | 'BLOCKED' | 'MANUAL_ONLY' | 'UNKNOWN';

export type AccessReason =
  | 'metadata_only'
  | 'invalid_url'
  | 'registry_rejected'
  | 'registry_not_allowed'
  | 'registry_requires_permission'
  | 'robots_allows'
  | 'robots_disallows'
  | 'robots_no_matching_rule'
  | 'robots_unavailable'
  | 'robots_unreachable'
  | 'fetch_not_allowed'
  | 'machine_readable_reservation'
  | 'facts_only_after_permitted_fetch'
  | 'user_provided'
  | 'registry_caching_allowed'
  | 'no_storage_permission'
  | 'access_control_detected';

export interface AccessEvidence {
  kind: 'robots' | 'registry_policy' | 'operation_scope' | 'user_action' | 'response';
  /** Where the evidence is (robots.txt URL, registry system id, …). */
  ref: string;
  /** Short statement: the deciding robots rule, the policy value and basis ids, … */
  detail: string;
}

export interface AccessDecision {
  operation: AccessOperation;
  status: AccessStatus;
  reason: AccessReason;
  url: string;
  host: string | null;
  evidence: AccessEvidence[];
  decidedAt: string;
  policyVersion: string;
}

export interface AccessContext {
  registry: readonly SourceSystem[];
  /** Transport for robots.txt (guarded: same SSRF limits as documents). */
  net: GuardedFetchDeps;
  now: () => string;
  /** robots.txt cache per host for one run: text, or a status when not readable. */
  robots: Map<string, { text: string | null; status: number | 'error' | 'unparseable' }>;
}

const hostOf = (url: string) => {
  const c = validateUrl(url);
  return c.ok ? c.url.hostname.toLowerCase() : null;
};

function decision(
  ctx: AccessContext,
  operation: AccessOperation,
  url: string,
  status: AccessStatus,
  reason: AccessReason,
  evidence: AccessEvidence[],
): AccessDecision {
  return {
    operation,
    status,
    reason,
    url,
    host: hostOf(url),
    evidence,
    decidedAt: ctx.now(),
    policyVersion: ACCESS_POLICY_VERSION,
  };
}

function registryRestriction(
  system: SourceSystem | null,
  dimension: PolicyDimension,
): { status: AccessStatus; reason: AccessReason; evidence: AccessEvidence } | null {
  if (!system) return null;
  const ev = (value: PolicyValue): AccessEvidence => {
    const d = policyOf(system).dimensions[dimension];
    return {
      kind: 'registry_policy',
      ref: `${system.sourceSystemId}#v${policyOf(system).version}`,
      detail: `${dimension}=${value}${d.basis.length ? ` (basis ${d.basis.join(', ')})` : ''}`,
    };
  };
  if (system.status === 'rejected') {
    return { status: 'BLOCKED', reason: 'registry_rejected', evidence: ev('NOT_ALLOWED') };
  }
  const value = policyOf(system).dimensions[dimension].value;
  if (value === 'NOT_ALLOWED') {
    return { status: 'BLOCKED', reason: 'registry_not_allowed', evidence: ev(value) };
  }
  if (value === 'REQUIRES_PERMISSION') {
    return { status: 'MANUAL_ONLY', reason: 'registry_requires_permission', evidence: ev(value) };
  }
  return null;
}

/** In-flight robots.txt requests per access context (one request per host, never parallel). */
type RobotsEntry = { text: string | null; status: number | 'error' | 'unparseable' };
const inFlight = new WeakMap<AccessContext, Map<string, Promise<RobotsEntry>>>();

async function robotsOf(host: string, ctx: AccessContext) {
  const cached = ctx.robots.get(host);
  if (cached) return cached;
  let pending = inFlight.get(ctx);
  if (!pending) inFlight.set(ctx, (pending = new Map()));
  const running = pending.get(host);
  if (running) return running;
  const p = fetchRobots(host, ctx).finally(() => pending!.delete(host));
  pending.set(host, p);
  return p;
}

async function fetchRobots(host: string, ctx: AccessContext): Promise<RobotsEntry> {
  const r = await guardedFetch(`https://${host}/robots.txt`, ctx.net, {
    timeoutMs: 15_000,
    maxBytes: 512 * 1024,
    maxRedirects: 5,
    retries: 1,
    allowedTypes: ['text', 'html'],
  });
  let entry: RobotsEntry;
  if (r.ok) {
    // RFC 9309 §2.3.1.1: a fetched file is parsed as-is; content that is not robots syntax
    // (e.g. an HTML page) yields no rules.
    entry = { text: new TextDecoder().decode(r.response.bytes), status: r.response.status };
  } else if (r.status != null && r.status >= 400 && r.status < 500 && r.status !== 429) {
    entry = { text: null, status: r.status }; // §2.3.1.3 unavailable
  } else if (r.failure === 'CONTENT_TYPE_NOT_ALLOWED' || r.failure === 'TOO_LARGE') {
    entry = { text: null, status: 'unparseable' };
  } else {
    // §2.3.1.4 unreachable (5xx, 429, network, DNS, redirect loop): complete disallow for now.
    entry = { text: null, status: r.status ?? 'error' };
  }
  ctx.robots.set(host, entry);
  return entry;
}

export function decideDiscovery(url: string, ctx: AccessContext, upload = false): AccessDecision {
  if (upload) {
    return decision(ctx, 'DISCOVERY', url, 'ALLOWED', 'user_provided', [
      { kind: 'user_action', ref: url, detail: 'the user added this document for their vehicle' },
    ]);
  }
  const check = validateUrl(url);
  if (!check.ok) {
    return decision(ctx, 'DISCOVERY', url, 'BLOCKED', 'invalid_url', [
      { kind: 'response', ref: url, detail: `${check.failure}: ${check.detail}` },
    ]);
  }
  return decision(ctx, 'DISCOVERY', url, 'ALLOWED', 'metadata_only', [
    { kind: 'operation_scope', ref: url, detail: 'candidate metadata recorded; no request made' },
  ]);
}

export async function decideFetch(url: string, ctx: AccessContext): Promise<AccessDecision> {
  const check = validateUrl(url);
  if (!check.ok) {
    return decision(ctx, 'FETCH', url, 'BLOCKED', 'invalid_url', [
      { kind: 'response', ref: url, detail: `${check.failure}: ${check.detail}` },
    ]);
  }
  const host = check.url.hostname.toLowerCase();
  const system = systemForHost(host, ctx.registry);
  const restricted = registryRestriction(system, 'automatedFetchAllowed');
  if (restricted) {
    return decision(ctx, 'FETCH', url, restricted.status, restricted.reason, [restricted.evidence]);
  }
  const robots = await robotsOf(host, ctx);
  const ref = `https://${host}/robots.txt`;
  if (robots.text == null) {
    const unavailable =
      robots.status === 'unparseable' ||
      (typeof robots.status === 'number' &&
        robots.status >= 400 &&
        robots.status < 500 &&
        robots.status !== 429);
    return unavailable
      ? decision(ctx, 'FETCH', url, 'ALLOWED', 'robots_unavailable', [
          {
            kind: 'robots',
            ref,
            detail: `robots.txt ${robots.status}: unavailable — no robots rule applies (RFC 9309 §2.3.1.3)`,
          },
        ])
      : decision(ctx, 'FETCH', url, 'BLOCKED', 'robots_unreachable', [
          {
            kind: 'robots',
            ref,
            detail: `robots.txt ${robots.status}: unreachable — treated as disallowed for now, retry later (RFC 9309 §2.3.1.4)`,
          },
        ]);
  }
  const v = robotsVerdict(robots.text, CRAWLER_TOKEN, check.url.pathname + check.url.search);
  const detail = `group ${v.group ?? '(none)'}; ${v.rule ?? 'no matching rule'}`;
  if (!v.allowed) {
    return decision(ctx, 'FETCH', url, 'BLOCKED', 'robots_disallows', [
      { kind: 'robots', ref, detail },
    ]);
  }
  return decision(
    ctx,
    'FETCH',
    url,
    'ALLOWED',
    v.rule ? 'robots_allows' : 'robots_no_matching_rule',
    [{ kind: 'robots', ref, detail }],
  );
}

/** Machine-readable text-and-data-mining reservations in an HTML document. */
export function hasAiReservation(html: string): boolean {
  const head = html.slice(0, 200_000);
  return (
    /<meta[^>]+name=["']?robots["']?[^>]+content=["'][^"'>]*\bnoai\b/i.test(head) ||
    /<meta[^>]+name=["']?tdm-reservation["']?[^>]+content=["']?\s*1\s*["']?/i.test(head)
  );
}

export function decideExtraction(
  input: {
    url: string;
    upload: boolean;
    fetch: AccessDecision | null;
    /** HTML documents: their own text, for a machine-readable reservation. */
    html?: string;
  },
  ctx: AccessContext,
): AccessDecision {
  if (input.upload) {
    return decision(ctx, 'EXTRACTION', input.url, 'ALLOWED', 'user_provided', [
      {
        kind: 'user_action',
        ref: input.url,
        detail: 'the user provided this document for their vehicle',
      },
    ]);
  }
  if (!input.fetch || input.fetch.status !== 'ALLOWED') {
    return decision(
      ctx,
      'EXTRACTION',
      input.url,
      input.fetch?.status === 'MANUAL_ONLY' ? 'MANUAL_ONLY' : 'BLOCKED',
      'fetch_not_allowed',
      [{ kind: 'operation_scope', ref: input.url, detail: 'no permitted fetch' }],
    );
  }
  const host = hostOf(input.url) ?? '';
  const restricted = registryRestriction(
    systemForHost(host, ctx.registry),
    'automatedExtractionAllowed',
  );
  if (restricted) {
    return decision(ctx, 'EXTRACTION', input.url, restricted.status, restricted.reason, [
      restricted.evidence,
    ]);
  }
  if (input.html && hasAiReservation(input.html)) {
    return decision(ctx, 'EXTRACTION', input.url, 'BLOCKED', 'machine_readable_reservation', [
      {
        kind: 'response',
        ref: input.url,
        detail: 'meta robots / tdm-reservation reserves machine reading',
      },
    ]);
  }
  return decision(ctx, 'EXTRACTION', input.url, 'ALLOWED', 'facts_only_after_permitted_fetch', [
    ...input.fetch.evidence,
    {
      kind: 'operation_scope',
      ref: input.url,
      detail: 'structured interval facts + short locators only; the document is not reproduced',
    },
  ]);
}

export function decideStorage(
  input: { url: string; upload: boolean },
  ctx: AccessContext,
): AccessDecision {
  if (input.upload) {
    return decision(ctx, 'STORAGE', input.url, 'ALLOWED', 'user_provided', [
      { kind: 'user_action', ref: input.url, detail: "the user's own document, stored privately" },
    ]);
  }
  const system = systemForHost(hostOf(input.url) ?? '', ctx.registry);
  const restricted = registryRestriction(system, 'documentCachingAllowed');
  if (restricted) {
    return decision(ctx, 'STORAGE', input.url, restricted.status, restricted.reason, [
      restricted.evidence,
    ]);
  }
  if (system && policyOf(system).dimensions.documentCachingAllowed.value === 'ALLOWED') {
    return decision(ctx, 'STORAGE', input.url, 'ALLOWED', 'registry_caching_allowed', [
      {
        kind: 'registry_policy',
        ref: system.sourceSystemId,
        detail: `documentCachingAllowed=ALLOWED (basis ${policyOf(system).dimensions.documentCachingAllowed.basis.join(', ')})`,
      },
    ]);
  }
  return decision(ctx, 'STORAGE', input.url, 'UNKNOWN', 'no_storage_permission', [
    {
      kind: 'operation_scope',
      ref: input.url,
      detail: 'bytes discarded after extraction; sha256 kept',
    },
  ]);
}
