import { createHash } from 'crypto';

import {
  admitToCatalog,
  isPersonalDataFree,
  scopeKeyOf,
  type IsoDate,
  type KnowledgeEntry,
} from '@/domain';

import { computeRequirementDue } from '@/engine/requirements';

import { accessDecision } from '../access';
import type { SourceSystem } from '../registry/sourceSystem';
import { fixtureIsraeliSystem, fixtureSystem } from '../registry/testing';
import { findMaintenanceSections, profileDocument } from '../classify';
import { extractRequirements, ground, intervalFromColumns, sentenceInterval } from '../extract';
import { htmlTextReader, htmlToPages } from '../htmlText';
import { classifyFailures, runMaintenancePipeline } from '../pipeline';
import { linkNamesVehicle, namesModel, RegistryDiscovery, WebSearchDiscovery } from '../sources';
import type { DiscoveryContext, Http, HttpResponse, VehicleIdentity } from '../types';

/**
 * Universal maintenance pipeline — SYNTHETIC fixtures only (fictional make "Synthmoto" on the
 * fictional host synthetic.example). No real manufacturer fact appears in this file.
 */

const TODAY = '2026-09-29' as IsoDate;
const enc = (s: string) => new TextEncoder().encode(s);

function fakeHttp(pages: Record<string, { body: string; type?: string; status?: number }>) {
  const calls: string[] = [];
  const http: Http = async (url) => {
    calls.push(url);
    const p = pages[url];
    const res: HttpResponse = p
      ? {
          ok: (p.status ?? 200) < 400,
          status: p.status ?? 200,
          url,
          contentType: p.type ?? 'text/html',
          bytes: enc(p.body),
        }
      : { ok: false, status: 404, url, contentType: 'text/plain', bytes: enc('') };
    return res;
  };
  return { http, calls };
}

const entry = fixtureSystem;

const ctx = (http: Http, registry: SourceSystem[], extra: Partial<DiscoveryContext> = {}) => ({
  http,
  registry,
  aliases: {},
  robots: new Map<string, string | null>(),
  ...extra,
});

const vehicle: VehicleIdentity = {
  kind: 'motorcycle',
  make: 'Synthmoto',
  model: 'SX 125',
  modelYear: 2021,
  displacementCc: 125,
  powertrain: 'petrol',
  market: 'IL',
};

const SCHEDULE = `<html><body>
<h1>Synthmoto SX 125 Owner's Manual — model year 2020–2022</h1>
<p>For Europe.</p>
<h2>Periodic maintenance schedule</h2>
<table>
<tr><th>Item</th><th>km x 1000</th><th>10</th><th>20</th><th>30</th><th>40</th><th>50</th><th>60</th><th>70</th><th>80</th></tr>
<tr><td>Months</td><td></td><td>12</td><td>24</td><td>36</td><td>48</td><td>60</td><td>72</td><td>84</td><td>96</td></tr>
<tr><td>Engine oil</td><td></td><td>R</td><td>R</td><td>R</td><td>R</td><td>R</td><td>R</td><td>R</td><td>R</td></tr>
<tr><td>Spark plugs</td><td></td><td></td><td>I</td><td></td><td>R</td><td></td><td>I</td><td></td><td>R</td></tr>
<tr><td>Brake fluid</td><td></td><td>I</td><td>I</td><td>R</td><td>I</td><td></td><td>I</td><td>R</td><td></td></tr>
<tr><td>Mystery gadget</td><td></td><td>I</td><td>I</td><td>I</td><td>I</td><td>I</td><td>I</td><td>I</td><td>I</td></tr>
</table>
<p>Cabin air filter: replace every 15,000 km or 12 months, whichever comes first.</p>
</body></html>`;

const LISTING = `<html><body>
<a href="/docs/sx125-2020-2022.html">SX 125 (2020-2022) owner's manual</a>
<a href="/docs/sx250.html">SX 250 owner's manual</a>
</body></html>`;

describe('access policy: the activity’s own dimension AND robots.txt, else no automation', () => {
  it('never fetches an unregistered, unapproved or terms-restricted host', async () => {
    const { http, calls } = fakeHttp({});
    const url = 'https://synthetic.example/manuals';
    expect((await accessDecision('https://other.example/x.pdf', ctx(http, [entry()]))).ok).toBe(
      false,
    );
    for (const [over, reason] of [
      [{ status: 'proposed' as const }, 'registry_not_approved'],
      ['NOT_ALLOWED' as const, 'policy_not_allowed'],
      ['UNKNOWN' as const, 'policy_unknown'],
      ['REQUIRES_PERMISSION' as const, 'permission_required'],
    ] as const) {
      const system = typeof over === 'string' ? entry({}, over) : entry(over);
      const d = await accessDecision(url, ctx(http, [system]));
      expect(d).toMatchObject({ ok: false, blocked: { reason } });
    }
    expect(calls).toEqual([]); // not even robots.txt
    expect(await accessDecision('http://synthetic.example/x', ctx(http, [entry()]))).toMatchObject({
      ok: false,
      blocked: { reason: 'not_https' },
    });
  });

  it('respects robots.txt on a permitted host; proposed hosts only in evaluation mode', async () => {
    const { http } = fakeHttp({
      'https://synthetic.example/robots.txt': {
        body: 'User-agent: *\nDisallow: /private',
        type: 'text/plain',
      },
    });
    const c = ctx(http, [entry({ status: 'proposed' })], { assumeProposedApproved: true });
    expect((await accessDecision('https://synthetic.example/manuals', c)).ok).toBe(true);
    expect(await accessDecision('https://synthetic.example/private/a.pdf', c)).toMatchObject({
      ok: false,
      blocked: { reason: 'robots_disallow' },
    });
  });

  it('a restricted official host becomes a link the USER can open — never fetched', async () => {
    const { http, calls } = fakeHttp({});
    const out = await new RegistryDiscovery().discover(
      vehicle,
      ctx(http, [entry({}, 'NOT_ALLOWED')]),
    );
    expect(out.leads).toEqual([]);
    expect(out.userActions).toEqual([
      expect.objectContaining({
        url: 'https://synthetic.example/manuals',
        reason: 'policy_not_allowed',
      }),
    ]);
    expect(calls).toEqual([]);
  });
});

describe('discovery adapters', () => {
  it('model matching ignores separators and an optional displacement token', () => {
    expect(namesModel('/models/sx-125', vehicle)).toBe(true);
    expect(namesModel('/models/sx', vehicle)).toBe(true);
    expect(namesModel('/models/sx250', vehicle)).toBe(false);
    expect(linkNamesVehicle('SX 125 (2017-2019)', 'https://s.example/a.pdf', vehicle)).toBe(false);
    expect(linkNamesVehicle('SX 125 (2020-2022)', 'https://s.example/a.pdf', vehicle)).toBe(true);
  });

  it('no search provider is configured: an explicit note, never a silent success', async () => {
    const out = await new WebSearchDiscovery(null).discover(vehicle);
    expect(out.notes[0]).toMatch(/^provider_not_configured/);
  });
});

describe('deterministic extraction (tables + sentences)', () => {
  const pages = htmlToPages(SCHEDULE);
  const doc = {
    lead: {
      url: 'https://synthetic.example/docs/sx125-2020-2022.html',
      via: 'official_listing' as const,
      adapter: 't',
      title: "SX 125 (2020-2022) owner's manual",
    },
    url: 'u',
    finalUrl: 'https://synthetic.example/docs/sx125-2020-2022.html',
    host: 'synthetic.example',
    sha256: 'a'.repeat(64),
    format: 'html' as const,
    bytes: enc(SCHEDULE),
    system: entry(),
  };
  const profile = {
    type: 'owners_manual' as const,
    authority: 'manufacturer' as const,
    manufacturer: 'synthmoto',
    models: ['SX 125'],
    modelVariants: [],
    yearFrom: 2020,
    yearTo: 2022,
    engines: [],
    displacementsCc: [],
    powertrains: [],
    markets: ['EU'],
    marketBasis: 'document_text' as const,
    units: 'km' as const,
    regimes: [],
    hasSevereSchedule: false,
  };
  const sections = [{ page: 2, heading: 'Periodic maintenance schedule', score: 10 }];

  it('column math: regular repeats, an initial occurrence, irregular = null', () => {
    expect(intervalFromColumns([10, 20, 30])).toEqual({ every: 10, first: null });
    expect(intervalFromColumns([20, 60])).toEqual({ every: 40, first: 20 });
    // 10, 20, 40, 60: the repeats sit on multiples of 20 → laid out from zero after the first.
    expect(intervalFromColumns([10, 20, 40, 60])).toEqual({ every: 20, first: 10, zero: true });
    expect(intervalFromColumns([10, 30, 70])).toBeNull();
  });

  it('reads atomic requirements with km + months, per action, and skips what it cannot read', () => {
    const { extracted, skipped } = extractRequirements({
      doc,
      pages,
      sections,
      profile,
      vehicle,
      authoritative: true,
      today: TODAY,
    });
    const find = (task: string, action: string) =>
      extracted.find((e) => e.requirement.task === task && e.requirement.action === action)
        ?.requirement;
    expect(find('engine_oil', 'replacement')?.interval).toEqual({
      every: { value: 10000, unit: 'km' },
      first: null,
      everyMonths: 12,
      firstMonths: null,
      rule: 'whichever_first',
      repeats: true,
    });
    expect(find('spark_plugs', 'replacement')?.interval).toMatchObject({
      every: { value: 40000 },
      everyMonths: 48,
    });
    // I at 20/60 read together with R at 40/80: inspected (or replaced) every 20,000.
    expect(find('spark_plugs', 'inspection')?.interval).toMatchObject({
      every: { value: 20000 },
      first: null,
      everyMonths: 24,
    });
    // Brake fluid R at 30 and 70 → every 40,000, first 30,000; I is irregular → skipped.
    expect(find('brake_fluid', 'replacement')?.interval).toMatchObject({
      every: { value: 40000 },
      first: { value: 30000 },
    });
    expect(find('brake_fluid', 'inspection')).toBeUndefined();
    expect(skipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Brake fluid', reason: 'irregular I columns' }),
        expect.objectContaining({ label: 'Mystery gadget', reason: 'unrecognized item' }),
      ]),
    );
    const oil = find('engine_oil', 'replacement')!;
    expect(oil.evidence[0]).toMatchObject({ page: 2, documentSha256: 'a'.repeat(64) });
    expect(oil.applicability).toMatchObject({
      makes: ['synthmoto'],
      models: ['SX 125'],
      modelYears: { from: 2020, to: 2022 },
      markets: ['EU'],
    });
  });

  it('sentences: whichever-first and time-only; no verb or no "every" → nothing', () => {
    expect(
      sentenceInterval('Cabin air filter: replace every 15,000 km or 12 months')?.interval,
    ).toMatchObject({
      every: { value: 15000, unit: 'km' },
      everyMonths: 12,
      rule: 'whichever_first',
    });
    expect(sentenceInterval('Brake fluid: replace every 2 years')?.interval).toMatchObject({
      everyMonths: 24,
      rule: 'time_only',
    });
    expect(sentenceInterval('Brake fluid 2 years')).toBeNull();
    expect(sentenceInterval('Check the brake fluid level')).toBeNull();
  });

  it('grounding: a value not found on the cited page is never verified', () => {
    const { extracted } = extractRequirements({
      doc,
      pages,
      sections,
      profile,
      vehicle,
      authoritative: true,
      today: TODAY,
    });
    const e = extracted[0];
    expect(ground(e, pages)).toBe(true);
    expect(e.requirement.extraction.grounded).toBe(true);
    const forged = { ...e, groundTokens: [...e.groundTokens, '99999'] };
    expect(ground(forged, pages)).toBe(false);
    expect(forged.requirement.verification).toBe('candidate');
  });
});

describe('interval-column tables ("Every N km / M months"), notes and footnotes', () => {
  const EVERY_TABLE = `<h1>Synthmoto SX 125 owner's manual, model year 2021</h1>
<h2>Periodical maintenance schedule</h2>
<table>
<tr><th>Item</th><th>NEW 300km</th><th>Every 1,000km</th><th>Every 5,000km</th><th>Every 10,000km</th></tr>
<tr><td>Interval</td><td>NEW</td><td>1 Month</td><td>3 Months</td><td>6 Months</td></tr>
<tr><td>Engine oil</td><td>R</td><td></td><td></td><td>Replacement for every 3000km (3 Months)</td></tr>
<tr><td>Spark plug</td><td>I</td><td>I</td><td>I</td><td>R</td></tr>
<tr><td>Air cleaner element</td><td></td><td>I</td><td>C</td><td>R</td></tr>
<tr><td>Brake fluid</td><td></td><td></td><td></td><td>Replace for every 30,000km</td></tr>
<tr><td>Check transmission for leakage</td><td>I</td><td>I</td><td></td><td></td></tr>
</table>
<p>Replace brake fluid every 2 years / 30,000km.</p>
<p>Clean the brake caliper every 10,000km if necessary.</p>`;
  const pages = htmlToPages(EVERY_TABLE);
  const doc = {
    lead: { url: 'u', via: 'official_listing' as const, adapter: 't', title: 'SX 125 2021' },
    url: 'u',
    finalUrl: 'u',
    host: 'synthetic.example',
    sha256: 'b'.repeat(64),
    format: 'html' as const,
    bytes: enc(EVERY_TABLE),
    system: entry(),
  };
  const run = () => {
    const profile = profileDocument(doc, pages, vehicle);
    return extractRequirements({
      doc,
      pages,
      sections: findMaintenanceSections(pages),
      profile,
      vehicle,
      authoritative: true,
      today: TODAY,
    });
  };

  it('reads each mark as the interval of its column; NEW = a first point; ambiguity skipped', () => {
    const { extracted, skipped } = run();
    const get = (task: string, action: string) =>
      extracted.find((e) => e.requirement.task === task && e.requirement.action === action)
        ?.requirement.interval;
    // R at NEW + "Replacement for every 3000km (3 Months)" = first at 300, then every 3000 from 0.
    expect(get('engine_oil', 'replacement')).toMatchObject({
      every: { value: 3000 },
      first: { value: 300 },
      everyMonths: 3,
      anchor: 'zero',
    });
    expect(get('spark_plugs', 'replacement')).toMatchObject({
      every: { value: 10000 },
      everyMonths: 6,
    });
    // "I" under two "every" columns: which one applies is not stated → never guessed.
    expect(get('spark_plugs', 'inspection')).toBeUndefined();
    expect(skipped).toContainEqual(
      expect.objectContaining({ label: 'Spark plug', reason: 'I in several "every" columns' }),
    );
    expect(get('air_filter', 'other')).toMatchObject({ every: { value: 5000 }, everyMonths: 3 });
    // Table note "every 30,000km" + footnote "every 2 years / 30,000km" = one obligation.
    expect(extracted.filter((e) => e.requirement.task === 'brake_fluid')).toHaveLength(1);
    expect(get('brake_fluid', 'replacement')).toMatchObject({
      every: { value: 30000 },
      everyMonths: 24,
      rule: 'whichever_first',
    });
    // "if necessary" is conditional, and a leak check is not the fluid's service.
    expect(extracted.some((e) => e.requirement.task === 'brake_system')).toBe(false);
    expect(extracted.some((e) => e.requirement.task === 'transmission_fluid')).toBe(false);
    for (const e of extracted) expect(ground(e, pages)).toBe(true);
  });

  it('the due engine lays out "first, then every from zero" as the source states', () => {
    const { extracted } = run();
    const oil = extracted.find(
      (e) => e.requirement.task === 'engine_oil' && e.requirement.action === 'replacement',
    )!.requirement;
    const due = (km: number) =>
      computeRequirementDue({
        requirement: {
          ...oil,
          interval: { ...oil.interval, rule: 'distance_only', everyMonths: undefined },
        },
        today: TODAY,
        readings: [{ date: TODAY, km }],
      });
    expect(due(100)).toMatchObject({ nextKm: 300 });
    expect(due(1000)).toMatchObject({ nextKm: 3000 }); // not 3,300
    expect(due(6500)).toMatchObject({ nextKm: 9000 });
  });
});

describe('end-to-end pipeline (synthetic host)', () => {
  const site = {
    'https://synthetic.example/robots.txt': { body: 'User-agent: *\nAllow: /', type: 'text/plain' },
    'https://synthetic.example/manuals': { body: LISTING },
    'https://synthetic.example/docs/sx125-2020-2022.html': { body: SCHEDULE },
  };
  const sha256 = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
  const deps = (http: Http, catalog: KnowledgeEntry[], registry = [entry()]) => ({
    ...ctx(http, registry),
    sha256,
    readers: { pdf: htmlTextReader, html: htmlTextReader },
    adapters: [new RegistryDiscovery()],
    catalog,
    today: TODAY,
  });

  it('discovers, extracts, grounds and schedules at level B (EU manual, IL vehicle); then reuses', async () => {
    const { http } = fakeHttp(site);
    const r = await runMaintenancePipeline(vehicle, deps(http, []));
    expect(r.trace.documents).toHaveLength(1);
    expect(r.trace.documents[0]).toMatchObject({
      vehicleMatch: 'exact',
      registryStatus: 'approved',
    });
    const oil = r.resolutions.find((x) => x.task === 'engine_oil' && x.action === 'replacement')!;
    expect(oil).toMatchObject({ status: 'resolved', level: 'B' });
    expect(r.trace.failures).toEqual([]);
    expect(r.catalogCandidates.length).toBeGreaterThan(0);

    // Reusable knowledge: the next identical vehicle needs no research at all.
    const catalog = admitToCatalog([], r.catalogCandidates, TODAY).entries;
    const offline: Http = async () => {
      throw new Error('no network expected');
    };
    const again = await runMaintenancePipeline({ ...vehicle }, deps(offline, catalog));
    expect(again.trace.catalogHits).toBeGreaterThan(0);
    expect(again.trace.documents).toEqual([]);
    expect(again.resolutions.find((x) => x.task === 'engine_oil')).toMatchObject({ level: 'B' });
  });

  it('an importer document naming Israel outranks it for the same task only (level A)', async () => {
    const IL_DOC = SCHEDULE.replace('For Europe.', 'For Israel.').replace(
      '<tr><td>Engine oil</td><td></td><td>R</td><td>R</td><td>R</td><td>R</td><td>R</td><td>R</td><td>R</td><td>R</td></tr>',
      '<tr><td>Engine oil</td><td></td><td></td><td>R</td><td></td><td>R</td><td></td><td>R</td><td></td><td>R</td></tr>',
    );
    const { http } = fakeHttp({
      ...site,
      'https://il.synthetic.example/robots.txt': { body: '', type: 'text/plain' },
      'https://il.synthetic.example/list': {
        body: '<a href="/sx125-2020-2022.html">SX 125 2020-2022</a>',
      },
      'https://il.synthetic.example/sx125-2020-2022.html': { body: IL_DOC },
    });
    const registry = [entry(), fixtureIsraeliSystem()];
    const r = await runMaintenancePipeline(vehicle, deps(http, [], registry));
    const oil = r.resolutions.find((x) => x.task === 'engine_oil' && x.action === 'replacement')!;
    expect(oil).toMatchObject({ status: 'resolved', level: 'A', reason: 'market_override' });
    expect(oil.effective?.interval.every).toEqual({ value: 20000, unit: 'km' });
    // Identical obligations elsewhere agree; the per-task override replaced nothing else.
    const plugs = r.resolutions.find(
      (x) => x.task === 'spark_plugs' && x.action === 'replacement',
    )!;
    expect(plugs.level).toBe('A');
    expect(plugs.effective?.interval.every).toEqual({ value: 40000, unit: 'km' });
  });

  it('an Israeli direct maintenance schedule is used first; the global manual is then not read', async () => {
    const IL_DOC = SCHEDULE.replace('For Europe.', 'For Israel.');
    const { http, calls } = fakeHttp({
      ...site,
      'https://il.synthetic.example/robots.txt': { body: '', type: 'text/plain' },
      'https://il.synthetic.example/list': {
        body: '<a href="/sx125-2020-2022.html">SX 125 2020-2022</a>',
      },
      'https://il.synthetic.example/sx125-2020-2022.html': { body: IL_DOC },
    });
    const direct = fixtureIsraeliSystem({
      sourceType: 'A_DIRECT_MAINTENANCE_SCHEDULE',
      documentCategories: ['maintenance_schedule'],
    });
    const r = await runMaintenancePipeline(vehicle, deps(http, [], [entry(), direct]));
    expect(r.trace.documents.map((d) => d.sourceSystemId)).toEqual(['il-synthmoto']);
    expect(calls).not.toContain('https://synthetic.example/docs/sx125-2020-2022.html');
    const oil = r.resolutions.find((x) => x.task === 'engine_oil' && x.action === 'replacement')!;
    expect(oil).toMatchObject({ status: 'resolved', level: 'A' });
  });

  it('a document that never states its model years stays level C (coverage unknown)', async () => {
    const noYears = SCHEDULE.replace(' — model year 2020–2022', '');
    const { http } = fakeHttp({
      ...site,
      'https://synthetic.example/manuals': {
        body: '<a href="/docs/sx125.html">SX 125 owner\'s manual</a>',
      },
      'https://synthetic.example/docs/sx125.html': { body: noYears },
    });
    const r = await runMaintenancePipeline(vehicle, deps(http, []));
    const oil = r.resolutions.find((x) => x.task === 'engine_oil' && x.action === 'replacement')!;
    expect(oil.status).toBe('insufficient_information');
    expect(oil.considered[0]).toMatchObject({ level: 'C' });
    expect(r.trace.failures).toContainEqual({
      class: 'MODEL_YEAR_NOT_LISTED',
      detail: 'the document does not state its model years',
    });
  });

  it('classifies failures: unsupported manufacturer and access restriction', async () => {
    const { http } = fakeHttp({});
    const none = await runMaintenancePipeline({ ...vehicle, make: 'Nobody' }, deps(http, []));
    expect(none.trace.failures.map((f) => f.class)).toContain('NO_DIGITAL_SOURCE');
    const restricted = await runMaintenancePipeline(
      vehicle,
      deps(http, [], [entry({}, 'NOT_ALLOWED')]),
    );
    expect(restricted.trace.failures.map((f) => f.class)).toContain('TERMS_OR_RIGHTS_BLOCK');
    expect(restricted.trace.userActions).toHaveLength(1);
    expect(classifyFailures(restricted.trace, restricted.resolutions)).toEqual(
      restricted.trace.failures,
    );
  });
});

describe('reusable knowledge catalog', () => {
  const base = htmlToPages(SCHEDULE);
  void base;
  const req = (id: string, every: number, verified = true) => ({
    id,
    task: 'engine_oil' as const,
    action: 'replacement' as const,
    interval: {
      every: { value: every, unit: 'km' as const },
      rule: 'distance_only' as const,
      repeats: true,
    },
    applicability: { makes: ['synthmoto'], models: ['SX 125'], markets: ['EU'] },
    authority: 'manufacturer' as const,
    evidence: [
      {
        documentId: 'd',
        documentTitle: 't',
        authority: 'manufacturer' as const,
        markets: ['EU'],
        page: 1,
        documentSha256: 'x',
      },
    ],
    verification: verified ? ('verified' as const) : ('candidate' as const),
    extraction: { method: 'deterministic_parser' as const, by: 'test', at: TODAY, grounded: true },
  });
  const src = (host: string, sha: string) => ({
    url: `https://${host}/d`,
    host,
    sha256: sha,
    authority: 'manufacturer' as const,
    markets: ['EU'],
    retrievedAt: TODAY,
  });

  it('keys knowledge by vehicle class, never by plate/VIN/user', () => {
    const key = scopeKeyOf(req('a', 1).applicability);
    expect(key).toContain('synthmoto');
    expect(isPersonalDataFree(key)).toBe(true);
    expect(isPersonalDataFree('{"plate":"12-345-67"}')).toBe(false);
  });

  it('rejects unverified output, supersedes a new edition, records conflicts', () => {
    const a = admitToCatalog(
      [],
      [{ requirement: req('a', 10000), source: src('m.example', '1') }],
      TODAY,
    );
    expect(a.added).toEqual(['a']);
    expect(
      admitToCatalog(
        [],
        [{ requirement: req('e', 10000, false), source: src('m.example', '1') }],
        TODAY,
      ).rejected,
    ).toEqual([{ id: 'e', reason: 'not_verified' }]);
    const b = admitToCatalog(
      a.entries,
      [{ requirement: req('b', 12000), source: src('m.example', '2') }],
      TODAY,
    );
    expect(b.superseded).toEqual(['a']);
    expect(b.entries.find((e) => e.id === 'a')?.supersededBy).toBe('b');
    const c = admitToCatalog(
      b.entries,
      [{ requirement: req('c', 15000), source: src('other.example', '3') }],
      TODAY,
    );
    expect(c.conflicts).toEqual([['b', 'c']]);
  });
});
