import { buildFingerprint, type VehicleFingerprint } from '../fingerprint';
import {
  FableDiscoveryAdapter,
  KnownCandidatesAdapter,
  UploadDiscoveryAdapter,
  recordedResearch,
} from '../adapters';
import { makeCandidate } from '../candidates';
import { htmlTextReader } from '../../htmlText';
import { runMSource, type MSourceRun } from '../run';
import { scheduleToRequirements, nextService } from '../requirements';
import { terminalStatus } from '../status';
import { ALLOW_ALL, FakeWeb, fakeDeps } from '../testing';

/**
 * SYNTHETIC fixtures only: fictional publishers on example-* hosts; the vehicle facts are the
 * project's Fiesta acceptance vehicle, the intervals are invented test values (never presented
 * as real Ford data).
 */

const fp: VehicleFingerprint = (() => {
  const r = buildFingerprint({
    kind: 'car',
    manufacturer: 'פורד גרמניה',
    model: 'FIESTA',
    year: 2015,
    engine: '1242 סמ״ק',
    engineCode: 'SNJB',
    fuel: 'בנזין',
    transmission: 'ידני',
  });
  if (!r.ok) throw new Error('fixture');
  return r.fingerprint;
})();

const page = (title: string, body: string[]) =>
  `<html><head><title>${title}</title></head><body><h1>${title}</h1>${body
    .map((b) => `<p>${b}</p>`)
    .join('')}</body></html>`;

const ROBOTS = (host: string, text = ALLOW_ALL) => ({
  [`https://${host}/robots.txt`]: { contentType: 'text/plain', body: text },
});

const SCHEDULE_A = page('Ford Fiesta 2013-2017 1.25 maintenance schedule', [
  'Maintenance schedule for the Fiesta 1.25 Duratec petrol (engine code SNJB).',
  'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
  'Spark plugs: replace every 60,000 km or 72 months, whichever comes first.',
]);
const SCHEDULE_B = page('Ford Fiesta Mk7 (2013-2017) service intervals', [
  'Service intervals for the Fiesta 1.25 petrol.',
  'Engine oil: replace every 20,000 km or 12 months, whichever comes first.',
]);
const SCHEDULE_CONFLICT = page('Ford Fiesta Mk7 (2013-2017) service intervals', [
  'Service intervals for the Fiesta 1.25 petrol.',
  'Engine oil: replace every 15,000 km or 12 months, whichever comes first.',
]);
const WRONG_ENGINE = page('Ford Fiesta 2014-2017 maintenance schedule', [
  'Maintenance schedule for the Fiesta 1.0 EcoBoost and 1.6 Ti-VCT engines.',
  'Engine oil: replace every 16,000 km or 12 months, whichever comes first.',
]);

const candidate = (url: string, discoveredBy = 'catalog') =>
  makeCandidate({
    url,
    sourceType: 'independent_database',
    discoveredBy,
    discoveredAt: '2026-10-02T08:00:00Z',
  })!;

async function run(pages: ConstructorParameters<typeof FakeWeb>[0], urls: string[], over = {}) {
  const web = new FakeWeb(pages);
  const r = await runMSource(
    fp,
    fakeDeps(web, [new KnownCandidatesAdapter(urls.map((u) => candidate(u)))], over),
  );
  return { run: r, web };
}

const stage = (r: MSourceRun, s: string) => r.stages.find((x) => x.stage === s)!;

describe('M-SOURCE run: explicit stages, provenance end to end', () => {
  it('two agreeing independent HTML sources, one naming SNJB → EXACT, READY, provenance survives', async () => {
    const { run: r } = await run(
      {
        ...ROBOTS('www.example-garage.com'),
        ...ROBOTS('www.example-autodata.org'),
        'https://www.example-garage.com/fiesta': { body: SCHEDULE_A },
        'https://www.example-autodata.org/fiesta-mk7': { body: SCHEDULE_B },
      },
      ['https://www.example-garage.com/fiesta', 'https://www.example-autodata.org/fiesta-mk7'],
    );
    expect(r.stages.map((s) => s.stage)).toEqual([
      'VEHICLE_VERIFIED',
      'DISCOVERY',
      'SOURCE_CANDIDATES',
      'ACQUISITION',
      'EXTRACTION',
      'VEHICLE_MATCHING',
      'CROSS_SOURCE_VALIDATION',
      'SCHEDULE_RESOLUTION',
      'PERSISTENCE',
      'NEXT_SERVICE_CALCULATION',
    ]);
    const s = r.schedule!;
    expect(s.status).toBe('READY');
    const oil = s.items.find((i) => i.task === 'engine_oil')!;
    expect(oil).toMatchObject({
      intervalKm: 20000,
      intervalMonths: 12,
      rule: 'WHICHEVER_COMES_FIRST',
      // One source names the engine code (EXACT applicability) and 2 publishers agree.
      quality: 'EXACT',
      independentSources: 2,
      officialSources: 0,
    });
    // Spark plugs: ONE independent source that names the engine (EXACT applicability) →
    // SUPPORTED, never EXACT merely because it is the only source.
    expect(s.items.find((i) => i.task === 'spark_plugs')).toMatchObject({
      intervalKm: 60000,
      intervalMonths: 72,
      quality: 'SUPPORTED',
      independentSources: 1,
      applicability: 'EXACT',
    });
    // Provenance: every evidence record traces to an acquired source with access decisions.
    for (const id of oil.evidenceIds) {
      const ev = s.evidence.find((e) => e.id === id)!;
      const src = s.sources.find((x) => x.sourceId === ev.sourceId)!;
      expect(ev.grounded).toBe(true);
      expect(ev.originalText).toMatch(/Engine oil/);
      expect(src.contentSha256).toHaveLength(64);
      expect(src.access.map((a) => `${a.operation}:${a.status}`)).toEqual(
        expect.arrayContaining(['FETCH:ALLOWED', 'EXTRACTION:ALLOWED', 'STORAGE:UNKNOWN']),
      );
      expect(src.extractorVersion).toMatch(/^autokeep-extractor/);
      expect(src.statedApplicability).toMatchObject({ yearFrom: 2013, yearTo: 2017 });
    }
    // The first source names SNJB: EXACT applicability on that record.
    expect(s.evidence.some((e) => e.match.status === 'EXACT')).toBe(true);
    expect(terminalStatus(r, 'now')).toMatchObject({ state: 'READY', partial: false });
  });

  it('a resolved schedule drives mileage + time due dates (whichever comes first)', async () => {
    const { run: r } = await run(
      {
        ...ROBOTS('www.example-garage.com'),
        ...ROBOTS('www.example-autodata.org'),
        'https://www.example-garage.com/fiesta': { body: SCHEDULE_A },
        'https://www.example-autodata.org/fiesta-mk7': { body: SCHEDULE_B },
      },
      ['https://www.example-garage.com/fiesta', 'https://www.example-autodata.org/fiesta-mk7'],
    );
    const reqs = scheduleToRequirements(r.schedule!, fp, '2026-10-02' as never);
    expect(reqs.map((r) => r.task).sort()).toEqual(['engine_oil', 'spark_plugs']);
    expect(reqs.find((r) => r.task === 'spark_plugs')!.corroboration).toMatchObject({
      independentSources: 1,
      confidence: 'medium',
    });
    const oilReq = reqs.find((r) => r.task === 'engine_oil')!;
    expect(oilReq).toMatchObject({
      task: 'engine_oil',
      verification: 'verified',
      corroboration: { independentSources: 2, confidence: 'high' },
    });
    const n = nextService({
      requirements: [oilReq],
      today: '2026-10-02' as never,
      readings: [
        { date: '2026-04-01' as never, km: 90000 },
        { date: '2026-10-01' as never, km: 95000 },
      ],
      completions: { [oilReq.id]: { date: '2026-03-01' as never, odometerKm: 89000 } },
    });
    const due = n.next[0].due;
    expect(due).toMatchObject({ status: 'computed', nextKm: 109000, nextDate: '2027-03-01' });
  });

  it('conflicting equally-applicable sources stay CONFLICTING (never averaged)', async () => {
    const { run: r } = await run(
      {
        ...ROBOTS('www.example-autodata.org'),
        ...ROBOTS('www.example-service.net'),
        'https://www.example-autodata.org/fiesta-mk7': { body: SCHEDULE_B },
        'https://www.example-service.net/fiesta': { body: SCHEDULE_CONFLICT },
      },
      ['https://www.example-autodata.org/fiesta-mk7', 'https://www.example-service.net/fiesta'],
    );
    const s = r.schedule!;
    expect(s.status).toBe('CONFLICTING_EVIDENCE');
    const oil = s.unresolved.find((u) => u.task === 'engine_oil')!;
    expect(oil.quality).toBe('CONFLICTING');
    expect(oil.conflicts.map((c) => c.intervalKm).sort()).toEqual([15000, 20000]);
    expect(oil.intervalKm).toBeNull();
    expect(stage(r, 'CROSS_SOURCE_VALIDATION').failures[0].code).toBe('CONFLICTING_EVIDENCE');
    expect(terminalStatus(r, 'now')).toMatchObject({
      state: 'CONFLICTING_EVIDENCE',
      retryAvailable: true,
    });
  });

  it('exact engine mismatch: a schedule for other engines is NOT_APPLICABLE', async () => {
    const { run: r } = await run(
      {
        ...ROBOTS('www.example-garage.com'),
        ...ROBOTS('www.example-service.net'),
        'https://www.example-garage.com/fiesta-other': { body: WRONG_ENGINE },
        'https://www.example-service.net/fiesta-other': {
          body: WRONG_ENGINE.replace('Ford', 'The Ford'),
        },
      },
      [
        'https://www.example-garage.com/fiesta-other',
        'https://www.example-service.net/fiesta-other',
      ],
    );
    const s = r.schedule!;
    expect(s.items).toEqual([]);
    expect(s.evidence.every((e) => e.match.status === 'NOT_APPLICABLE')).toBe(true);
    expect(s.evidence[0].match.reasons.join(' ')).toMatch(/1000, 1600 cc — not 1242 cc/);
    expect(s.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(r.candidates.every((c) => c.outcome === 'not_applicable')).toBe(true);
  });

  it('robots: Disallow → never fetched; unreachable robots → not fetched now; 404 robots → fetched', async () => {
    const { run: r, web } = await run(
      {
        ...ROBOTS('www.example-garage.com', 'User-agent: *\nDisallow: /fiesta\n'),
        'https://www.example-garage.com/fiesta': { body: SCHEDULE_A },
        'https://www.example-down.com/robots.txt': { status: 503, body: 'down' },
        'https://www.example-down.com/fiesta': { body: SCHEDULE_A },
        'https://www.example-norobots.com/fiesta': { body: SCHEDULE_B },
      },
      [
        'https://www.example-garage.com/fiesta',
        'https://www.example-down.com/fiesta',
        'https://www.example-norobots.com/fiesta',
      ],
    );
    expect(web.requested).not.toContain('https://www.example-garage.com/fiesta');
    expect(web.requested).not.toContain('https://www.example-down.com/fiesta');
    expect(web.requested).toContain('https://www.example-norobots.com/fiesta');
    const by = (u: string) => r.candidates.find((c) => c.candidate.canonicalUrl === u)!;
    expect(by('https://www.example-garage.com/fiesta').failure?.code).toBe('ACCESS_BLOCKED');
    expect(by('https://www.example-down.com/fiesta').failure?.code).toBe(
      'ACCESS_TEMPORARILY_UNREACHABLE',
    );
    expect(by('https://www.example-norobots.com/fiesta').outcome).toBe('extracted');
  });

  it('login wall / 403 is detected and not bypassed; 404 tries an archived copy only then', async () => {
    const { run: r, web } = await run(
      {
        ...ROBOTS('www.example-garage.com'),
        ...ROBOTS('archive.org'),
        ...ROBOTS('web.archive.org'),
        'https://www.example-garage.com/members': {
          body: '<html><body>Please log in to continue</body></html>',
        },
        'https://www.example-garage.com/forbidden': { status: 403, body: 'no' },
        'https://www.example-garage.com/gone': { status: 404, body: 'gone' },
        [`https://archive.org/wayback/available?url=${encodeURIComponent('https://www.example-garage.com/gone')}`]:
          {
            contentType: 'application/json',
            body: JSON.stringify({
              archived_snapshots: {
                closest: {
                  available: true,
                  status: '200',
                  url: 'http://web.archive.org/web/20150101000000/https://www.example-garage.com/gone',
                },
              },
            }),
          },
        'https://web.archive.org/web/20150101000000id_/https://www.example-garage.com/gone': {
          body: SCHEDULE_A,
        },
      },
      [
        'https://www.example-garage.com/members',
        'https://www.example-garage.com/forbidden',
        'https://www.example-garage.com/gone',
      ],
      { archive: true },
    );
    const by = (u: string) => r.candidates.find((c) => c.candidate.canonicalUrl === u)!;
    expect(by('https://www.example-garage.com/members').failure?.code).toBe(
      'ACCESS_CONTROL_DETECTED',
    );
    expect(by('https://www.example-garage.com/forbidden').failure?.code).toBe(
      'ACCESS_CONTROL_DETECTED',
    );
    expect(by('https://www.example-garage.com/gone').failure?.code).toBe('SOURCE_GONE');
    // No archive lookup for the access-controlled pages.
    expect(web.requested.filter((u) => u.includes('wayback/available'))).toHaveLength(1);
    const archived = r.schedule!.sources.find((s) => s.archiveOf)!;
    expect(archived.archiveOf).toBe('https://www.example-garage.com/gone');
    expect(archived.finalUrl).toContain('web.archive.org/web/20150101000000id_/');
  });

  it('duplicate content at two URLs is read once and counts as one source', async () => {
    const { run: r } = await run(
      {
        ...ROBOTS('www.example-garage.com'),
        ...ROBOTS('mirror.example-garage.com'),
        'https://www.example-garage.com/fiesta': { body: SCHEDULE_A },
        'https://mirror.example-garage.com/fiesta': { body: SCHEDULE_A },
      },
      [
        'https://www.example-garage.com/fiesta',
        'https://mirror.example-garage.com/fiesta?utm_source=x',
      ],
    );
    expect(r.candidates.map((c) => c.outcome).sort()).toEqual(['duplicate', 'extracted']);
    // Two copies of one page are ONE source: never raised by its own copy.
    expect(r.schedule!.items.find((i) => i.task === 'engine_oil')).toMatchObject({
      independentSources: 1,
      quality: 'SUPPORTED',
    });
  });

  it('malformed PDF and unsupported files fail per source without stopping the run', async () => {
    const { run: r } = await run(
      {
        ...ROBOTS('www.example-garage.com'),
        'https://www.example-garage.com/broken.pdf': {
          contentType: 'application/pdf',
          body: '%PDF-1.4 garbage',
        },
        'https://www.example-garage.com/photo.png': {
          contentType: 'image/png',
          body: new Uint8Array([137, 80, 78, 71]),
        },
      },
      ['https://www.example-garage.com/broken.pdf', 'https://www.example-garage.com/photo.png'],
      {
        readers: {
          html: htmlTextReader,
          pdf: { read: async () => Promise.reject(new Error('Invalid PDF structure')) },
        },
      },
    );
    expect(r.candidates.map((c) => c.failure?.code).sort()).toEqual([
      'MALFORMED_DOCUMENT',
      'UNSUPPORTED_FORMAT',
    ]);
    expect(r.schedule!.status).toBe('NO_SOURCE_FOUND');
  });

  it('no source at all → NO_SOURCE_FOUND with retry and upload offered', async () => {
    const web = new FakeWeb({});
    const r = await runMSource(fp, fakeDeps(web, [new KnownCandidatesAdapter([])]));
    expect(stage(r, 'SOURCE_CANDIDATES').failures[0].code).toBe('NO_CANDIDATES');
    expect(terminalStatus(r, 'now')).toMatchObject({
      state: 'NO_SOURCE_FOUND',
      retryAvailable: true,
      uploadDocumentAvailable: true,
    });
  });

  it('a Fable-discovered source flows through full validation; its snippet is never evidence', async () => {
    const research = {
      assistant: 'fable',
      candidates: [
        {
          url: 'https://www.example-garage.com/fiesta',
          title: 'Fiesta maintenance',
          sourceType: 'independent_database',
          documentFormat: 'html',
          searchSnippet: 'Fiesta 1.25 timing belt every 999,999 km',
        },
        {
          url: 'https://www.example-autodata.org/fiesta-mk7',
          sourceType: 'publication',
          documentFormat: 'html',
          searchSnippet: 'oil every 20,000 km',
        },
        { url: 'javascript:alert(1)', sourceType: 'other', documentFormat: 'html' },
        {
          url: 'https://paywalled.example-data.com/fiesta',
          sourceType: 'other',
          documentFormat: 'html',
        },
      ],
      restrictedSeen: [{ url: 'https://paywalled.example-data.com/fiesta', reason: 'paywall' }],
    };
    const web = new FakeWeb({
      ...ROBOTS('www.example-garage.com'),
      ...ROBOTS('www.example-autodata.org'),
      'https://www.example-garage.com/fiesta': { body: SCHEDULE_A },
      'https://www.example-autodata.org/fiesta-mk7': { body: SCHEDULE_B },
    });
    const r = await runMSource(
      fp,
      fakeDeps(web, [new FableDiscoveryAdapter(recordedResearch('recorded-fable-run', research))]),
    );
    expect(r.candidates.every((c) => c.candidate.discoveredBy === 'fable')).toBe(true);
    expect(r.restricted).toEqual([
      { url: 'https://paywalled.example-data.com/fiesta', reason: 'paywall', adapter: 'fable' },
    ]);
    expect(web.requested.some((u) => u.includes('paywalled'))).toBe(false);
    const s = r.schedule!;
    expect(s.items.map((i) => [i.task, i.intervalKm, i.quality])).toEqual([
      ['engine_oil', 20000, 'EXACT'],
      ['spark_plugs', 60000, 'SUPPORTED'],
    ]);
    // The snippet's "timing belt every 999,999 km" exists nowhere in the evidence.
    expect(JSON.stringify(s.evidence)).not.toContain('999');
    expect(s.items.some((i) => i.task === 'timing_belt')).toBe(false);
  });

  it('the Fable adapter being unavailable is visible and not a single point of failure', async () => {
    const web = new FakeWeb({
      ...ROBOTS('www.example-garage.com'),
      ...ROBOTS('www.example-autodata.org'),
      'https://www.example-garage.com/fiesta': { body: SCHEDULE_A },
      'https://www.example-autodata.org/fiesta-mk7': { body: SCHEDULE_B },
    });
    const r = await runMSource(
      fp,
      fakeDeps(web, [
        new FableDiscoveryAdapter(null),
        new KnownCandidatesAdapter([
          candidate('https://www.example-garage.com/fiesta'),
          candidate('https://www.example-autodata.org/fiesta-mk7'),
        ]),
      ]),
    );
    expect(stage(r, 'DISCOVERY').failures).toEqual([
      expect.objectContaining({ code: 'ADAPTER_UNAVAILABLE', adapter: 'fable' }),
    ]);
    expect(r.schedule!.status).toBe('READY');
  });

  it('an uploaded document enters the SAME pipeline (user-provided access, same matcher/resolver)', async () => {
    const web = new FakeWeb({
      ...ROBOTS('www.example-autodata.org'),
      'https://www.example-autodata.org/fiesta-mk7': { body: SCHEDULE_B },
    });
    const upload = new TextEncoder().encode(SCHEDULE_A);
    const r = await runMSource(
      fp,
      fakeDeps(web, [
        new UploadDiscoveryAdapter([{ id: 'doc-1', name: 'booklet.html', bytes: upload }]),
        new KnownCandidatesAdapter([candidate('https://www.example-autodata.org/fiesta-mk7')]),
      ]),
    );
    const up = r.schedule!.sources.find((s) => s.sourceType === 'user_upload')!;
    expect(up.access.map((a) => `${a.operation}:${a.status}:${a.reason}`)).toEqual(
      expect.arrayContaining(['EXTRACTION:ALLOWED:user_provided', 'STORAGE:ALLOWED:user_provided']),
    );
    expect(web.requested.some((u) => u.startsWith('upload:'))).toBe(false);
    expect(r.schedule!.items.find((i) => i.task === 'engine_oil')).toMatchObject({
      independentSources: 2,
    });
  });

  it('the evidence cache avoids re-downloading an unchanged source for the same vehicle class', async () => {
    const store = new Map<string, never>();
    const cache = {
      get: (u: string, k: string) => store.get(`${k}|${u}`) ?? null,
      put: (u: string, k: string, v: never) => void store.set(`${k}|${u}`, v),
    };
    const pages = {
      ...ROBOTS('www.example-garage.com'),
      ...ROBOTS('www.example-autodata.org'),
      'https://www.example-garage.com/fiesta': { body: SCHEDULE_A },
      'https://www.example-autodata.org/fiesta-mk7': { body: SCHEDULE_B },
    };
    const urls = [
      'https://www.example-garage.com/fiesta',
      'https://www.example-autodata.org/fiesta-mk7',
    ];
    await run(pages, urls, { cache });
    const second = await run(pages, urls, { cache });
    expect(second.web.requested).toEqual([]);
    expect(second.run.schedule!.status).toBe('READY');
  });
});
