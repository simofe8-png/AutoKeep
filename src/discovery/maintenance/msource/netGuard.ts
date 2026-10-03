/**
 * SSRF-safe acquisition transport (M-SOURCE Phase 10). Every URL M-SOURCE touches — candidate,
 * redirect hop, robots.txt — passes `validateUrl`; every response passes the type and size
 * limits. Pure TypeScript over an injected `fetch`, so the same guard runs in the app, in the
 * worker host and in tests.
 *
 *  - https only (the existing AutoKeep architecture is https-only; http is not re-introduced);
 *  - no credentials in the URL, default port only;
 *  - no localhost / private / link-local / CGNAT / multicast / reserved address, in any notation
 *    (dotted, decimal, octal, hex, IPv6, IPv4-mapped IPv6), no single-label or internal names;
 *  - if the host offers DNS resolution (`resolve`), every resolved address is re-checked
 *    (DNS-rebinding defence); hosts without it rely on the name checks;
 *  - redirects are followed MANUALLY, each hop re-validated and re-authorized by the caller;
 *  - bounded time, bytes, redirects and retries; content-type allow-list.
 */

export type GuardFailure =
  | 'INVALID_URL'
  | 'SCHEME_NOT_ALLOWED'
  | 'CREDENTIALS_IN_URL'
  | 'PORT_NOT_ALLOWED'
  | 'PRIVATE_ADDRESS'
  | 'INTERNAL_HOSTNAME'
  | 'DNS_FAILURE'
  | 'REDIRECT_LIMIT'
  | 'REDIRECT_BLOCKED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'HTTP_ERROR'
  | 'CONTENT_TYPE_NOT_ALLOWED'
  | 'TOO_LARGE';

export type UrlCheck =
  { ok: true; url: URL } | { ok: false; failure: GuardFailure; detail: string };

const INTERNAL_SUFFIX =
  /(^|\.)(localhost|local|localdomain|internal|intranet|lan|home|corp|private|test|invalid|example|onion|arpa)$/i;

/** Parses one IPv4 component in decimal, octal (0…) or hex (0x…) — as URL parsers accept them. */
function ipv4Part(s: string): number | null {
  if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
  if (/^0[0-7]+$/.test(s)) return parseInt(s, 8);
  if (/^(0|[1-9]\d*)$/.test(s)) return Number(s);
  return null;
}

/** "127.1", "2130706433", "0x7f.0.0.1" → [127,0,0,1]; null when the host is not an IPv4 literal. */
export function parseIpv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length === 0 || parts.length > 4 || parts.some((p) => p === '')) return null;
  const nums = parts.map(ipv4Part);
  if (nums.some((n) => n == null)) return null;
  const n = nums as number[];
  const last = n[n.length - 1];
  const head = n.slice(0, -1);
  if (head.some((x) => x > 255) || last >= 2 ** (8 * (5 - n.length))) return null;
  let value = last;
  head.forEach((x, i) => {
    value += x * 2 ** (8 * (3 - i));
  });
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

export function isPrivateIpv4([a, b, c]: number[]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast + reserved + broadcast
  );
}

/** Expands an IPv6 literal (with or without brackets) to 8 hextets; null if not IPv6. */
export function parseIpv6(host: string): number[] | null {
  let h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h.includes(':')) return null;
  h = h.split('%')[0];
  // Embedded IPv4 tail ("::ffff:127.0.0.1").
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (v4) {
    const p = parseIpv4(v4[1]);
    if (!p) return null;
    h =
      h.slice(0, -v4[1].length) +
      `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = h.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = halves.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0) return null;
  const all = [...left, ...Array(fill).fill('0'), ...right];
  if (all.length !== 8 || all.some((x) => !/^[0-9a-f]{1,4}$/.test(x))) return null;
  return all.map((x) => parseInt(x, 16));
}

export function isPrivateIpv6(h: number[]): boolean {
  const zeroHead = h.slice(0, 5).every((x) => x === 0);
  if (zeroHead && h[5] === 0xffff) {
    // IPv4-mapped.
    return isPrivateIpv4([h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255]);
  }
  if (h.slice(0, 6).every((x) => x === 0)) return true; // ::, ::1, IPv4-compatible
  if (h[0] === 0x64 && h[1] === 0xff9b) {
    return isPrivateIpv4([h[6] >> 8, h[6] & 255, h[7] >> 8, h[7] & 255]); // NAT64
  }
  return (
    (h[0] & 0xfe00) === 0xfc00 || // unique local
    (h[0] & 0xffc0) === 0xfe80 || // link-local
    (h[0] & 0xff00) === 0xff00 || // multicast
    (h[0] === 0x2001 && h[1] === 0x0db8) // documentation
  );
}

export function isPrivateAddress(address: string): boolean {
  const v4 = parseIpv4(address);
  if (v4) return isPrivateIpv4(v4);
  const v6 = parseIpv6(address);
  if (v6) return isPrivateIpv6(v6);
  return false;
}

/** Static checks on a URL (no network). */
export function validateUrl(raw: string): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, failure: 'INVALID_URL', detail: 'unparseable' };
  }
  if (url.protocol !== 'https:') {
    return { ok: false, failure: 'SCHEME_NOT_ALLOWED', detail: url.protocol };
  }
  if (url.username || url.password) {
    return { ok: false, failure: 'CREDENTIALS_IN_URL', detail: 'userinfo present' };
  }
  if (url.port && url.port !== '443') {
    return { ok: false, failure: 'PORT_NOT_ALLOWED', detail: url.port };
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return { ok: false, failure: 'INVALID_URL', detail: 'no host' };
  if (parseIpv4(host) || parseIpv6(host)) {
    return isPrivateAddress(host)
      ? { ok: false, failure: 'PRIVATE_ADDRESS', detail: host }
      : // Public IP literals are refused too: real publishers are reached by name.
        { ok: false, failure: 'INTERNAL_HOSTNAME', detail: 'IP literal' };
  }
  if (!host.includes('.') || INTERNAL_SUFFIX.test(host)) {
    return { ok: false, failure: 'INTERNAL_HOSTNAME', detail: host };
  }
  if (!/^[a-z0-9.-]+$/.test(host) || host.split('.').some((l) => !l || l.length > 63)) {
    return { ok: false, failure: 'INVALID_URL', detail: 'hostname characters' };
  }
  url.hash = '';
  return { ok: true, url };
}

export interface GuardLimits {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
  /** Retries after a transient failure (network error, 429, 5xx). */
  retries: number;
  allowedTypes: readonly ('pdf' | 'html' | 'text' | 'json')[];
}

export const DEFAULT_LIMITS: GuardLimits = {
  timeoutMs: 30_000,
  maxBytes: 40 * 1024 * 1024,
  maxRedirects: 5,
  retries: 2,
  allowedTypes: ['pdf', 'html'],
};

export function contentKind(
  contentType: string,
  bytes: Uint8Array,
): 'pdf' | 'html' | 'text' | 'json' | null {
  const ct = contentType.split(';')[0].trim().toLowerCase();
  const pdfMagic = bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-';
  if (pdfMagic)
    return ct === '' || ct.includes('pdf') || ct === 'application/octet-stream' ? 'pdf' : null;
  if (ct.includes('pdf')) return null; // declared PDF without PDF bytes: refuse
  if (ct === 'text/html' || ct === 'application/xhtml+xml') return 'html';
  if (ct === 'application/json' || ct.endsWith('+json')) return 'json';
  if (ct === 'text/plain') return 'text';
  if (ct === '') {
    const head = new TextDecoder().decode(bytes.slice(0, 256)).trimStart().toLowerCase();
    if (head.startsWith('<!doctype html') || head.startsWith('<html')) return 'html';
  }
  return null;
}

export interface GuardedResponse {
  status: number;
  finalUrl: string;
  /** Every URL visited, in order (initial + redirect hops). */
  chain: string[];
  contentType: string;
  kind: 'pdf' | 'html' | 'text' | 'json';
  bytes: Uint8Array;
}

export type GuardedResult =
  | { ok: true; response: GuardedResponse }
  | { ok: false; failure: GuardFailure; detail: string; status?: number; chain: string[] };

export interface GuardedFetchDeps {
  fetch: typeof fetch;
  /** Optional DNS resolution (worker host); every address must be public. */
  resolve?: (host: string) => Promise<string[]>;
  /**
   * Re-authorizes every redirect hop (access policy + robots). Returning a reason blocks it.
   * The initial URL is authorized by the caller before calling.
   */
  authorizeHop?: (url: string) => Promise<string | null>;
  userAgent: string;
  sleep?: (ms: number) => Promise<void>;
}

async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | 'too_large'> {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) return 'too_large';
  const body = res.body as ReadableStream<Uint8Array> | null;
  if (body && typeof body.getReader === 'function') {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return 'too_large';
      }
      chunks.push(value);
    }
    const out = new Uint8Array(size);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf.length > maxBytes ? 'too_large' : buf;
}

async function checkDns(host: string, deps: GuardedFetchDeps): Promise<UrlCheck | null> {
  if (!deps.resolve) return null;
  let addrs: string[];
  try {
    addrs = await deps.resolve(host);
  } catch {
    return { ok: false, failure: 'DNS_FAILURE', detail: host };
  }
  if (!addrs.length) return { ok: false, failure: 'DNS_FAILURE', detail: host };
  const bad = addrs.find(isPrivateAddress);
  return bad
    ? { ok: false, failure: 'PRIVATE_ADDRESS', detail: `${host} → private address` }
    : null;
}

const TRANSIENT = (s: number) => s === 429 || s >= 500;

/** One guarded GET with manual redirects, bounded retries, time, bytes and content types. */
export async function guardedFetch(
  rawUrl: string,
  deps: GuardedFetchDeps,
  limits: GuardLimits = DEFAULT_LIMITS,
): Promise<GuardedResult> {
  const chain: string[] = [];
  let current = rawUrl;
  for (let hop = 0; hop <= limits.maxRedirects; hop += 1) {
    const check = validateUrl(current);
    if (!check.ok) return { ...check, chain };
    const dns = await checkDns(check.url.hostname, deps);
    if (dns && !dns.ok) return { ...dns, chain };
    let href = check.url.href;
    chain.push(href);
    if (hop > 0 && deps.authorizeHop) {
      const reason = await deps.authorizeHop(href);
      if (reason) return { ok: false, failure: 'REDIRECT_BLOCKED', detail: reason, chain };
    }
    let res: Response | null = null;
    let lastError = '';
    for (let attempt = 0; attempt <= limits.retries; attempt += 1) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), limits.timeoutMs);
      try {
        res = await deps.fetch(href, {
          method: 'GET',
          redirect: 'manual',
          signal: ctl.signal,
          headers: { 'user-agent': deps.userAgent, accept: 'application/pdf,text/html;q=0.9' },
        });
        if (!TRANSIENT(res.status) || attempt === limits.retries) break;
        lastError = `HTTP ${res.status}`;
      } catch (e) {
        res = null;
        lastError = ctl.signal.aborted ? 'timeout' : String(e).slice(0, 120);
        if (attempt === limits.retries) {
          return {
            ok: false,
            failure: ctl.signal.aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
            detail: lastError,
            chain,
          };
        }
      } finally {
        clearTimeout(timer);
      }
      await (deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(500 * 2 ** attempt);
    }
    if (!res) return { ok: false, failure: 'NETWORK_ERROR', detail: lastError, chain };
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc)
        return {
          ok: false,
          failure: 'HTTP_ERROR',
          detail: 'redirect without location',
          status: res.status,
          chain,
        };
      try {
        current = new URL(loc, href).href;
      } catch {
        return { ok: false, failure: 'INVALID_URL', detail: 'bad redirect location', chain };
      }
      continue;
    }
    // Platforms whose fetch follows redirects internally (React Native) only report the final
    // URL: it is validated and authorized like a hop (intermediate hops cannot be inspected).
    const reported = (res as { url?: string }).url;
    if (reported && reported !== href) {
      const final = validateUrl(reported);
      if (!final.ok) return { ...final, chain: [...chain, reported] };
      const dns = await checkDns(final.url.hostname, deps);
      if (dns && !dns.ok) return { ...dns, chain: [...chain, reported] };
      chain.push(final.url.href);
      const reason = deps.authorizeHop ? await deps.authorizeHop(final.url.href) : null;
      if (reason) return { ok: false, failure: 'REDIRECT_BLOCKED', detail: reason, chain };
      href = final.url.href;
    }
    if (!res.ok) {
      return {
        ok: false,
        failure: 'HTTP_ERROR',
        detail: `HTTP ${res.status}`,
        status: res.status,
        chain,
      };
    }
    const contentType = res.headers.get('content-type') ?? '';
    const bytes = await readCapped(res, limits.maxBytes);
    if (bytes === 'too_large')
      return { ok: false, failure: 'TOO_LARGE', detail: `> ${limits.maxBytes} bytes`, chain };
    const kind = contentKind(contentType, bytes);
    if (!kind || !limits.allowedTypes.includes(kind)) {
      return {
        ok: false,
        failure: 'CONTENT_TYPE_NOT_ALLOWED',
        detail: contentType || 'unknown',
        chain,
      };
    }
    return {
      ok: true,
      response: { status: res.status, finalUrl: href, chain, contentType, kind, bytes },
    };
  }
  return {
    ok: false,
    failure: 'REDIRECT_LIMIT',
    detail: `> ${limits.maxRedirects} redirects`,
    chain,
  };
}
