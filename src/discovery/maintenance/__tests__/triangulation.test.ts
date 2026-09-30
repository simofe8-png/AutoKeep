import { isoDate, type VehicleFacts } from '@/domain';
import { resolveRequirements } from '@/engine/requirements';

import {
  confidenceOf,
  groundingKey,
  independenceKey,
  publisherKey,
  triangulate,
  type Grounding,
  type Observation,
  type SourceClaim,
} from '../triangulation';

/** Source-agnostic triangulation — SYNTHETIC sources and intervals only. */
const at = isoDate('2026-09-30');
const QUOTE = 'SYNTHETIC oil every 15,000 km or 12 months';
const src = (url: string, over: Partial<SourceClaim> = {}): SourceClaim => ({
  url,
  publisher: url,
  sourceKind: 'garage_publication',
  quote: QUOTE,
  namesModel: true,
  ...over,
});
const obs = (id: string, sources: SourceClaim[], every = 15000, over: Partial<Observation> = {}) =>
  ({
    id,
    task: 'engine_oil',
    action: 'replacement',
    interval: {
      every: { value: every, unit: 'km' },
      everyMonths: 12,
      rule: 'whichever_first',
      repeats: true,
    },
    applicability: { makes: ['synthcar'], models: ['alpha'], modelYears: { from: 2018, to: 2020 } },
    sources,
    yearsStated: true,
    ...over,
  }) as Observation;
const grounded = (...urls: string[]) =>
  new Map<string, Grounding>(
    urls.map((u) => [
      groundingKey({ url: u, quote: QUOTE }),
      { grounded: true, sha256: 'c'.repeat(64) },
    ]),
  );
const car: VehicleFacts = {
  kind: 'car',
  make: 'synthcar',
  model: 'Alpha',
  modelYear: 2019,
  market: 'IL',
};

describe('independence', () => {
  it('a publisher counts once; copies of one document count once', () => {
    expect(publisherKey('https://www.forum.example.com/t/1')).toBe('example.com');
    expect(publisherKey('https://garage.example.co.il/x')).toBe('example.co.il');
    const a = src('https://a.example.com/1');
    const b = src('https://www.example.com/2');
    expect(independenceKey(a)).toBe(independenceKey(b));
    const c1 = src('https://copies-one.test/m', { derivedFrom: 'Synthcar 2019 owner manual' });
    const c2 = src('https://copies-two.test/m', { derivedFrom: 'synthcar 2019  Owner Manual' });
    expect(independenceKey(c1)).toBe(independenceKey(c2));
    // The manufacturer is ONE source: two national editions and a site restating its manual.
    const kr = src('https://maker.example.kr/m', { sourceKind: 'official_manual' });
    const tr = src('https://maker.example.com.tr/m', { sourceKind: 'official_manual' });
    const blog = src('https://blog.test/p', { derivedFrom: 'the SYNTH owner manual chart' });
    expect(new Set([kr, tr, blog].map(independenceKey))).toEqual(new Set(['official']));
    // A press article with its own publisher stays independent.
    expect(independenceKey(src('https://press.test/a', { sourceKind: 'press' }))).toBe(
      'pub:press.test',
    );
  });

  it('confidence: official + other, or ≥ 3 groups = high; 1 official or 2 groups = medium', () => {
    expect(confidenceOf(2, 1)).toBe('high');
    expect(confidenceOf(3, 0)).toBe('high');
    expect(confidenceOf(1, 1)).toBe('medium');
    expect(confidenceOf(2, 0)).toBe('medium');
    expect(confidenceOf(1, 0)).toBe('low');
  });
});

describe('model and year coverage', () => {
  const urls = ['https://one.test/a', 'https://two.test/b', 'https://three.test/c'];
  it('no source naming the model → low, never scheduled (make-level pages only corroborate)', () => {
    const o = obs(
      'm1',
      urls.map((u) => src(u, { namesModel: false })),
    );
    expect(triangulate([o], grounded(...urls), at).assessments[0].confidence).toBe('low');
  });
  it('no source stating years / generation → at most medium', () => {
    const o = obs(
      'm2',
      urls.map((u) => src(u)),
      15000,
      { yearsStated: false },
    );
    expect(triangulate([o], grounded(...urls), at).assessments[0].confidence).toBe('medium');
  });
});

describe('triangulate → engine', () => {
  it('two independent non-official sources, grounded → schedules at level T, medium confidence', () => {
    const o = obs('o1', [src('https://one.test/a'), src('https://two.test/b')]);
    const { requirements } = triangulate(
      [o],
      grounded('https://one.test/a', 'https://two.test/b'),
      at,
    );
    expect(requirements[0]).toMatchObject({
      authority: 'secondary',
      verification: 'verified',
      corroboration: { independentSources: 2, officialSources: 0, confidence: 'medium' },
    });
    const r = resolveRequirements(requirements, car)[0];
    expect(r).toMatchObject({ status: 'resolved', level: 'T' });
  });

  it('an ungrounded quote is not counted: one remaining source → low, never scheduled', () => {
    const o = obs('o2', [src('https://one.test/a'), src('https://two.test/b')]);
    const { requirements, assessments } = triangulate([o], grounded('https://one.test/a'), at);
    expect(assessments[0]).toMatchObject({ confidence: 'low', ungrounded: ['https://two.test/b'] });
    expect(requirements[0].verification).toBe('candidate');
    expect(resolveRequirements(requirements, car)[0].status).toBe('unverified_only');
  });

  it('two corroborated but different intervals at the same tier → CONFLICTING (no guess)', () => {
    const urls = [
      'https://one.test/a',
      'https://two.test/b',
      'https://three.test/c',
      'https://four.test/d',
    ];
    const { requirements } = triangulate(
      [
        obs('o3', [src(urls[0]), src(urls[1])], 15000),
        obs('o4', [src(urls[2]), src(urls[3])], 10000),
      ],
      grounded(...urls),
      at,
    );
    expect(resolveRequirements(requirements, car)[0].status).toBe('conflicting');
  });

  it('a lone dissenting forum post does not break a corroborated consensus', () => {
    const urls = [
      'https://one.test/a',
      'https://two.test/b',
      'https://three.test/c',
      'https://forum.test/p',
    ];
    const { requirements } = triangulate(
      [
        obs('o5', [src(urls[0]), src(urls[1]), src(urls[2])], 15000),
        obs('o6', [src(urls[3], { sourceKind: 'forum' })], 5000),
      ],
      grounded(...urls),
      at,
    );
    const r = resolveRequirements(requirements, car)[0];
    expect(r).toMatchObject({ status: 'resolved', level: 'T' });
    expect(r.effective?.corroboration?.confidence).toBe('high');
  });

  it('a verified official requirement outranks a triangulated one with a different interval', () => {
    const urls = ['https://one.test/a', 'https://two.test/b'];
    const { requirements } = triangulate(
      [obs('o7', [src(urls[0]), src(urls[1])], 10000)],
      grounded(...urls),
      at,
    );
    const official = {
      ...requirements[0],
      id: 'official',
      authority: 'manufacturer' as const,
      interval: { ...requirements[0].interval, every: { value: 15000, unit: 'km' as const } },
      extraction: { method: 'curated' as const, by: 'test', at },
      evidence: [{ ...requirements[0].evidence[0], page: 3 }],
      corroboration: undefined,
    };
    const r = resolveRequirements([official, ...requirements], car)[0];
    expect(r).toMatchObject({ status: 'resolved', level: 'B', reason: 'market_override' });
  });

  it('applicability still excludes: another model year never applies', () => {
    const urls = ['https://one.test/a', 'https://two.test/b'];
    const { requirements } = triangulate(
      [obs('o8', [src(urls[0]), src(urls[1])])],
      grounded(...urls),
      at,
    );
    expect(resolveRequirements(requirements, { ...car, modelYear: 2023 })[0].status).toBe(
      'not_applicable',
    );
  });
});
