import type { MaintenanceRequirement } from '@/domain';

import { canonicalizeUrl, dedupeCandidates, makeCandidate, normalizeResearch } from '../candidates';
import { canonicalOperation, operationFromText, toEvidenceRecord } from '../evidence';
import { buildFingerprint, type VehicleFingerprint } from '../fingerprint';
import { matchDocument, matchEvidence, namesModel } from '../matcher';
import { resolveSchedule } from '../resolver';
import type {
  DocumentApplicability,
  EvidenceRecord,
  MatchStatus,
  SourceProvenance,
} from '../types';

const fp = (engineCode: string, engine = '1390 סמ״ק'): VehicleFingerprint => {
  const r = buildFingerprint({
    kind: 'car',
    manufacturer: 'סיאט ספרד',
    model: 'IBIZA',
    year: 2012,
    engine,
    engineCode,
    fuel: 'בנזין',
  });
  if (!r.ok) throw new Error('fixture');
  return r.fingerprint;
};
const IBIZA = fp('CGG');

const req = (over: Partial<MaintenanceRequirement> = {}): MaintenanceRequirement => ({
  id: 'r1',
  task: 'engine_oil',
  taskText: 'Engine oil: replace every 10,000 miles or 1 year',
  action: 'replacement',
  interval: {
    every: { value: 10000, unit: 'mi' },
    everyMonths: 12,
    rule: 'whichever_first',
    first: null,
    repeats: true,
  },
  applicability: { makes: ['seat'], models: ['Ibiza'], modelYears: { from: 2008, to: 2015 } },
  authority: 'secondary',
  evidence: [{ documentId: 'd', documentTitle: 't', authority: 'secondary', markets: [], page: 3 }],
  verification: 'candidate',
  extraction: {
    method: 'deterministic_parser',
    by: 'x',
    at: '2026-10-02' as never,
    grounded: true,
  },
  ...over,
});

const docApp = (over: Partial<DocumentApplicability> = {}): DocumentApplicability => ({
  models: ['Ibiza'],
  modelVariants: [],
  yearFrom: 2008,
  yearTo: 2015,
  engineCodes: [],
  displacementsCc: [],
  fuels: [],
  markets: [],
  ...over,
});

describe('normalization', () => {
  it('miles stay miles (km derived); months and years normalized', () => {
    const ok = { status: 'SUPPORTED' as MatchStatus, dimensions: {}, reasons: [] };
    const e = toEvidenceRecord(
      { requirement: req(), groundTokens: [], page: 3, locator: 'line', method: 'sentence' },
      's1',
      ok,
      true,
    );
    expect(e).toMatchObject({
      intervalMiles: 10000,
      intervalKm: 16093,
      intervalMonths: 12,
      intervalYears: 1,
      whicheverComesFirst: true,
      rule: 'WHICHEVER_COMES_FIRST',
      operationKey: 'engine_oil',
      inspectionOrReplacement: 'replacement',
      sourceLocation: { page: 3, locator: 'line' },
    });
    expect(e.notes.join()).toMatch(/10000 mi ≈ 16093 km/);
  });

  it('canonical operation mapping never forces an unknown item into a wrong category', () => {
    expect(canonicalOperation('transmission_fluid', 'replacement', 'Manual transmission oil')).toBe(
      'manual_transmission_oil',
    );
    expect(canonicalOperation('transmission_fluid', 'replacement', 'ATF change')).toBe(
      'automatic_transmission_fluid',
    );
    expect(canonicalOperation('transmission_fluid', 'replacement', 'Gear oil')).toBe(
      'transmission_fluid',
    );
    expect(canonicalOperation('timing_chain', 'inspection', '')).toBe('timing_chain_inspection');
    expect(canonicalOperation('timing_chain', 'replacement', '')).toBe('OTHER');
    expect(canonicalOperation('brake_system', 'inspection', 'Brakes')).toBe('brakes_inspection');
    expect(canonicalOperation('auxiliary_belt', 'replacement', '')).toBe('accessory_belt');
    expect(canonicalOperation('valve_clearance', 'adjustment', '')).toBe('OTHER');
    expect(operationFromText('Battery: check condition')).toBe('battery_inspection');
    expect(operationFromText('High-voltage battery coolant')).toBeNull();
  });

  it('URL canonicalization and dedupe (tracking params, fragments, case)', () => {
    expect(canonicalizeUrl('HTTPS://WWW.Example-OEM.com:443/a.pdf?utm_source=x&id=2#p3')).toBe(
      'https://www.example-oem.com/a.pdf?id=2',
    );
    const a = makeCandidate({
      url: 'https://www.example-oem.com/a.pdf?utm_medium=y',
      sourceType: 'other',
      discoveredBy: 'fable',
      discoveredAt: 't',
    })!;
    const b = makeCandidate({
      url: 'https://www.example-oem.com/a.pdf',
      sourceType: 'other',
      discoveredBy: 'search',
      discoveredAt: 't',
    })!;
    expect(a.formatHint).toBe('pdf');
    const d = dedupeCandidates([a, b]);
    expect(d.unique).toHaveLength(1);
    expect(d.duplicates).toEqual([{ id: b.id, discoveredBy: 'search' }]);
  });

  it('research (Fable) output is validated field by field; garbage is rejected, not trusted', () => {
    const n = normalizeResearch(
      {
        candidates: [
          { url: 'https://ok.example-oem.com/x', sourceType: 'not-a-type', documentFormat: 'pdf' },
          { nope: 1 },
          42,
        ],
      },
      { adapter: 'fable', at: 't' },
    );
    expect(n.candidates).toHaveLength(1);
    expect(n.candidates[0]).toMatchObject({
      sourceType: 'other',
      formatHint: 'pdf',
      discoveredBy: 'fable',
    });
    expect(n.rejected.map((r) => r.index)).toEqual([1, 2]);
    expect(normalizeResearch('free text', { adapter: 'fable', at: 't' }).rejected[0].index).toBe(
      -1,
    );
  });
});

describe('vehicle applicability matching', () => {
  it('model mention: generation marks and engine labels are fine; other lines are not', () => {
    expect(namesModel('seat ibiza 6j 1.4 16v', 'Ibiza').exact).toBe(true);
    expect(namesModel('ford fiesta mk7 (2013-2017)', 'Fiesta').exact).toBe(true);
    expect(namesModel('ford fiesta st 200', 'Fiesta')).toEqual({ exact: false, variants: ['st'] });
    expect(namesModel('tesla model 3 and model y', 'Model 3').exact).toBe(true);
    expect(namesModel('tesla model y', 'Model 3').exact).toBe(false);
  });

  it('engine code: exact; a suffix variant is another engine unless explicitly aliased', () => {
    expect(matchDocument(docApp({ engineCodes: ['CGG'] }), IBIZA).status).toBe('EXACT');
    // No prefix / substring rule: CGGB is not CGG.
    expect(matchDocument(docApp({ engineCodes: ['CGGB'] }), IBIZA)).toMatchObject({
      status: 'NOT_APPLICABLE',
      dimensions: { engineCode: 'mismatch' },
    });
    expect(matchDocument(docApp({ engineCodes: ['CG'] }), IBIZA).status).toBe('NOT_APPLICABLE');
    // Only an explicit equivalence (SYNTHETIC test table) relates them — in either direction.
    const aliases = { CGG: ['CGGB'] };
    expect(matchDocument(docApp({ engineCodes: ['CGGB'] }), IBIZA, aliases)).toMatchObject({
      status: 'STRONG',
      dimensions: { engineCode: 'family' },
    });
    expect(
      matchDocument(docApp({ engineCodes: ['CGG'] }), fp('CGGB', '1390 סמ״ק'), aliases).status,
    ).not.toBe('NOT_APPLICABLE');
    expect(matchDocument(docApp({ engineCodes: ['CGGA'] }), IBIZA, aliases).status).toBe(
      'NOT_APPLICABLE',
    );
  });

  it('wrong engine code with the same displacement = CONFLICTING', () => {
    const snjb = fp('SNJB', '1242 סמ״ק');
    expect(
      matchDocument(
        docApp({ models: ['Ibiza'], engineCodes: ['SNJA'], displacementsCc: [1250] }),
        snjb,
      ).status,
    ).toBe('CONFLICTING');
  });

  it('wrong engine / year / fuel → NOT_APPLICABLE; unstated model → INSUFFICIENT; no years → PARTIAL', () => {
    expect(matchDocument(docApp({ displacementsCc: [1000, 1600] }), IBIZA).status).toBe(
      'NOT_APPLICABLE',
    );
    expect(matchDocument(docApp({ yearFrom: 2017, yearTo: 2021 }), IBIZA).status).toBe(
      'NOT_APPLICABLE',
    );
    expect(matchDocument(docApp({ fuels: ['diesel'] }), IBIZA).status).toBe('NOT_APPLICABLE');
    expect(matchDocument(docApp({ models: [] }), IBIZA).status).toBe('INSUFFICIENT');
    expect(matchDocument(docApp({ yearFrom: null, yearTo: null }), IBIZA).status).toBe('PARTIAL');
    expect(matchDocument(docApp(), IBIZA).status).toBe('SUPPORTED');
    expect(matchDocument(docApp({ displacementsCc: [1400] }), IBIZA).status).toBe('STRONG');
    // A page listing the whole engine range is generic: the mention does not make it STRONG.
    expect(
      matchDocument(docApp({ displacementsMentioned: [1000, 1200, 1400, 1600, 1800, 2000] }), IBIZA)
        .status,
    ).toBe('SUPPORTED');
    expect(matchDocument(docApp({ displacementsMentioned: [1390] }), IBIZA).status).toBe('STRONG');
  });

  it('row qualifiers: other-engine rows are rejected; regime-specific rows need the regime', () => {
    const doc = matchDocument(docApp(), IBIZA);
    const tdi = req({
      applicability: { ...req().applicability, displacementCc: { min: 1540, max: 1660 } },
    });
    expect(matchEvidence(doc, tdi, IBIZA).status).toBe('NOT_APPLICABLE');
    const diesel = req({ applicability: { ...req().applicability, powertrains: ['diesel'] } });
    expect(matchEvidence(doc, diesel, IBIZA).status).toBe('NOT_APPLICABLE');
    const qg1 = req({ applicability: { ...req().applicability, serviceRegimes: ['QG1'] } });
    expect(matchEvidence(doc, qg1, IBIZA).status).toBe('PARTIAL');
    expect(matchEvidence(doc, qg1, IBIZA, { serviceRegime: 'QG1' }).status).toBe('SUPPORTED');
    expect(matchEvidence(doc, qg1, IBIZA, { serviceRegime: 'QG0' }).status).toBe('NOT_APPLICABLE');
  });
});

describe('evidence resolution', () => {
  const src = (
    id: string,
    url: string,
    over: Partial<SourceProvenance> = {},
  ): SourceProvenance => ({
    sourceId: id,
    canonicalUrl: url,
    finalUrl: url,
    chain: [url],
    sourceName: id,
    sourceType: 'publication',
    discoveredBy: 'test',
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
    extractorVersion: 'x',
    msourceVersion: 'msource/1',
    ...over,
  });
  const ev = (
    id: string,
    sourceId: string,
    km: number,
    status: MatchStatus,
    markets: string[] = [],
  ): EvidenceRecord => ({
    ...toEvidenceRecord(
      {
        requirement: req({
          id,
          interval: {
            every: { value: km, unit: 'km' },
            everyMonths: 12,
            rule: 'whichever_first',
            first: null,
            repeats: true,
          },
          applicability: { markets },
        }),
        groundTokens: [],
        page: 1,
        locator: 'l',
        method: 'sentence',
      },
      sourceId,
      { status, dimensions: {}, reasons: [] },
      true,
    ),
  });
  const resolve = (
    sources: SourceProvenance[],
    evidence: EvidenceRecord[],
    official: string[] = [],
  ) =>
    resolveSchedule({
      fingerprintKey: 'k',
      market: 'IL',
      make: 'seat',
      sources,
      evidence,
      officialHost: (h) => official.includes(h),
      now: 't',
      acquiredSources: sources.length,
    });

  it('official source: its applicability decides (EXACT → EXACT, STRONG → STRONG, else SUPPORTED)', () => {
    const at = (status: MatchStatus) =>
      resolve(
        [src('a', 'https://www.seat-oem.com/m')],
        [ev('1', 'a', 15000, status)],
        ['www.seat-oem.com'],
      ).items[0];
    expect(at('EXACT')).toMatchObject({ quality: 'EXACT', officialSources: 1 });
    expect(at('STRONG')).toMatchObject({ quality: 'STRONG' });
    expect(at('SUPPORTED')).toMatchObject({ quality: 'SUPPORTED' });
  });

  it('ONE strongly applicable independent source → SUPPORTED (never EXACT); weak → INSUFFICIENT', () => {
    // The source presents a schedule (several operations), not one incidental sentence.
    const other = {
      ...ev('9', 'a', 30000, 'STRONG'),
      operationKey: 'brake_fluid' as const,
      task: 'brake_fluid' as const,
    };
    const one = (status: MatchStatus) =>
      resolve([src('a', 'https://blog.example-cars.com/m')], [ev('1', 'a', 15000, status), other]);
    const exact = one('EXACT');
    expect(exact.items.find((i) => i.task === 'engine_oil')).toMatchObject({
      quality: 'SUPPORTED',
      independentSources: 1,
      officialSources: 0,
      applicability: 'EXACT',
    });
    expect(exact.status).toBe('READY'); // engine oil is a core item
    expect(one('STRONG').items.find((i) => i.task === 'engine_oil')?.quality).toBe('SUPPORTED');
    const generic = one('SUPPORTED');
    expect(generic.items.some((i) => i.task === 'engine_oil')).toBe(false);
    expect(generic.unresolved.find((i) => i.task === 'engine_oil')?.quality).toBe('INSUFFICIENT');
    // Partial evidence never takes part.
    expect(one('PARTIAL').unresolved.some((i) => i.task === 'engine_oil')).toBe(false);
  });

  it('a second agreeing independent source raises the quality', () => {
    const two = resolve(
      [src('a', 'https://a.example-cars.com/x'), src('b', 'https://b.example-cars.org/x')],
      [ev('1', 'a', 15000, 'STRONG'), ev('2', 'b', 15000, 'STRONG')],
    );
    expect(two.items[0]).toMatchObject({ quality: 'STRONG', independentSources: 2 });
  });

  it('one incidental sentence (a source that presents no schedule) is INSUFFICIENT alone', () => {
    const r = resolve(
      [src('a', 'https://blog.example-cars.com/m')],
      [ev('1', 'a', 15000, 'EXACT')],
    );
    expect(r.items).toEqual([]);
    expect(r.unresolved[0].quality).toBe('INSUFFICIENT');
  });

  it('copies of the manufacturer manual on several hosts count once', () => {
    const r = resolve(
      [
        src('a', 'https://www.manuals-a.com/ibiza', { documentType: 'owners_manual' }),
        src('b', 'https://www.manuals-b.com/ibiza', { documentType: 'owners_manual' }),
      ],
      [
        ev('1', 'a', 15000, 'STRONG'),
        ev('2', 'b', 15000, 'STRONG'),
        {
          ...ev('3', 'a', 30000, 'STRONG'),
          operationKey: 'brake_fluid' as const,
          task: 'brake_fluid' as const,
        },
      ],
    );
    // One source (two copies), not two: SUPPORTED, never raised by its own copy.
    expect(r.items[0]).toMatchObject({ quality: 'SUPPORTED', independentSources: 1 });
  });

  it('more exact applicability outranks generic evidence; the outranked value is kept as a conflict', () => {
    const r = resolve(
      [
        src('a', 'https://a.example-cars.com/x'),
        src('b', 'https://b.example-cars.org/x'),
        src('c', 'https://www.seat-oem.com/m'),
      ],
      [
        ev('1', 'a', 15000, 'EXACT'),
        ev('2', 'b', 15000, 'EXACT'),
        ev('3', 'c', 30000, 'SUPPORTED'),
      ],
      ['www.seat-oem.com'],
    );
    expect(r.items[0]).toMatchObject({
      intervalKm: 15000,
      quality: 'EXACT',
      independentSources: 2,
    });
    expect(r.items[0].conflicts).toEqual([
      { intervalKm: 30000, intervalMonths: 12, evidenceIds: ['c:3'] },
    ]);
  });

  it("within one applicability tier the vehicle's market wins; otherwise different values conflict", () => {
    const sources = [
      src('a', 'https://a.example-cars.com/x'),
      src('b', 'https://b.example-cars.org/x'),
      src('c', 'https://c.example-cars.net/x'),
    ];
    const il = resolve(sources, [
      ev('1', 'a', 15000, 'STRONG', ['IL']),
      ev('2', 'b', 20000, 'STRONG'),
      ev('3', 'c', 15000, 'STRONG'),
    ]);
    expect(il.items[0]).toMatchObject({ intervalKm: 15000, independentSources: 2 });
    const tie = resolve(sources, [ev('1', 'a', 15000, 'STRONG'), ev('2', 'b', 20000, 'STRONG')]);
    expect(tie.unresolved[0]).toMatchObject({ quality: 'CONFLICTING', intervalKm: null });
  });

  it('ungrounded or non-applicable evidence never takes part', () => {
    const e = { ...ev('1', 'a', 15000, 'EXACT'), grounded: false };
    const r = resolve(
      [src('a', 'https://www.seat-oem.com/m')],
      [e, ev('2', 'a', 9000, 'NOT_APPLICABLE')],
      ['www.seat-oem.com'],
    );
    expect(r.items).toEqual([]);
    expect(r.unresolved).toEqual([]);
  });
});
