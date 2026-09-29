import {
  isoDate,
  type MaintenanceRequirement,
  type RequirementApplicability,
  type VehicleFacts,
} from '@/domain';

import { assessEvidence, evaluateApplicability, resolveRequirements } from '../requirements';

/** M-SOURCE Step 9 — representative applicability cases (SYNTHETIC requirements). */
const req = (applicability: RequirementApplicability, every = 15000): MaintenanceRequirement => ({
  id: `synthetic-${JSON.stringify(applicability).length}-${every}`,
  task: 'engine_oil',
  action: 'replacement',
  interval: { every: { value: every, unit: 'km' }, rule: 'distance_only', repeats: true },
  applicability,
  authority: 'manufacturer',
  evidence: [
    {
      documentId: 'd',
      documentTitle: 'SYNTHETIC',
      authority: 'manufacturer',
      markets: ['EU'],
      page: 1,
      documentSha256: 'a'.repeat(64),
    },
  ],
  verification: 'verified',
  extraction: { method: 'curated', by: 'test', at: isoDate('2026-09-30') },
});

const car: VehicleFacts = {
  kind: 'car',
  make: 'synthcar',
  model: 'Alpha',
  modelYear: 2019,
  market: 'IL',
};

describe('each dimension: match → applies, unknown → insufficient (never scheduled), mismatch → excluded', () => {
  const cases: [string, RequirementApplicability, Partial<VehicleFacts>, Partial<VehicleFacts>][] =
    [
      ['engine code', { engineCodes: ['ABC'] }, { engineCode: 'abc' }, { engineCode: 'XYZ' }],
      [
        'engine family',
        { engineFamilies: ['EA211'] },
        { engineFamily: 'EA211' },
        { engineFamily: 'EA888' },
      ],
      ['generation', { generations: ['MK7'] }, { generation: 'mk7' }, { generation: 'MK8' }],
      ['facelift / phase', { phases: ['FL'] }, { phase: 'FL' }, { phase: 'PRE-FL' }],
      [
        'production period',
        { productionPeriod: { from: isoDate('2018-06-01'), to: isoDate('2020-05-31') } },
        { productionDate: isoDate('2019-02-01') },
        { productionDate: isoDate('2021-01-01') },
      ],
      [
        'model year',
        { modelYears: { from: 2017, to: 2020 } },
        { modelYear: 2019 },
        { modelYear: 2022 },
      ],
      [
        'fuel / powertrain',
        { powertrains: ['diesel'] },
        { powertrain: 'diesel' },
        { powertrain: 'petrol' },
      ],
      ['gearbox', { transmissions: ['dct'] }, { transmission: 'dct' }, { transmission: 'manual' }],
      [
        'service regime',
        { serviceRegimes: ['QG1'] },
        { serviceRegime: 'qg1' },
        { serviceRegime: 'QG2' },
      ],
      ['normal / severe', { usage: 'severe' }, { usage: 'severe' }, { usage: 'normal' }],
    ];
  it.each(cases)('%s', (_, a, match, mismatch) => {
    const unknown: VehicleFacts = { ...car, modelYear: a.modelYears ? undefined : car.modelYear };
    expect(evaluateApplicability(a, { ...car, ...match }).verdict).toBe('applies');
    expect(evaluateApplicability(a, unknown).verdict).toBe('insufficient_information');
    expect(evaluateApplicability(a, { ...car, ...mismatch }).verdict).toBe('does_not_apply');
    const r = resolveRequirements([req(a)], unknown)[0];
    expect(r.status).toBe('insufficient_information');
    expect(r.effective).toBeNull();
  });
});

describe('source coverage', () => {
  it('a manual on a generic model page that never states model years is not scheduled (level C)', () => {
    const a = { makes: ['synthcar'], models: ['Alpha'], coverageUnknown: ['modelYear' as const] };
    expect(assessEvidence(req(a), car).level).toBe('C');
    expect(resolveRequirements([req(a)], car)[0].status).toBe('insufficient_information');
  });

  it('displacement constrains only when the source states it; it never stands in for the engine code', () => {
    const byCode = req({ engineCodes: ['ABC'] });
    // A vehicle with only a displacement known: the engine-code requirement stays unresolved.
    const r = resolveRequirements([byCode], { ...car, displacementCc: 1395 })[0];
    expect(r).toMatchObject({ status: 'insufficient_information', missing: ['engineCode'] });
    // A source that states a displacement (e.g. an importer table keyed by engine size) applies by it.
    expect(
      evaluateApplicability(
        { displacementCc: { min: 1335, max: 1455 } },
        { ...car, displacementCc: 1395 },
      ).verdict,
    ).toBe('applies');
  });
});
