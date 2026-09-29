import {
  colorFamily,
  exteriorPhaseFromRegistry,
  vehicleClass,
  type RegistryPhaseFacts,
} from '../vehicleClass';

/** Evidence: docs/release/VEHICLE_IMAGE_RESOLVER_RESEARCH.md §4 (registry + VIN analysis). */
const ibiza = (f: Partial<RegistryPhaseFacts>): RegistryPhaseFacts => ({
  manufacturer: 'סיאט ספרד',
  modelCode: '6J52E4',
  ...f,
});

describe('exterior phase from registry facts: high-confidence rules only', () => {
  it('cd 26 is pre-facelift only for the first batch (production 2011 / registered ≤ 2012-01)', () => {
    expect(exteriorPhaseFromRegistry(ibiza({ homologationCode: 26, productionYear: 2011 }))).toBe(
      'pre-fl',
    );
    expect(
      exteriorPhaseFromRegistry(
        ibiza({ homologationCode: 26, productionYear: 2012, firstRegistration: '2012-1' }),
      ),
    ).toBe('pre-fl');
  });

  it('cd 26 registered Feb–Oct 2012 is ambiguous: no phase (the user is asked)', () => {
    for (const reg of ['2012-2', '2012-8', '2012-10']) {
      expect(
        exteriorPhaseFromRegistry(
          ibiza({
            homologationCode: 26,
            productionYear: 2012,
            firstRegistration: reg,
            vin: 'VSSZZZ6JZCR122118',
          }),
        ),
      ).toBeNull();
    }
  });

  it('model year from the VIN: 2013+ facelift, 2011 and earlier pre-facelift; cd 58 facelift', () => {
    expect(exteriorPhaseFromRegistry(ibiza({ vin: 'VSSZZZ6JZDR100001' }))).toBe('fl1');
    expect(exteriorPhaseFromRegistry(ibiza({ vin: 'VSSZZZ6JZBR100001' }))).toBe('pre-fl');
    expect(exteriorPhaseFromRegistry(ibiza({ vin: 'VSSZZZ6JZ9R100001' }))).toBe('pre-fl');
    expect(exteriorPhaseFromRegistry(ibiza({ homologationCode: 58 }))).toBe('fl1');
    // cd 45: medium-high only → not auto-resolved.
    expect(exteriorPhaseFromRegistry(ibiza({ homologationCode: 45 }))).toBeNull();
  });

  it('other makes/models: never a phase', () => {
    expect(
      exteriorPhaseFromRegistry({
        manufacturer: 'טויוטה',
        modelCode: 'ZRE181',
        vin: 'X'.repeat(17),
      }),
    ).toBeNull();
  });
});

describe('vehicle class key', () => {
  const car = {
    kind: 'car',
    manufacturer: 'סיאט ספרד',
    model: 'IBIZA',
    modelCode: '6J52E4',
    color: 'שחור מטלי',
  };

  it('known phase → exact key; unknown phase → one key per front (visual question)', () => {
    expect(vehicleClass({ ...car, exteriorPhase: 'pre-fl' })).toEqual({
      kind: 'key',
      key: 'v1/seat/ibiza/6j/pre-fl/hatchback-5d/black',
    });
    expect(vehicleClass(car)).toEqual({
      kind: 'needs_phase',
      keys: {
        'pre-fl': 'v1/seat/ibiza/6j/pre-fl/hatchback-5d/black',
        fl1: 'v1/seat/ibiza/6j/fl1/hatchback-5d/black',
      },
    });
  });

  it('the key never contains a plate, VIN or person; unknown color → "any"', () => {
    const r = vehicleClass({ ...car, color: undefined, exteriorPhase: 'fl1' });
    expect(r).toEqual({ kind: 'key', key: 'v1/seat/ibiza/6j/fl1/hatchback-5d/any' });
  });

  it('out of the approved scope → unsupported (other body, model, make, missing model code)', () => {
    // A different body is a different class (an estate never borrows a hatchback image).
    expect(vehicleClass({ ...car, modelCode: '6J8XXX', exteriorPhase: 'fl1' })).toEqual({
      kind: 'key',
      key: 'v1/seat/ibiza/6j/fl1/estate/black',
    });
    expect(vehicleClass({ ...car, modelCode: '6J7XXX' })).toEqual({ kind: 'unsupported' });
    expect(vehicleClass({ ...car, model: 'LEON' })).toEqual({ kind: 'unsupported' });
    expect(vehicleClass({ ...car, manufacturer: 'טויוטה' })).toEqual({ kind: 'unsupported' });
    expect(vehicleClass({ ...car, modelCode: undefined })).toEqual({ kind: 'unsupported' });
    expect(vehicleClass({ ...car, kind: 'motorcycle' })).toEqual({ kind: 'unsupported' });
  });

  it('registry colors map to families; unknown / multi-color is never guessed', () => {
    expect(colorFamily('שחור מטלי')).toBe('black');
    expect(colorFamily('שנהב לבן')).toBe('white');
    expect(colorFamily('כסף מטלי')).toBe('silver');
    expect(colorFamily('אפור מטל')).toBe('grey');
    expect(colorFamily('רב גווני')).toBeNull();
    expect(colorFamily('מלאנג מטאלי')).toBeNull();
    expect(colorFamily(undefined)).toBeNull();
  });
});
