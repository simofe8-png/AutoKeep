import {
  isoDate,
  isVerifiedRequirement,
  type IsoDate,
  type MaintenanceRequirement,
  type RequirementApplicability,
  type RequirementAuthority,
  type TaskCode,
  type VehicleFacts,
} from '@/domain';

import {
  computeRequirementDue,
  evaluateApplicability,
  resolveRequirements,
  type TaskResolution,
} from '../requirements';

/**
 * M1 synthetic test matrix (owner task 2026-09-29). EVERY rule below is SYNTHETIC: invented
 * numbers on invented documents, used only to exercise the engine. None is a real manufacturer
 * or importer requirement, and none may be copied into the product catalog.
 */
const D = (s: string) => isoDate(s) as IsoDate;

let seq = 0;
function synth(
  task: TaskCode,
  interval: Partial<MaintenanceRequirement['interval']> & { km?: number; months?: number },
  applicability: RequirementApplicability,
  authority: RequirementAuthority = 'manufacturer',
  extra: Partial<MaintenanceRequirement> = {},
): MaintenanceRequirement {
  seq += 1;
  const { km, months, ...rest } = interval;
  return {
    id: `synthetic-${String(seq).padStart(3, '0')}`,
    task,
    action: 'replacement',
    interval: {
      every: km != null ? { value: km, unit: 'km' } : undefined,
      everyMonths: months,
      rule:
        km != null && months != null
          ? 'whichever_first'
          : km != null
            ? 'distance_only'
            : 'time_only',
      repeats: true,
      ...rest,
    },
    applicability,
    authority,
    evidence: [
      {
        documentId: `synthetic-doc-${authority}`,
        documentTitle: 'SYNTHETIC TEST DOCUMENT — not a real source',
        authority,
        markets: applicability.markets ?? [],
        page: 1,
        table: 'synthetic',
      },
    ],
    verification: 'verified',
    extraction: { method: 'synthetic_test', by: 'test', at: D('2026-09-29') },
    synthetic: true,
    ...extra,
  };
}
const task = (rs: TaskResolution[], t: TaskCode) => rs.find((r) => r.task === t)!;

const IBIZA = { makes: ['SEAT'], models: ['Ibiza'], engineCodes: ['CGG'], markets: ['EU'] };
const ibizaFacts: VehicleFacts = {
  kind: 'car',
  make: 'SEAT',
  model: 'Ibiza',
  modelYear: 2012,
  engineCode: 'CGG',
  market: 'IL',
};

describe('1. SEAT Ibiza 2012 / CGG — two service regimes (SYNTHETIC)', () => {
  const fixed = synth(
    'engine_oil',
    { km: 11111, months: 12 },
    { ...IBIZA, markets: ['GLOBAL'], serviceRegimes: ['QG0', 'QG2'] },
  );
  const flexible = synth(
    'engine_oil',
    { km: 22222, months: 24 },
    { ...IBIZA, markets: ['GLOBAL'], serviceRegimes: ['QG1'] },
  );

  it('an unknown regime chooses NEITHER and asks for the regime', () => {
    const r = task(resolveRequirements([fixed, flexible], ibizaFacts), 'engine_oil');
    expect(r.status).toBe('insufficient_information');
    expect(r.effective).toBeNull();
    expect(r.missing).toEqual(['serviceRegime']);
  });

  it('a known regime selects exactly its requirement', () => {
    const r = task(
      resolveRequirements([fixed, flexible], { ...ibizaFacts, serviceRegime: 'QG1' }),
      'engine_oil',
    );
    expect(r.status).toBe('resolved');
    expect(r.effective?.id).toBe(flexible.id);
    expect(r.considered.find((c) => c.requirement.id === fixed.id)?.role).toBe('not_applicable');
  });
});

describe('2. Ford Fiesta 2015 / 1.25 — Israeli override for ONE item (SYNTHETIC)', () => {
  const FIESTA = { makes: ['Ford'], models: ['Fiesta'], modelYears: { from: 2013, to: 2017 } };
  const facts: VehicleFacts = {
    kind: 'car',
    make: 'Ford',
    model: 'Fiesta',
    modelYear: 2015,
    displacementCc: 1242,
    engineCode: 'SNJB',
    market: 'IL',
  };
  const genericOil = synth(
    'engine_oil',
    { km: 33333, months: 12 },
    { ...FIESTA, markets: ['GLOBAL'] },
  );
  const genericPlugs = synth(
    'spark_plugs',
    { km: 44444, months: 36 },
    { ...FIESTA, markets: ['GLOBAL'] },
  );
  const ilOil = synth(
    'engine_oil',
    { km: 12121, months: 12 },
    { ...FIESTA, markets: ['IL'] },
    'importer',
  );

  it('only the overridden item changes; the other keeps the generic requirement', () => {
    const rs = resolveRequirements([genericOil, genericPlugs, ilOil], facts);
    const oil = task(rs, 'engine_oil');
    expect(oil.status).toBe('resolved');
    expect(oil.effective?.id).toBe(ilOil.id);
    expect(oil.reason).toBe('market_override');
    // Both claims and sources are preserved.
    expect(oil.considered.map((c) => [c.requirement.id, c.role])).toEqual(
      expect.arrayContaining([
        [ilOil.id, 'effective'],
        [genericOil.id, 'overridden'],
      ]),
    );
    const plugs = task(rs, 'spark_plugs');
    expect(plugs.effective?.id).toBe(genericPlugs.id);
    expect(plugs.reason).toBe('single_source');
  });

  it('the override does not apply outside its market', () => {
    const rs = resolveRequirements([genericOil, ilOil], { ...facts, market: 'EU' });
    expect(task(rs, 'engine_oil').effective?.id).toBe(genericOil.id);
  });

  it('a US-market document for the exact vehicle is level B (market not proven), never level A', () => {
    // Owner decision 2026-09-29: another market caps official evidence at B (labelled), it no
    // longer excludes it; an Israeli (level A) requirement still wins for that one task.
    const us = synth('timing_belt', { km: 55555 }, { ...FIESTA, markets: ['US'] });
    const r = task(resolveRequirements([us], facts), 'timing_belt');
    expect(r).toMatchObject({ status: 'resolved', level: 'B' });
    const il = synth('timing_belt', { km: 44444 }, { ...FIESTA, markets: ['IL'] });
    const both = task(resolveRequirements([us, il], facts), 'timing_belt');
    expect(both).toMatchObject({ status: 'resolved', level: 'A', reason: 'market_override' });
    expect(both.effective?.id).toBe(il.id);
  });

  it('a US schedule for an engine the vehicle does not have never applies', () => {
    const us = synth(
      'timing_belt',
      { km: 55555 },
      { ...FIESTA, engineCodes: ['XYZ9'], markets: ['US'] },
    );
    const r = task(resolveRequirements([us], facts), 'timing_belt');
    expect(r.status).toBe('not_applicable');
    expect(r.considered[0].level).toBeNull();
  });
});

describe('3. motorcycle — whichever first (SYNTHETIC)', () => {
  const moto = synth(
    'engine_oil',
    { km: 6000, months: 12 },
    { kinds: ['motorcycle'], makes: ['SyntheticMoto'], markets: ['GLOBAL'] },
  );
  const facts: VehicleFacts = { kind: 'motorcycle', make: 'SyntheticMoto', market: 'IL' };

  it('the distance limit comes first', () => {
    const due = computeRequirementDue({
      requirement: task(resolveRequirements([moto], facts), 'engine_oil').effective!,
      today: D('2026-03-01'),
      readings: [
        { date: D('2026-01-01'), km: 10000 },
        { date: D('2026-03-01'), km: 15800 },
      ],
      lastCompletion: { date: D('2026-01-01'), odometerKm: 10000 },
    });
    expect(due).toMatchObject({
      status: 'computed',
      nextKm: 16000,
      remainingKm: 200,
      state: 'upcoming',
    });
    if (due.status === 'computed') {
      expect(due.nextDate).toBe('2027-01-01');
      expect(due.kmForecast?.kind).toBe('forecast'); // a forecast, labelled as such
    }
  });

  it('the time limit comes first; past it with a recorded completion = overdue', () => {
    const due = computeRequirementDue({
      requirement: moto,
      today: D('2027-02-01'),
      readings: [{ date: D('2027-02-01'), km: 11000 }],
      lastCompletion: { date: D('2026-01-01'), odometerKm: 10000 },
    });
    expect(due).toMatchObject({ status: 'computed', remainingKm: 5000, state: 'overdue' });
  });
});

describe('4. EV — no ICE oil requirement (SYNTHETIC)', () => {
  it('an engine-oil requirement limited to combustion powertrains does not apply to an EV', () => {
    const oil = synth(
      'engine_oil',
      { km: 15000, months: 12 },
      { makes: ['SyntheticEV'], powertrains: ['petrol', 'diesel', 'hybrid'], markets: ['GLOBAL'] },
    );
    const coolant = synth(
      'ev_battery_coolant',
      { months: 48 },
      { makes: ['SyntheticEV'], powertrains: ['electric'], markets: ['GLOBAL'] },
    );
    const rs = resolveRequirements([oil, coolant], {
      kind: 'car',
      make: 'SyntheticEV',
      powertrain: 'electric',
      market: 'IL',
    });
    expect(task(rs, 'engine_oil').status).toBe('not_applicable');
    expect(task(rs, 'ev_battery_coolant').status).toBe('resolved');
  });
});

describe('5. unresolved conflict (SYNTHETIC)', () => {
  it('two applicable sources at the same precedence disagreeing → conflicting, no interval', () => {
    const a = synth('brake_fluid', { months: 24 }, { makes: ['X'], markets: ['IL'] });
    const b = synth('brake_fluid', { months: 36 }, { makes: ['X'], markets: ['IL'] });
    const r = task(resolveRequirements([a, b], { make: 'X', market: 'IL' }), 'brake_fluid');
    expect(r.status).toBe('conflicting');
    expect(r.effective).toBeNull();
    expect(r.considered.filter((c) => c.role === 'conflicting')).toHaveLength(2);
  });

  it('agreeing sources resolve (and are both kept)', () => {
    const a = synth('brake_fluid', { months: 24 }, { makes: ['X'], markets: ['IL'] });
    const b = synth('brake_fluid', { months: 24 }, { makes: ['X'], markets: ['IL'] });
    const r = task(resolveRequirements([a, b], { make: 'X', market: 'IL' }), 'brake_fluid');
    expect(r).toMatchObject({ status: 'resolved', reason: 'agreeing_sources' });
    expect(r.considered.map((c) => c.role).sort()).toEqual(['effective', 'supporting']);
  });
});

describe('6. missing engine code (SYNTHETIC)', () => {
  it('a requirement limited to an engine code is not applied when the code is unknown', () => {
    const belt = synth('timing_belt', { km: 77777, months: 60 }, IBIZA);
    const facts: VehicleFacts = { ...ibizaFacts, engineCode: undefined, market: 'EU' };
    expect(evaluateApplicability(belt.applicability, facts)).toMatchObject({
      verdict: 'insufficient_information',
      missing: ['engineCode'],
    });
    const r = task(resolveRequirements([belt], facts), 'timing_belt');
    expect(r).toMatchObject({ status: 'insufficient_information', missing: ['engineCode'] });
  });

  it('an unknown-fact requirement that could outrank the applicable one blocks resolution', () => {
    const generic = synth('engine_oil', { km: 30000 }, { makes: ['SEAT'], markets: ['GLOBAL'] });
    const ilSpecific = synth(
      'engine_oil',
      { km: 10000 },
      { makes: ['SEAT'], engineCodes: ['CGG'], markets: ['IL'] },
      'importer',
    );
    const r = task(
      resolveRequirements([generic, ilSpecific], { make: 'SEAT', market: 'IL' }),
      'engine_oil',
    );
    expect(r).toMatchObject({ status: 'insufficient_information', missing: ['engineCode'] });
  });
});

describe('7. severe use vs normal (SYNTHETIC)', () => {
  const normal = synth(
    'engine_oil',
    { km: 20000 },
    { makes: ['X'], usage: 'normal', markets: ['GLOBAL'] },
  );
  const severe = synth(
    'engine_oil',
    { km: 10000 },
    { makes: ['X'], usage: 'severe', markets: ['GLOBAL'] },
  );
  it.each([
    ['normal', normal.id],
    ['severe', severe.id],
  ] as const)('%s use selects its variant', (usage, id) => {
    const r = task(
      resolveRequirements([normal, severe], { make: 'X', market: 'IL', usage }),
      'engine_oil',
    );
    expect(r.effective?.id).toBe(id);
  });
  it('unknown use asks instead of assuming normal', () => {
    const r = task(
      resolveRequirements([normal, severe], { make: 'X', market: 'IL' }),
      'engine_oil',
    );
    expect(r).toMatchObject({ status: 'insufficient_information', missing: ['usage'] });
  });
});

describe('8. time-based requirement from the first-registration date (SYNTHETIC)', () => {
  const fluid = synth(
    'brake_fluid',
    { months: 24, firstMonths: 36 },
    { makes: ['X'], markets: ['GLOBAL'] },
  );
  it('from new: first at 36 months, then every 24; missing history is never "overdue"', () => {
    const due = computeRequirementDue({
      requirement: fluid,
      today: D('2026-09-29'),
      readings: [],
      inServiceDate: D('2021-06-15'),
    });
    // 2021-06-15 + 36 months = 2024-06-15 (passed) → + 24 = 2026-06-15 (passed) → 2028-06-15.
    expect(due).toMatchObject({ status: 'computed', nextDate: '2028-06-15', basis: 'from_new' });
    if (due.status === 'computed') expect(due.state).not.toBe('overdue');
  });
  it('without an in-service date or a completion the time due is UNKNOWN, not guessed', () => {
    expect(
      computeRequirementDue({ requirement: fluid, today: D('2026-09-29'), readings: [] }),
    ).toEqual({ status: 'insufficient_information', missing: ['in_service_date'] });
  });
  it('whichever-first with no odometer: the known dimension is computed, the other is flagged', () => {
    const r = synth('general_inspection', { km: 15000, months: 12 }, { makes: ['X'] });
    const due = computeRequirementDue({
      requirement: r,
      today: D('2026-09-29'),
      readings: [],
      lastCompletion: { date: D('2026-03-01'), odometerKm: 50000 },
    });
    expect(due).toMatchObject({
      status: 'computed',
      nextKm: 65000,
      remainingKm: null,
      nextDate: '2027-03-01',
    });
    if (due.status === 'computed') expect(due.unknown).toEqual([]);
  });
});

describe('evidence and trust rules', () => {
  const base = synth('engine_oil', { km: 10000 }, { makes: ['X'] });
  it('AI output alone is never verified evidence; a reviewed AI candidate can be', () => {
    const ai = {
      ...base,
      extraction: { method: 'ai_candidate' as const, by: 'model', at: D('2026-09-29') },
    };
    expect(isVerifiedRequirement(ai)).toBe(false);
    expect(
      isVerifiedRequirement({ ...ai, extraction: { ...ai.extraction, reviewedBy: 'curator' } }),
    ).toBe(true);
  });
  it('secondary sources and user reports can never be verified; unlocated evidence neither', () => {
    expect(isVerifiedRequirement({ ...base, authority: 'secondary' })).toBe(false);
    expect(isVerifiedRequirement({ ...base, authority: 'user_report' })).toBe(false);
    expect(
      isVerifiedRequirement({
        ...base,
        evidence: [{ ...base.evidence[0], page: undefined, table: undefined }],
      }),
    ).toBe(false);
  });
  it('only unverified evidence → no effective requirement', () => {
    const r = task(
      resolveRequirements([{ ...base, verification: 'candidate' }], { make: 'X' }),
      'engine_oil',
    );
    expect(r).toMatchObject({ status: 'unverified_only', effective: null });
  });
  it('miles stay miles in the source; km are derived deterministically', () => {
    const mi = synth(
      'engine_oil',
      { every: { value: 10000, unit: 'mi' }, rule: 'distance_only' },
      { makes: ['X'] },
    );
    const due = computeRequirementDue({
      requirement: mi,
      today: D('2026-09-29'),
      readings: [{ date: D('2026-09-29'), km: 1000 }],
      lastCompletion: { date: D('2026-09-01'), odometerKm: 0 },
    });
    expect(mi.interval.every).toEqual({ value: 10000, unit: 'mi' });
    expect(due).toMatchObject({ nextKm: 16093 });
  });
});
