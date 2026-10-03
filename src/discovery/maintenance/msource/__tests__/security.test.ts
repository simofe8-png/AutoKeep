import { fixtureSystem } from '../../registry/testing';
import {
  decideDiscovery,
  decideExtraction,
  decideFetch,
  decideStorage,
  hasAiReservation,
} from '../accessEngine';
import { safeEvent } from '../log';
import { guardedFetch, isPrivateAddress, validateUrl } from '../netGuard';
import { robotsVerdict } from '../robots';
import { ALLOW_ALL, FakeWeb, fakeAccess, fakeResponse } from '../testing';

describe('SSRF: URL validation', () => {
  it.each([
    ['http://example-oem.com/manual.pdf', 'SCHEME_NOT_ALLOWED'],
    ['file:///etc/passwd', 'SCHEME_NOT_ALLOWED'],
    ['ftp://example-oem.com/x', 'SCHEME_NOT_ALLOWED'],
    ['https://user:pw@example-oem.com/x', 'CREDENTIALS_IN_URL'],
    ['https://example-oem.com:8443/x', 'PORT_NOT_ALLOWED'],
    ['https://localhost/x', 'INTERNAL_HOSTNAME'],
    ['https://printer.local/x', 'INTERNAL_HOSTNAME'],
    ['https://metadata.internal/x', 'INTERNAL_HOSTNAME'],
    ['https://intranet/x', 'INTERNAL_HOSTNAME'],
    ['https://127.0.0.1/x', 'PRIVATE_ADDRESS'],
    ['https://127.1/x', 'PRIVATE_ADDRESS'],
    ['https://2130706433/x', 'PRIVATE_ADDRESS'],
    ['https://0x7f000001/x', 'PRIVATE_ADDRESS'],
    ['https://0177.0.0.1/x', 'PRIVATE_ADDRESS'],
    ['https://10.0.0.5/x', 'PRIVATE_ADDRESS'],
    ['https://172.16.3.4/x', 'PRIVATE_ADDRESS'],
    ['https://192.168.1.1/x', 'PRIVATE_ADDRESS'],
    ['https://169.254.169.254/latest/meta-data', 'PRIVATE_ADDRESS'],
    ['https://100.64.0.1/x', 'PRIVATE_ADDRESS'],
    ['https://0.0.0.0/x', 'PRIVATE_ADDRESS'],
    ['https://[::1]/x', 'PRIVATE_ADDRESS'],
    ['https://[::ffff:127.0.0.1]/x', 'PRIVATE_ADDRESS'],
    ['https://[fd00::1]/x', 'PRIVATE_ADDRESS'],
    ['https://[fe80::1]/x', 'PRIVATE_ADDRESS'],
    ['https://8.8.8.8/x', 'INTERNAL_HOSTNAME'],
    ['not a url', 'INVALID_URL'],
  ])('%s → %s', (url, failure) => {
    const r = validateUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe(failure);
  });

  it('accepts a public https hostname and drops the fragment', () => {
    const r = validateUrl('https://www.example-oem.com/manuals/fiesta.pdf#page=3');
    expect(r.ok && r.url.href).toBe('https://www.example-oem.com/manuals/fiesta.pdf');
  });

  it('private address classification (v4, v6, mapped, NAT64)', () => {
    expect(isPrivateAddress('192.168.0.1')).toBe(true);
    expect(isPrivateAddress('93.184.216.34')).toBe(false);
    expect(isPrivateAddress('::ffff:10.1.2.3')).toBe(true);
    expect(isPrivateAddress('64:ff9b::7f00:1')).toBe(true);
    expect(isPrivateAddress('2606:4700::6810:84e5')).toBe(false);
  });
});

describe('SSRF: guarded fetch', () => {
  const pdf = new TextEncoder().encode('%PDF-1.4\n');

  it('re-validates every redirect hop: a redirect to a private address is refused', async () => {
    const web = new FakeWeb({
      'https://docs.example-oem.com/a.pdf': { status: 302, location: 'https://169.254.169.254/x' },
    });
    const r = await guardedFetch('https://docs.example-oem.com/a.pdf', web.net());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe('PRIVATE_ADDRESS');
    expect(web.requested).toEqual(['https://docs.example-oem.com/a.pdf']);
  });

  it('a DNS answer with a private address is refused before any request (rebinding)', async () => {
    const web = new FakeWeb({
      'https://evil.example-oem.com/a.pdf': { body: pdf, contentType: 'application/pdf' },
    });
    const r = await guardedFetch(
      'https://evil.example-oem.com/a.pdf',
      web.net({ resolve: async () => ['93.184.216.34', '127.0.0.1'] }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure).toBe('PRIVATE_ADDRESS');
    expect(web.requested).toEqual([]);
  });

  it('platforms that follow redirects internally: the reported final URL is re-checked', async () => {
    const internal = (async () =>
      Object.assign(fakeResponse(200, 'application/pdf', pdf), {
        url: 'https://10.0.0.7/internal.pdf',
      })) as unknown as typeof fetch;
    const r = await guardedFetch('https://docs.example-oem.com/a.pdf', {
      fetch: internal,
      userAgent: 't',
    });
    expect(!r.ok && r.failure).toBe('PRIVATE_ADDRESS');
    const blockedHop = (async () =>
      Object.assign(fakeResponse(200, 'application/pdf', pdf), {
        url: 'https://other.example-oem.com/b.pdf',
      })) as unknown as typeof fetch;
    const r2 = await guardedFetch('https://docs.example-oem.com/a.pdf', {
      fetch: blockedHop,
      userAgent: 't',
      authorizeHop: async () => 'BLOCKED robots_disallows',
    });
    expect(!r2.ok && r2.failure).toBe('REDIRECT_BLOCKED');
  });

  it('redirects are authorized per hop and bounded', async () => {
    const pages: Record<string, { status: number; location: string }> = {};
    for (let i = 0; i < 8; i += 1) {
      pages[`https://loop.example-oem.com/${i}`] = {
        status: 301,
        location: `https://loop.example-oem.com/${i + 1}`,
      };
    }
    const web = new FakeWeb(pages);
    const r = await guardedFetch('https://loop.example-oem.com/0', web.net());
    expect(!r.ok && r.failure).toBe('REDIRECT_LIMIT');
    const blocked = await guardedFetch(
      'https://loop.example-oem.com/0',
      web.net({ authorizeHop: async () => 'BLOCKED robots_disallows' }),
    );
    expect(!blocked.ok && blocked.failure).toBe('REDIRECT_BLOCKED');
  });

  it('content type and size limits; declared PDF without PDF bytes is refused', async () => {
    const web = new FakeWeb({
      'https://x.example-oem.com/img': {
        contentType: 'image/png',
        body: new Uint8Array([137, 80, 78, 71]),
      },
      'https://x.example-oem.com/fake.pdf': {
        contentType: 'application/pdf',
        body: '<html>gotcha</html>',
      },
      'https://x.example-oem.com/big.pdf': {
        contentType: 'application/pdf',
        body: new Uint8Array(2048).fill(37),
      },
      'https://x.example-oem.com/exe': { contentType: 'application/octet-stream', body: 'MZ....' },
    });
    const limits = {
      timeoutMs: 1000,
      maxBytes: 1024,
      maxRedirects: 2,
      retries: 0,
      allowedTypes: ['pdf', 'html'] as const,
    };
    const kind = async (u: string) => {
      const r = await guardedFetch(u, web.net(), {
        ...limits,
        allowedTypes: [...limits.allowedTypes],
      });
      return r.ok ? r.response.kind : r.failure;
    };
    expect(await kind('https://x.example-oem.com/img')).toBe('CONTENT_TYPE_NOT_ALLOWED');
    expect(await kind('https://x.example-oem.com/fake.pdf')).toBe('CONTENT_TYPE_NOT_ALLOWED');
    expect(await kind('https://x.example-oem.com/big.pdf')).toBe('TOO_LARGE');
    expect(await kind('https://x.example-oem.com/exe')).toBe('CONTENT_TYPE_NOT_ALLOWED');
  });

  it('bounded retries on transient errors; a timeout is reported, not thrown', async () => {
    let calls = 0;
    const flaky = (async () => {
      calls += 1;
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const r = await guardedFetch('https://x.example-oem.com/a', {
      fetch: flaky,
      userAgent: 't',
      sleep: async () => undefined,
    });
    expect(!r.ok && r.failure).toBe('NETWORK_ERROR');
    expect(calls).toBe(3);
  });
});

describe('robots.txt (RFC 9309)', () => {
  const robots = [
    'User-agent: Googlebot',
    'User-agent: *',
    'Disallow: /private/',
    'Allow: /private/manuals/',
    '',
    'User-agent: AutoKeepBot',
    'Disallow: /forbidden-to-us/',
  ].join('\n');

  it('a group naming our token applies instead of *', () => {
    expect(robotsVerdict(robots, 'AutoKeepBot', '/private/x').allowed).toBe(true);
    expect(robotsVerdict(robots, 'AutoKeepBot', '/forbidden-to-us/a.pdf')).toMatchObject({
      allowed: false,
      group: 'autokeepbot',
    });
  });

  it('multi-agent groups, longest match, Allow wins ties, wildcards and $', () => {
    expect(robotsVerdict(robots, 'OtherBot', '/private/x').allowed).toBe(false);
    expect(robotsVerdict(robots, 'OtherBot', '/private/manuals/a.pdf').allowed).toBe(true);
    const w = 'User-agent: *\nDisallow: /*.pdf$\n';
    expect(robotsVerdict(w, 'x', '/a/b.pdf').allowed).toBe(false);
    expect(robotsVerdict(w, 'x', '/a/b.pdf?x=1').allowed).toBe(true);
  });
});

describe('access engine: one explicit decision per operation', () => {
  const web = new FakeWeb({
    'https://open.example-oem.com/robots.txt': { contentType: 'text/plain', body: ALLOW_ALL },
    'https://closed.example-oem.com/robots.txt': {
      contentType: 'text/plain',
      body: 'User-agent: *\nDisallow: /\n',
    },
    'https://soft.example-oem.com/robots.txt': {
      contentType: 'text/html',
      body: '<html>Welcome</html>',
    },
  });

  it('DISCOVERY records metadata only and makes no request', () => {
    const ctx = fakeAccess(web);
    const d = decideDiscovery('https://closed.example-oem.com/manual.pdf', ctx);
    expect(d).toMatchObject({ operation: 'DISCOVERY', status: 'ALLOWED', reason: 'metadata_only' });
    expect(decideDiscovery('https://127.0.0.1/x', ctx).status).toBe('BLOCKED');
  });

  it('FETCH follows RFC 9309: Disallow blocks; Allow / no rule / unavailable allow; unreachable blocks', async () => {
    const rfc = new FakeWeb({
      'https://open.example-oem.com/robots.txt': { contentType: 'text/plain', body: ALLOW_ALL },
      'https://closed.example-oem.com/robots.txt': {
        contentType: 'text/plain',
        body: 'User-agent: *\nDisallow: /\n',
      },
      'https://other.example-oem.com/robots.txt': {
        contentType: 'text/plain',
        body: 'User-agent: SomeOtherBot\nDisallow: /\n',
      },
      'https://norule.example-oem.com/robots.txt': {
        contentType: 'text/plain',
        body: 'User-agent: *\nDisallow: /cart\n',
      },
      'https://soft.example-oem.com/robots.txt': {
        contentType: 'text/html',
        body: '<html>Welcome</html>',
      },
      'https://gone.example-oem.com/robots.txt': { status: 403, body: 'no' },
      'https://down.example-oem.com/robots.txt': { status: 503, body: 'down' },
      'https://busy.example-oem.com/robots.txt': { status: 429, body: 'slow down' },
    });
    const ctx = fakeAccess(rfc);
    const f = (host: string, path = '/m.pdf') => decideFetch(`https://${host}${path}`, ctx);
    const allowed = await f('open.example-oem.com');
    expect(allowed).toMatchObject({
      status: 'ALLOWED',
      reason: 'robots_allows',
      policyVersion: 'msource-access/2',
    });
    expect(allowed.evidence[0]).toMatchObject({
      kind: 'robots',
      ref: 'https://open.example-oem.com/robots.txt',
    });
    expect(allowed.decidedAt).toMatch(/^2026-10-02T/);
    // Explicit matching Disallow → BLOCKED.
    expect(await f('closed.example-oem.com')).toMatchObject({
      status: 'BLOCKED',
      reason: 'robots_disallows',
    });
    // No group for our token and no "*" group → no robots rule applies.
    expect(await f('other.example-oem.com')).toMatchObject({
      status: 'ALLOWED',
      reason: 'robots_no_matching_rule',
    });
    // A matching group without an applicable Disallow → allowed; a matching Disallow → blocked.
    expect((await f('norule.example-oem.com')).reason).toBe('robots_no_matching_rule');
    expect((await f('norule.example-oem.com', '/cart/x')).status).toBe('BLOCKED');
    // A served non-robots page yields no rules.
    expect((await f('soft.example-oem.com')).status).toBe('ALLOWED');
    // 4xx (missing / forbidden robots.txt) = unavailable → robots does not block.
    expect(await f('missing.example-oem.com')).toMatchObject({
      status: 'ALLOWED',
      reason: 'robots_unavailable',
    });
    expect((await f('gone.example-oem.com')).status).toBe('ALLOWED');
    // 5xx / 429 = unreachable → blocked for now (retried on the next run).
    expect(await f('down.example-oem.com')).toMatchObject({
      status: 'BLOCKED',
      reason: 'robots_unreachable',
    });
    expect((await f('busy.example-oem.com')).reason).toBe('robots_unreachable');
    // Network failure = unreachable.
    const offline = fakeAccess(new FakeWeb({}));
    offline.net = {
      fetch: (async () => {
        throw new Error('ECONNRESET');
      }) as unknown as typeof fetch,
      userAgent: 't',
      sleep: async () => undefined,
    };
    expect((await decideFetch('https://x.example-oem.com/m.pdf', offline)).reason).toBe(
      'robots_unreachable',
    );
  });

  it('a recorded registry restriction overrides robots (REQUIRES_PERMISSION → MANUAL_ONLY)', async () => {
    const sys = fixtureSystem(
      { domains: [{ host: 'open.example-oem.com', role: 'documents' }] },
      'UNKNOWN',
      { automatedFetchAllowed: 'REQUIRES_PERMISSION' },
    );
    const ctx = { ...fakeAccess(web), registry: [sys] };
    const d = await decideFetch('https://open.example-oem.com/m.pdf', ctx);
    expect(d).toMatchObject({ status: 'MANUAL_ONLY', reason: 'registry_requires_permission' });
    expect(web.requested.filter((u) => u.includes('open.example-oem.com/m.pdf'))).toEqual([]);
  });

  it('EXTRACTION needs a permitted fetch (or a user document); "noai" reservations block it', async () => {
    const ctx = fakeAccess(web);
    const fetch = await decideFetch('https://open.example-oem.com/m.html', ctx);
    expect(decideExtraction({ url: 'x', upload: false, fetch: null }, ctx).status).toBe('BLOCKED');
    expect(decideExtraction({ url: 'upload:1', upload: true, fetch: null }, ctx).reason).toBe(
      'user_provided',
    );
    expect(decideExtraction({ url: fetch.url, upload: false, fetch }, ctx).status).toBe('ALLOWED');
    const html = '<meta name="robots" content="noindex, noai">';
    expect(hasAiReservation(html)).toBe(true);
    expect(hasAiReservation('<meta name="robots" content="max-snippet:-1">')).toBe(false);
    expect(decideExtraction({ url: fetch.url, upload: false, fetch, html }, ctx)).toMatchObject({
      status: 'BLOCKED',
      reason: 'machine_readable_reservation',
    });
  });

  it('STORAGE of document bytes is UNKNOWN without a recorded permission (bytes discarded)', () => {
    const ctx = fakeAccess(web);
    expect(
      decideStorage({ url: 'https://open.example-oem.com/m.pdf', upload: false }, ctx),
    ).toMatchObject({
      status: 'UNKNOWN',
      reason: 'no_storage_permission',
    });
    expect(decideStorage({ url: 'upload:1', upload: true }, ctx).status).toBe('ALLOWED');
  });
});

describe('observability: no secrets / VIN in log detail', () => {
  it('redacts a VIN and bounds the detail', () => {
    const e = safeEvent({
      runId: 'r',
      stage: 'ACQUISITION',
      status: 'failed',
      detail: `VIN VSSZZZ6JZCR122118 ${'x'.repeat(400)}`,
    });
    expect(e.detail).not.toContain('VSSZZZ6JZCR1');
    expect(e.detail!.length).toBeLessThanOrEqual(200);
  });
});
