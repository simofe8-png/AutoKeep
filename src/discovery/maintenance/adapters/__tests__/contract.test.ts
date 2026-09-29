import { fixtureSystem } from '../../registry/testing';
import type { Http, HttpResponse, VehicleIdentity } from '../../types';
import { ADAPTERS, adapterFor, failureOfBlock, runAdapter } from '..';
import { ADAPTER_FAILURE_CODES, type AdapterResult } from '../types';

/** Adapter contract (M-SOURCE Step 6) — SYNTHETIC hosts only. */
const enc = (s: string) => new TextEncoder().encode(s);
function web(pages: Record<string, { body: string; status?: number; type?: string }>) {
  const calls: string[] = [];
  const http: Http = async (url) => {
    calls.push(url);
    const p = pages[url];
    const r: HttpResponse = p
      ? {
          ok: (p.status ?? 200) < 400,
          status: p.status ?? 200,
          url,
          contentType: p.type ?? 'text/html',
          bytes: enc(p.body),
        }
      : { ok: false, status: 404, url, contentType: 'text/plain', bytes: enc('') };
    return r;
  };
  return { http, calls };
}
const ROBOTS = { 'https://synthetic.example/robots.txt': { body: '', type: 'text/plain' } };
const v: VehicleIdentity = {
  kind: 'car',
  make: 'Synthmoto',
  model: 'SX 125',
  modelYear: 2021,
  displacementCc: 125,
  market: 'IL',
};
const ctx = (http: Http, registry = [fixtureSystem()]) => ({
  http,
  registry,
  aliases: {},
  robots: new Map<string, string | null>(),
});

const valid = (r: AdapterResult) => {
  if (r.status === 'documents') {
    for (const d of r.documents) {
      expect(d.url).toMatch(/^https:\/\//);
      expect(['exact', 'variant', 'unstated']).toContain(d.modelMatch);
    }
  } else {
    expect(ADAPTER_FAILURE_CODES).toContain(r.failure);
    expect(r.detail).toBeTruthy();
  }
};

describe('policy gate: no adapter touches a source its policy does not allow', () => {
  it.each([
    ['UNKNOWN', 'POLICY_UNKNOWN'],
    ['REQUIRES_PERMISSION', 'PERMISSION_REQUIRED'],
    ['NOT_ALLOWED', 'TERMS_OR_RIGHTS_BLOCK'],
  ] as const)('discovery %s → %s, zero network', async (value, code) => {
    const { http, calls } = web({});
    const system = fixtureSystem({}, value);
    const { result } = await runAdapter(system, v, ctx(http, [system]));
    valid(result);
    expect(result).toMatchObject({ status: 'failed', failure: code });
    // An approved official system is offered to the user instead.
    expect(result.status === 'failed' && result.userAction?.url).toBe(
      'https://synthetic.example/manuals',
    );
    expect(calls).toEqual([]);
  });

  it('an unapproved (proposed) system is never offered to the user', async () => {
    const { http } = web({});
    const system = fixtureSystem({ status: 'proposed' });
    const { result } = await runAdapter(system, v, ctx(http, [system]));
    expect(result).toMatchObject({ status: 'failed', failure: 'PERMISSION_REQUIRED' });
    expect(result.status === 'failed' && result.userAction).toBeUndefined();
  });

  it('every block reason maps to exactly one standard code', () => {
    const reasons = [
      'not_registered',
      'registry_not_approved',
      'policy_not_allowed',
      'policy_unknown',
      'permission_required',
      'robots_disallow',
      'not_https',
      'http_error',
      'login_or_bot_wall',
      'too_large',
      'not_a_document',
      'network_error',
    ] as const;
    for (const r of reasons) expect(ADAPTER_FAILURE_CODES).toContain(failureOfBlock(r));
    expect(failureOfBlock('login_or_bot_wall')).toBe('AUTH_REQUIRED');
    expect(failureOfBlock('robots_disallow')).toBe('TERMS_OR_RIGHTS_BLOCK');
  });
});

describe('listing adapter', () => {
  it('returns the documents a listing names for this vehicle', async () => {
    const { http } = web({
      ...ROBOTS,
      'https://synthetic.example/manuals': {
        body: '<a href="/d/sx125-2020-2022.pdf">SX 125 (2020-2022)</a><a href="/d/sx250.pdf">SX 250</a>',
      },
    });
    const { adapterId, result } = await runAdapter(fixtureSystem(), v, ctx(http));
    expect(adapterId).toBe('listing');
    valid(result);
    expect(result).toMatchObject({
      status: 'documents',
      documents: [
        {
          url: 'https://synthetic.example/d/sx125-2020-2022.pdf',
          modelMatch: 'exact',
          statedYears: { from: 2020, to: 2022 },
        },
      ],
    });
  });

  it('model listed only for other years → MODEL_YEAR_NOT_LISTED; only another variant → MODEL_YEAR_NOT_LISTED with detail', async () => {
    const years = web({
      ...ROBOTS,
      'https://synthetic.example/manuals': { body: '<a href="/d/a.pdf">SX 125 (2014-2017)</a>' },
    });
    expect((await runAdapter(fixtureSystem(), v, ctx(years.http))).result).toMatchObject({
      failure: 'MODEL_YEAR_NOT_LISTED',
      detail: 'the model is listed, but not for this model year',
    });
    const nova = { ...v, model: 'Nova 14' };
    const variant = web({
      ...ROBOTS,
      'https://synthetic.example/manuals': { body: '<a href="/d/nova14evo.pdf">nova14evo</a>' },
    });
    const r = (await runAdapter(fixtureSystem(), nova, ctx(variant.http))).result;
    expect(r).toMatchObject({ failure: 'MODEL_YEAR_NOT_LISTED' });
    expect(r.status === 'failed' && r.detail).toMatch(/differently named model/);
  });

  it('JavaScript-only listing → SOURCE_UNAVAILABLE; 403 → AUTH_REQUIRED; 500 → SOURCE_UNAVAILABLE', async () => {
    const js = web({
      ...ROBOTS,
      'https://synthetic.example/manuals': { body: '<div id="app"></div>' },
    });
    expect((await runAdapter(fixtureSystem(), v, ctx(js.http))).result).toMatchObject({
      failure: 'SOURCE_UNAVAILABLE',
    });
    const auth = web({ ...ROBOTS, 'https://synthetic.example/manuals': { body: '', status: 403 } });
    expect((await runAdapter(fixtureSystem(), v, ctx(auth.http))).result).toMatchObject({
      failure: 'AUTH_REQUIRED',
    });
    const down = web({ ...ROBOTS, 'https://synthetic.example/manuals': { body: '', status: 500 } });
    expect((await runAdapter(fixtureSystem(), v, ctx(down.http))).result).toMatchObject({
      failure: 'SOURCE_UNAVAILABLE',
    });
  });
});

describe('template, JSON API and restricted adapters', () => {
  it('template: gated on fetch; the document is built from the model name, so coverage is unstated', async () => {
    const system = fixtureSystem({
      discovery: {
        mechanism: 'url_template',
        entryPoints: [{ kind: 'template', url: 'https://synthetic.example/om/{modelSlug}.pdf' }],
      },
    });
    const { http, calls } = web(ROBOTS);
    const { adapterId, result } = await runAdapter(system, v, ctx(http, [system]));
    expect(adapterId).toBe('url-template');
    expect(result).toMatchObject({
      status: 'documents',
      documents: [{ url: 'https://synthetic.example/om/sx125.pdf', modelMatch: 'unstated' }],
    });
    expect(calls).toEqual(['https://synthetic.example/robots.txt']);
  });

  it('JSON API: exact model + year; another year → MODEL_YEAR_NOT_LISTED; not JSON → SOURCE_UNAVAILABLE', async () => {
    const system = fixtureSystem({
      discovery: {
        mechanism: 'public_json_api',
        entryPoints: [
          {
            kind: 'json_api',
            url: 'https://synthetic.example/api/manuals',
            items: 'data.items',
            model: 'name',
            year: 'year',
            document: 'pdf',
          },
        ],
      },
    });
    const api = (body: string) =>
      web({
        ...ROBOTS,
        'https://synthetic.example/api/manuals': { body, type: 'application/json' },
      }).http;
    const list = JSON.stringify({
      data: {
        items: [
          { name: 'SX 125', year: 2021, pdf: 'https://synthetic.example/sx-2021.pdf' },
          { name: 'SX 125', year: 2019, pdf: 'https://synthetic.example/sx-2019.pdf' },
        ],
      },
    });
    expect((await runAdapter(system, v, ctx(api(list), [system]))).result).toMatchObject({
      status: 'documents',
      documents: [
        { url: 'https://synthetic.example/sx-2021.pdf', statedYears: { from: 2021, to: 2021 } },
      ],
    });
    expect(
      (await runAdapter(system, { ...v, modelYear: 2024 }, ctx(api(list), [system]))).result,
    ).toMatchObject({ failure: 'MODEL_YEAR_NOT_LISTED' });
    expect((await runAdapter(system, v, ctx(api('<html>'), [system]))).result).toMatchObject({
      failure: 'SOURCE_UNAVAILABLE',
    });
  });

  it('restricted systems report their mechanism without any network', async () => {
    const { http, calls } = web({});
    const login = fixtureSystem({
      sourceType: 'D_RESTRICTED_OR_UNAVAILABLE',
      discovery: { mechanism: 'login', entryPoints: [] },
    });
    expect(adapterFor(login).id).toBe('restricted');
    expect((await runAdapter(login, v, ctx(http, [login]))).result).toMatchObject({
      failure: 'AUTH_REQUIRED',
    });
    const none = fixtureSystem({
      sourceType: 'D_RESTRICTED_OR_UNAVAILABLE',
      discovery: { mechanism: 'none', entryPoints: [] },
    });
    const r = (await runAdapter(none, v, ctx(http, [none]))).result;
    expect(r).toMatchObject({ failure: 'NO_DIGITAL_SOURCE' });
    expect(r.status === 'failed' && r.userAction).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('a publishing system without an entry point reports its real blocker, with zero network', async () => {
    const { http, calls } = web({});
    const bare = { discovery: { mechanism: 'public_json_api' as const, entryPoints: [] } };
    const proposed = fixtureSystem({ ...bare, status: 'proposed' });
    expect((await runAdapter(proposed, v, ctx(http, [proposed]))).result).toMatchObject({
      failure: 'PERMISSION_REQUIRED',
    });
    const unknown = fixtureSystem(bare, 'UNKNOWN');
    expect((await runAdapter(unknown, v, ctx(http, [unknown]))).result).toMatchObject({
      failure: 'POLICY_UNKNOWN',
    });
    expect(calls).toEqual([]);
  });

  it('an adapter error is contained as OTHER, never thrown', async () => {
    const boom: Http = async (url) => {
      if (url.endsWith('robots.txt'))
        return { ok: true, status: 200, url, contentType: 'text/plain', bytes: enc('') };
      throw new Error('boom');
    };
    const { result } = await runAdapter(fixtureSystem(), v, ctx(boom));
    valid(result);
    expect(result.status).toBe('failed');
    expect(Object.keys(ADAPTERS).sort()).toEqual([
      'json-manual-api',
      'listing',
      'restricted',
      'url-template',
    ]);
  });
});
