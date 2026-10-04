import type { MaintenanceRequirement } from '@/domain';

import { buildFingerprint, type VehicleFingerprint } from '../fingerprint';
import { matchItem, sectionContextOf } from '../matcher';
import type { DocumentApplicability } from '../types';

/**
 * Item-level applicability of an item read from the owner's document (owner correction
 * 2026-10-02). SYNTHETIC fixtures: invented intervals.
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
