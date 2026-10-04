import type { MaintenanceRequirement } from '@/domain';

import { canonicalOperation, operationFromText, toEvidenceRecord } from '../evidence';
import { buildFingerprint, type VehicleFingerprint } from '../fingerprint';
import { matchDocument, matchEvidence, namesModel } from '../matcher';
import type { DocumentApplicability, MatchStatus } from '../types';

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
