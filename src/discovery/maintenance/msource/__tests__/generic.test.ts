import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { officialVariantToken, sourceIdentity } from '../authority';
import { buildFingerprint, type VehicleFingerprint } from '../fingerprint';
import { matchItem, readDocumentApplicability, sectionContextOf } from '../matcher';
import { extractSentences, regimeCodesIn, regimeMapOf } from '../sentences';
import {
  fillPattern,
  isGeneralizable,
  learnFromRun,
  mergeKnowledge,
  SourceKnowledgeAdapter,
  tokenizeUrl,
} from '../sourceKnowledge';
import type { DocumentApplicability } from '../types';

/**
 * Generalization guards (owner instruction 2026-10-03): no production logic tied to the
 * regression vehicles; manufacturer-agnostic regimes, variants and learned source families.
 * SYNTHETIC values only.
 */

const fpOf = (input: Parameters<typeof buildFingerprint>[0]): VehicleFingerprint => {
  const r = buildFingerprint(input);
  if (!r.ok) throw new Error('fixture');
  return r.fingerprint;
};

describe('no vehicle-specific production logic', () => {
  it('production M-SOURCE code never names the regression vehicles or their engine codes', () => {
    const dir = join(__dirname, '..');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !['testing.ts'].includes(f));
    for (const f of files) {
      // Comments may cite examples; code may not.
      const code = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect({ f, hit: /fiesta|ibiza|snjb|\bcgg|\bQG\d/i.exec(code)?.[0] ?? null }).toEqual({
        f,
        hit: null,
      });
    }
  });
});

describe('service-plan regimes for any manufacturer', () => {
  const page = (texts: string[]) => ({
    n: 1,
    lines: texts.map((t, i) => ({ y: i, items: [{ str: t, x: 0, y: i, w: 300 }], text: t })),
    text: texts.join('\n'),
  });

  it('codes are recognized by their "code" context, in any manufacturer format', () => {
    expect(
      regimeCodesIn('If the service code on the sticker is XS1 the vehicle uses flexible service.'),
    ).toEqual(['XS1']);
    expect(regimeCodesIn('Codes AB0 or AB2 mean fixed intervals.')).toEqual(['AB0', 'AB2']);
    // A lone code-like token outside a "code" context is never a regime.
    expect(regimeCodesIn('Use E10 fuel. The A3 model is shown.')).toEqual([]);
  });

  it("the document's own mapping of codes to regimes is read, whatever the code format", () => {
    const map = regimeMapOf([
      page([
        'If the service code is XS1, your vehicle has the flexible service programmed.',
        'If it has the codes XS0 or XS2 the interval service is dependent on time/distance travelled.',
      ]),
    ]);
    expect(map).toEqual({ LONGLIFE: ['XS1'], FIXED: ['XS0', 'XS2'] });
  });
});

describe('body variants (generic)', () => {
  const doc = (over: Partial<DocumentApplicability> = {}): DocumentApplicability => ({
    models: ['Astra'],
    modelVariants: [],
    yearFrom: 2016,
    yearTo: 2016,
    engineCodes: [],
    displacementsCc: [],
    fuels: [],
    markets: [],
    ...over,
  });
  const ctx = {
    operation: 'brake_fluid' as const,
    official: true,
    documentType: 'owners_manual' as const,
    sectionYears: null,
    sectionText: '',
  };
  const astra = fpOf({
    kind: 'car',
    manufacturer: 'Opel',
    model: 'Astra',
    year: 2016,
    engine: 1399,
    fuel: 'petrol',
    body: 'Hatchback',
  });
  const req = {
    id: 'r',
    task: 'brake_fluid' as const,
    taskText: 'Brake fluid every 2 years',
    action: 'replacement' as const,
    interval: { everyMonths: 24, rule: 'time_only' as const, first: null, repeats: true },
    applicability: {},
    authority: 'secondary' as const,
    evidence: [],
    verification: 'candidate' as const,
    extraction: {
      method: 'deterministic_parser' as const,
      by: 't',
      at: '2026-10-03' as never,
      grounded: true,
    },
  };

  it('the variant token comes from the official document directory naming only', () => {
    expect(
      officialVariantToken(
        'https://www.example-oem.com/manuals/astra_sportstourer/my16/manual.pdf',
        'Astra',
      ),
    ).toBe('sportstourer');
    expect(
      officialVariantToken('https://www.example-oem.com/manuals/astra/my16/Astra_EN.pdf', 'Astra'),
    ).toBeNull();
  });

  it('a different known body is NOT_APPLICABLE; an unknown variant token is MODEL_VARIANT', () => {
    const estate = matchItem(doc({ variantToken: 'sportstourer' }), req, astra, ctx);
    expect(estate.match.status).toBe('NOT_APPLICABLE');
    const unknown = matchItem(doc({ variantToken: 'gtc' }), req, astra, ctx);
    expect(unknown.item).toMatchObject({ scope: 'MODEL_VARIANT', sufficient: false });
    const plain = matchItem(doc(), req, astra, ctx);
    expect(plain.match.status).toBe('STRONG');
  });
});

describe('self-improving source knowledge (source families, never intervals)', () => {
  const leon = fpOf({
    kind: 'car',
    manufacturer: 'SEAT',
    model: 'Leon',
    year: 2015,
    engine: 1395,
    fuel: 'petrol',
  });
  const golf = fpOf({
    kind: 'car',
    manufacturer: 'Volkswagen',
    model: 'Golf',
    year: 2016,
    engine: 1395,
    fuel: 'petrol',
  });

  it('tokenizes a URL by the vehicle’s own model / year and fills it for another vehicle', () => {
    const p = tokenizeUrl('https://www.example-oem.com/manuals/leon/my15_w45/en/Leon_EN.pdf', leon);
    expect(p).toBe('https://www.example-oem.com/manuals/{model}/my{yy}_w45/en/{Model}_EN.pdf');
    const ateca = fpOf({
      kind: 'car',
      manufacturer: 'SEAT',
      model: 'Ateca',
      year: 2018,
      engine: 1395,
      fuel: 'petrol',
    });
    expect(fillPattern(p!, ateca)).toBe(
      'https://www.example-oem.com/manuals/ateca/my18_w45/en/Ateca_EN.pdf',
    );
    // A URL that does not carry the model cannot generalize.
    expect(tokenizeUrl('https://www.example-oem.com/doc/12345.pdf', leon)).toBeNull();
  });

  it('learns only from sources with usable evidence; brand-domain patterns stay with their make', async () => {
    const run = {
      finishedAt: 't',
      candidates: [
        {
          candidate: { canonicalUrl: 'https://blocked.example-data.com/x' },
          decisions: [{ operation: 'FETCH', status: 'BLOCKED' }],
        },
      ],
      schedule: {
        sources: [
          {
            sourceId: 's1',
            finalUrl: 'https://www.seat.co.uk/manuals/leon/my15_w45/en/Leon_EN.pdf',
            sourceType: 'oem_manual',
            documentType: 'owners_manual',
            authority: { official: true, basis: 'brand_domain', detail: '' },
            statedApplicability: { yearBasis: 'official_metadata', yearDesignation: 'my15' },
          },
        ],
        evidence: [
          {
            sourceId: 's1',
            grounded: true,
            extractionMethod: 'sentence',
            match: { status: 'STRONG', dimensions: {}, reasons: [] },
          },
        ],
      },
    } as never;
    const learned = learnFromRun(run, leon);
    const store = mergeKnowledge([], learned);
    const seat = store.find((k) => k.domain === 'seat.co.uk')!;
    expect(seat).toMatchObject({
      identity: 'brand_domain',
      make: 'seat',
      urlPatterns: ['https://www.seat.co.uk/manuals/{model}/my{yy}_w45/en/{Model}_EN.pdf'],
      applicabilityPatterns: ['official_metadata:my{yy}'],
    });
    expect(store.find((k) => k.domain === 'example-data.com')?.lastAccess).toBe('blocked');
    const now = () => 't';
    const forSeat = await new SourceKnowledgeAdapter(store).discover({
      fingerprint: fpOf({
        kind: 'car',
        manufacturer: 'SEAT',
        model: 'Arona',
        year: 2019,
        engine: 999,
        fuel: 'petrol',
      }),
      queries: [],
      now,
    });
    expect(forSeat.candidates.map((c) => c.url)).toEqual([
      'https://www.seat.co.uk/manuals/arona/my19_w45/en/Arona_EN.pdf',
    ]);
    // Another make never inherits a brand domain's pattern.
    const forVw = await new SourceKnowledgeAdapter(store).discover({
      fingerprint: golf,
      queries: [],
      now,
    });
    expect(forVw.candidates).toEqual([]);
    // Knowledge never contains intervals.
    expect(JSON.stringify(store)).not.toMatch(/interval|km|months/i);
  });
});

describe('generic rules found by the cross-manufacturer matrix', () => {
  const lines = (texts: string[], n = 1) => ({
    n,
    lines: texts.map((t, i) => ({ y: i, items: [{ str: t, x: 0, y: i, w: 300 }], text: t })),
    text: texts.join('\n'),
  });
  const civic = fpOf({
    kind: 'car',
    manufacturer: 'Honda',
    model: 'Civic',
    year: 2017,
    engine: 1498,
    fuel: 'petrol',
  });

  it('a page listing several generations has no single document model year', () => {
    const doc = readDocumentApplicability(
      [
        lines([
          'Honda Civic Mk9 2011-2017',
          'Honda Civic Mk10 2017-2021',
          'Honda Civic Mk11 2022-2025',
        ]),
      ],
      civic,
    );
    expect([doc.yearFrom, doc.yearTo]).toEqual([null, null]);
    // Two consecutive generations sharing a boundary year are still two generations.
    const two = readDocumentApplicability(
      [lines(['Honda Civic Mk9 2011-2017', 'Honda Civic Mk10 2017-2021'])],
      civic,
    );
    expect([two.yearFrom, two.yearTo]).toEqual([null, null]);
  });

  it("the document's own title range takes precedence over other generations listed on the page", () => {
    const doc = readDocumentApplicability(
      [lines(['Other versions: Honda Civic 2011-2016', 'Honda Civic 2022-2025'])],
      civic,
      ['Honda Civic 1.5 petrol (2017-2021) service'],
    );
    expect([doc.yearFrom, doc.yearTo]).toEqual([2017, 2021]);
  });

  it("a single title year selects the page's own range that contains it", () => {
    const doc = readDocumentApplicability(
      [lines(['Toyota Corolla 1.6 petrol (2016 - 2018)'])],
      fpOf({
        kind: 'car',
        manufacturer: 'Toyota',
        model: 'Corolla',
        year: 2017,
        engine: 1598,
        fuel: 'petrol',
      }),
      ['Toyota Corolla 1.6 2016 service'],
    );
    expect([doc.yearFrom, doc.yearTo]).toEqual([2016, 2018]);
  });

  it('the nearest heading with a year range sets the section years, even without the model name', () => {
    const page = lines([
      'Fourth generation (1995–2002)',
      'These engines relied on a timing belt replaced every 60,000 miles or 5 years.',
    ]);
    const s = sectionContextOf(
      [page],
      {
        page: 1,
        text: 'These engines relied on a timing belt replaced every 60,000 miles or 5 years.',
      },
      civic,
    );
    expect(s.sectionYears).toEqual({ from: 1995, to: 2002 });
  });

  it('comparison-table rows and advisory statements are not read as a schedule', () => {
    const doc = { sha256: 'a'.repeat(64), lead: { title: 't' }, finalUrl: 'u' } as never;
    const r = extractSentences({
      doc,
      pages: [
        lines([
          'Service Interval every 12 months 6 months 12 months.',
          'Based on practical experience, the timing belt should be replaced every 60,000 km.',
          'A good rule of thumb for most cars is to book a full service once a year or every 12,000 miles.',
          'Replace the brake fluid every 2 years.',
        ]),
      ],
      kind: 'car',
      make: 'honda',
      authorityHint: 'secondary',
      markets: [],
      models: [],
      years: null,
      today: '2026-10-03' as never,
    });
    expect(r.extracted.map((e) => e.requirement.task)).toEqual(['brake_fluid']);
    expect(r.skipped.map((x) => x.reason).sort()).toEqual([
      'advisory statement',
      'advisory statement',
      'several values in one statement',
    ]);
  });

  it('an official manual path on the brand domain establishes a manufacturer document', () => {
    expect(
      sourceIdentity(
        'www.example.com',
        'example',
        'other',
        [],
        'https://www.example.com/datamanual-manual/x/my12/x_EN.pdf',
      ),
    ).toMatchObject({ official: true, basis: 'brand_domain' });
    expect(
      sourceIdentity(
        'www.example.com',
        'example',
        'other',
        [],
        'https://www.example.com/news/2012.html',
      ).official,
    ).toBe(false);
  });
});

describe('reflected-content defence and explicit all-models scope', () => {
  const leon = fpOf({
    kind: 'car',
    manufacturer: 'SEAT',
    model: 'Leon',
    year: 2015,
    engine: 1395,
    fuel: 'petrol',
  });

  it('a URL carrying an opaque content id is never generalized to another vehicle', () => {
    // Some sites serve the SAME data for any make/model slug and echo the slug into the text.
    expect(
      tokenizeUrl('https://www.example-data.com/seat-leon/v20433-2015/service', leon),
    ).toBeNull();
    expect(
      isGeneralizable('https://www.example-data.com/{make}-{model}/v20433-{yyyy}/service'),
    ).toBe(false);
    expect(
      isGeneralizable('https://www.example-oem.com/manuals/{model}/my{yy}/{Model}_EN.pdf'),
    ).toBe(true);
  });

  it("the source's own heading stating ALL models gives all model years (stated, not inferred)", () => {
    const fiesta = fpOf({
      kind: 'car',
      manufacturer: 'Ford',
      model: 'Fiesta',
      year: 2015,
      engine: 1242,
      fuel: 'petrol',
    });
    const page = {
      n: 1,
      lines: ['Ford Fiesta Mk6 2008-2017', 'Ford Fiesta Mk7 2017-2023'].map((t, i) => ({
        y: i,
        items: [{ str: t, x: 0, y: i, w: 300 }],
        text: t,
      })),
      text: '',
    };
    const doc = readDocumentApplicability([page], fiesta, [
      'Ford Fiesta Inspektion | Serviceplan: Alle Modelle & Motoren',
    ]);
    expect(doc).toMatchObject({ yearFrom: 1900, yearTo: 2100, yearBasis: 'all_models_stated' });
    const noStatement = readDocumentApplicability([page], fiesta, ['Ford Fiesta Inspektion']);
    expect(noStatement.yearFrom).toBeNull();
  });
});
