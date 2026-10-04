/// <reference types="node" />
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildFingerprint, type VehicleFingerprint } from '../fingerprint';
import { matchItem, readDocumentApplicability, sectionContextOf } from '../matcher';
import { extractSentences, regimeCodesIn, regimeMapOf } from '../sentences';
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

  it('a different known body is NOT_APPLICABLE; an unknown variant token is MODEL_VARIANT', () => {
    const estate = matchItem(doc({ variantToken: 'sportstourer' }), req, astra, ctx);
    expect(estate.match.status).toBe('NOT_APPLICABLE');
    const unknown = matchItem(doc({ variantToken: 'gtc' }), req, astra, ctx);
    expect(unknown.item).toMatchObject({ scope: 'MODEL_VARIANT', sufficient: false });
    const plain = matchItem(doc(), req, astra, ctx);
    expect(plain.match.status).toBe('STRONG');
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
});

describe('explicit all-models scope', () => {
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
