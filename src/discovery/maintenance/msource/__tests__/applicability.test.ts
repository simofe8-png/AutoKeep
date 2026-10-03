import type { MaintenanceRequirement } from '@/domain';

import { fixtureSystem } from '../../registry/testing';
import { KnownCandidatesAdapter } from '../adapters';
import { officialMetadataYear, sourceIdentity } from '../authority';
import { makeCandidate } from '../candidates';
import { buildFingerprint, type VehicleFingerprint } from '../fingerprint';
import { matchItem, sectionContextOf } from '../matcher';
import { resolveSchedule } from '../resolver';
import { runMSource } from '../run';
import { terminalStatus } from '../status';
import { ALLOW_ALL, FakeWeb, fakeDeps } from '../testing';
import type {
  DocumentApplicability,
  EvidenceRecord,
  MatchStatus,
  SourceProvenance,
} from '../types';
import { toEvidenceRecord } from '../evidence';

/**
 * Item-level applicability, document metadata, source identity, conditional and partial
 * schedules (owner correction 2026-10-02). SYNTHETIC fixtures: invented intervals on example /
 * fixture pages; the brand-domain host names are used only to exercise the identity rule.
 */

const fpOf = (input: Parameters<typeof buildFingerprint>[0]): VehicleFingerprint => {
  const r = buildFingerprint(input);
  if (!r.ok) throw new Error('fixture');
  return r.fingerprint;
};
const FIESTA = fpOf({
  kind: 'car',
  manufacturer: 'פורד גרמניה',
  model: 'FIESTA',
  year: 2015,
  engine: '1242 סמ״ק',
  engineCode: 'SNJB',
  fuel: 'בנזין',
});
const IBIZA = fpOf({
  kind: 'car',
  manufacturer: 'סיאט ספרד',
  model: 'IBIZA',
  year: 2012,
  engine: '1390 סמ״ק',
  engineCode: 'CGG',
  fuel: 'בנזין',
});

const req = (over: Partial<MaintenanceRequirement> = {}): MaintenanceRequirement => ({
  id: 'r',
  task: 'engine_oil',
  taskText: 'Engine oil: replace every 20,000 km or 12 months',
  action: 'replacement',
  interval: {
    every: { value: 20000, unit: 'km' },
    everyMonths: 12,
    rule: 'whichever_first',
    first: null,
    repeats: true,
  },
  applicability: {},
  authority: 'secondary',
  evidence: [],
  verification: 'candidate',
  extraction: {
    method: 'deterministic_parser',
    by: 't',
    at: '2026-10-02' as never,
    grounded: true,
  },
  ...over,
});
const doc = (over: Partial<DocumentApplicability> = {}): DocumentApplicability => ({
  models: ['Fiesta'],
  modelVariants: [],
  yearFrom: 2013,
  yearTo: 2017,
  engineCodes: [],
  displacementsCc: [],
  fuels: [],
  markets: [],
  ...over,
});
const ctx = (operation: Parameters<typeof matchItem>[3]['operation'], over = {}) => ({
  operation,
  official: false,
  documentType: null,
  sectionYears: null,
  sectionText: '',
  ...over,
});

describe('official source identity is independent of registry presence', () => {
  it('a manufacturer brand domain + manufacturer document = official, without a registry entry', () => {
    expect(sourceIdentity('www.seat.co.uk', 'seat', 'owners_manual', [])).toMatchObject({
      official: true,
      basis: 'brand_domain',
    });
    expect(sourceIdentity('seat.com', 'seat', 'owners_manual', []).official).toBe(true);
    expect(sourceIdentity('www.ford.co.uk', 'ford', 'maintenance_schedule', []).official).toBe(
      true,
    );
  });

  it('look-alikes, community subdomains and non-manufacturer documents are not official', () => {
    expect(sourceIdentity('seat-manuals.com', 'seat', 'owners_manual', []).official).toBe(false);
    expect(sourceIdentity('www.myseat.co.uk', 'seat', 'owners_manual', []).official).toBe(false);
    expect(sourceIdentity('forums.ford.com', 'ford', 'owners_manual', []).official).toBe(false);
    expect(sourceIdentity('www.seat.co.uk', 'seat', 'other', []).official).toBe(false);
  });

  it('the registry caches the classification; a rejected system is never official', () => {
    const sys = fixtureSystem({ domains: [{ host: 'docs.example-importer.com', role: 'site' }] });
    expect(sourceIdentity('docs.example-importer.com', 'x', null, [sys])).toMatchObject({
      official: true,
      basis: 'registry',
    });
    const rejected = { ...sys, status: 'rejected' as const };
    expect(sourceIdentity('docs.example-importer.com', 'x', null, [rejected]).official).toBe(false);
  });
});

describe('document-level year applicability from trusted metadata', () => {
  it("reads the manufacturer's model-year designation from the official path", () => {
    expect(
      officialMetadataYear(
        'https://www.seat.co.uk/datamanual-manual/ibiza_sc/my12_w45/en-uk/IbizaSC_EN.pdf',
      ),
    ).toEqual({
      year: 2012,
      designation: 'my12',
    });
    expect(officialMetadataYear('https://www.example.com/model-year-2015/fiesta.pdf')?.year).toBe(
      2015,
    );
    expect(officialMetadataYear('https://www.example.com/manual.pdf')).toBeNull();
  });

  it('applies it to an official source only — never to a third-party filename', async () => {
    const page = `<html><head><title>Ibiza owner's manual</title></head><body>
      <h2>Service intervals</h2><p>Engine oil for all engines: replace every 15,000 km or 12 months, whichever comes first.</p></body></html>`;
    const pages = {
      'https://www.seat.co.uk/robots.txt': { contentType: 'text/plain', body: ALLOW_ALL },
      'https://www.seat.co.uk/manual/my12_w45/ibiza.html': { body: page },
      'https://www.example-mirror.com/robots.txt': { contentType: 'text/plain', body: ALLOW_ALL },
      'https://www.example-mirror.com/manual/my12_w45/ibiza.html': {
        body: page.replace('15,000', '16,000'),
      },
    };
    const web = new FakeWeb(pages);
    const urls = Object.keys(pages).filter((u) => !u.endsWith('robots.txt'));
    const run = await runMSource(
      IBIZA,
      fakeDeps(web, [
        new KnownCandidatesAdapter(
          urls.map((url) =>
            makeCandidate({
              url,
              sourceType: 'other',
              discoveredBy: 'catalog',
              discoveredAt: 't',
            })!,
          ),
        ),
      ]),
    );
    const s = run.schedule!;
    const official = s.sources.find((x) => x.finalUrl.includes('seat.co.uk'))!;
    const mirror = s.sources.find((x) => x.finalUrl.includes('example-mirror'))!;
    expect(official.authority).toMatchObject({ official: true, basis: 'brand_domain' });
    expect(official.statedApplicability).toMatchObject({
      yearFrom: 2012,
      yearTo: 2012,
      yearBasis: 'official_metadata',
    });
    expect(mirror.authority?.official).toBe(false);
    expect(mirror.statedApplicability?.yearFrom).toBeNull();
    // Official + MY12 + all engines → the item is scheduled; the mirror's value stays unused.
    expect(s.items).toEqual([
      expect.objectContaining({ task: 'engine_oil', intervalKm: 15000, officialSources: 1 }),
    ]);
  });
});

describe('item-level applicability scopes', () => {
  it('ALL_ENGINES stated by the source is sufficient for a powertrain-dependent operation', () => {
    const r = matchItem(
      doc(),
      req(),
      FIESTA,
      ctx('engine_oil', { sectionText: 'Service schedule for all engines' }),
    );
    expect(r.item).toMatchObject({ scope: 'ALL_ENGINES', sufficient: true });
    expect(r.match.status).toBe('STRONG');
  });

  it('an engine list alone does not make every interval apply to every engine', () => {
    const r = matchItem(
      doc({ displacementsMentioned: [1000, 1250, 1400, 1600] }),
      req(),
      FIESTA,
      ctx('engine_oil'),
    );
    expect(r.item).toMatchObject({ scope: 'MODEL_YEAR_RANGE', sufficient: false });
    expect(r.match.status).toBe('PARTIAL');
  });

  it('engine-specific item scope: a row for this engine family / code, or for another engine', () => {
    const family = matchItem(
      doc(),
      req({ applicability: { displacementCc: { min: 1190, max: 1310 } } }),
      FIESTA,
      ctx('spark_plugs'),
    );
    expect(family.item.scope).toBe('ENGINE_FAMILY');
    expect(family.match.status).toBe('STRONG');
    const code = matchItem(
      doc(),
      req({ applicability: { engineCodes: ['SNJB'] } }),
      FIESTA,
      ctx('timing_belt'),
    );
    expect(code.item.scope).toBe('EXACT_ENGINE');
    expect(code.match.status).toBe('EXACT');
    const other = matchItem(
      doc(),
      req({ applicability: { displacementCc: { min: 940, max: 1060 } } }),
      FIESTA,
      ctx('timing_belt'),
    );
    expect(other.match.status).toBe('NOT_APPLICABLE');
  });

  it('model + years is sufficient for model-wide operations, not for powertrain-dependent ones', () => {
    const brake = matchItem(doc(), req({ task: 'brake_fluid' }), FIESTA, ctx('brake_fluid'));
    expect(brake.item).toMatchObject({ scope: 'MODEL_YEAR_RANGE', sufficient: true });
    expect(brake.match.status).toBe('STRONG');
    const oil = matchItem(doc(), req(), FIESTA, ctx('engine_oil'));
    expect(oil.item.sufficient).toBe(false);
    const noYears = matchItem(
      doc({ yearFrom: null, yearTo: null }),
      req({ task: 'brake_fluid' }),
      FIESTA,
      ctx('brake_fluid'),
    );
    expect(noYears.match.status).toBe('PARTIAL');
  });

  it("the item's own section years win over the document's (a 2019 schedule is not a 2015 car's)", () => {
    const lines = [
      'Ford Fiesta Mk6 2008-2017',
      'Service intervals',
      'The following servicing schedule is from a 2019 Ford Fiesta owner’s manual.',
      'Replace cabin air filter Every 20,000 miles',
    ];
    const page = {
      n: 4,
      lines: lines.map((t, i) => ({ y: i, items: [{ str: t, x: 0, y: i, w: 100 }], text: t })),
      text: lines.join('\n'),
    };
    const section = sectionContextOf(
      [page],
      { page: 4, text: 'Replace cabin air filter Every 20,000 miles' },
      FIESTA,
    );
    expect(section.sectionYears).toEqual({ from: 2019, to: 2019 });
    const r = matchItem(
      doc({ yearFrom: 2008, yearTo: 2017 }),
      req({ task: 'cabin_filter' }),
      FIESTA,
      ctx('cabin_filter', section),
    );
    expect(r.item).toMatchObject({ yearsBasis: 'section', years: { from: 2019, to: 2019 } });
    expect(r.match.status).toBe('NOT_APPLICABLE');
  });
});

describe('conditional (QG) applicability', () => {
  const MANUAL = `<html><head><title>SEAT Ibiza owner's manual</title></head><body>
    <h2>Service intervals</h2>
    <p>If the PR code that appears on the back of the Maintenance Programme booklet is QG7, this means that your vehicle has the LongLife service programmed.</p>
    <p>If it has the codes QG8 or QG9 the interval service is dependent on time/distance travelled.</p>
    <h3>Fixed service intervals</h3>
    <p>In this case, your vehicle must be serviced after a fixed interval of 1 year / 12 345 km (whatever comes first).</p>
    </body></html>`;
  const URL_ = 'https://www.seat.co.uk/datamanual-manual/ibiza/my12_w45/en-uk/manual.html';

  async function seatRun(serviceRegime: string | null) {
    const web = new FakeWeb({
      'https://www.seat.co.uk/robots.txt': { contentType: 'text/plain', body: ALLOW_ALL },
      [URL_]: { body: MANUAL },
    });
    return runMSource(
      IBIZA,
      fakeDeps(
        web,
        [
          new KnownCandidatesAdapter([
            makeCandidate({
              url: URL_,
              sourceType: 'other',
              discoveredBy: 'catalog',
              discoveredAt: 't',
            })!,
          ]),
        ],
        {
          facts: { serviceRegime },
        },
      ),
    );
  }

  it('unknown code → CONDITIONALLY_APPLICABLE with the document’s own code condition (never assumed)', async () => {
    const run = await seatRun(null);
    const s = run.schedule!;
    expect(s.status).toBe('CONDITIONAL');
    expect(s.items).toEqual([
      expect.objectContaining({
        task: 'periodic_service',
        intervalKm: 12345,
        intervalMonths: 12,
        applicabilityStatus: 'CONDITIONALLY_APPLICABLE',
        conditions: { serviceRegimes: ['QG8', 'QG9'] },
        officialSources: 1,
        scope: 'ALL_ENGINES',
      }),
    ]);
    expect(terminalStatus(run, 'now').state).toBe('CONDITIONALLY_READY');
  });
});

describe('partial schedules: items resolve independently', () => {
  const src = (id: string, url: string): SourceProvenance => ({
    sourceId: id,
    canonicalUrl: url,
    finalUrl: url,
    chain: [url],
    sourceName: id,
    sourceType: 'publication',
    discoveredBy: 't',
    discoveredAt: 't',
    retrievedAt: 't',
    format: 'html',
    documentType: 'other',
    contentSha256: id.padEnd(64, '0'),
    byteLength: 1,
    locale: null,
    markets: [],
    statedApplicability: null,
    access: [],
    authority: { official: false, basis: 'none', detail: '' },
    extractorVersion: 'x',
    msourceVersion: 'msource/1',
  });
  const ev = (
    id: string,
    sourceId: string,
    task: MaintenanceRequirement['task'],
    km: number,
    status: MatchStatus,
  ): EvidenceRecord =>
    toEvidenceRecord(
      {
        requirement: req({
          id,
          task,
          interval: {
            every: { value: km, unit: 'km' },
            everyMonths: 24,
            rule: 'whichever_first',
            first: null,
            repeats: true,
          },
        }),
        groundTokens: [],
        page: 1,
        locator: 'l',
        method: 'sentence',
      },
      sourceId,
      { status, dimensions: {}, reasons: [] },
      true,
    );

  it('READY_PARTIAL: supported items are kept while a conflict and an insufficient item are withheld', () => {
    const s = resolveSchedule({
      fingerprintKey: 'k',
      market: 'IL',
      make: 'ford',
      sources: [src('a', 'https://a.example-cars.com/x'), src('b', 'https://b.example-cars.org/x')],
      evidence: [
        ev('1', 'a', 'engine_oil', 15000, 'STRONG'),
        ev('2', 'a', 'brake_fluid', 30000, 'STRONG'),
        ev('3', 'a', 'cabin_filter', 30000, 'STRONG'),
        ev('4', 'b', 'cabin_filter', 32187, 'STRONG'),
        ev('5', 'b', 'timing_belt', 150000, 'SUPPORTED'),
      ],
      officialHost: () => false,
      now: 't',
      acquiredSources: 2,
    });
    expect(s.status).toBe('READY_PARTIAL');
    expect(s.items.map((i) => [i.task, i.quality])).toEqual([
      ['brake_fluid', 'SUPPORTED'],
      ['engine_oil', 'SUPPORTED'],
    ]);
    expect(s.unresolved.map((i) => [i.task, i.quality])).toEqual([
      ['cabin_filter', 'CONFLICTING'],
      ['timing_belt', 'INSUFFICIENT'],
    ]);
    // Nothing is filled in for the withheld items.
    expect(s.unresolved.every((i) => i.intervalKm === null || i.quality === 'INSUFFICIENT')).toBe(
      true,
    );
  });
});
