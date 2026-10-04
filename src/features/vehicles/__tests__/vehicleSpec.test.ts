import { EMPTY_VEHICLE_SPEC } from '@/persistence/repositories/vehicleSpec';

import { formToSpec, hasSpec, specChips, specForTask, specToForm } from '../vehicleSpec';

/** "מפרט הרכב" helpers (owner decision 2026-10-05). SYNTHETIC values. */

describe('vehicle spec', () => {
  const spec = formToSpec({
    ...specToForm(undefined),
    oilViscosity: ' 5W-30 ',
    oilStandard: 'VW 504.00',
    brakeFluid: 'DOT 4',
    tirePressureFront: '2.3',
    tirePressureRear: '2.3',
    notes: '   ',
  });

  it('trimmed; empty is not entered', () => {
    expect(spec).toMatchObject({ oilViscosity: '5W-30', oilCapacity: null, notes: null });
    expect(hasSpec(EMPTY_VEHICLE_SPEC)).toBe(false);
    expect(hasSpec(spec)).toBe(true);
  });

  it('the matching task gets its line; others get nothing', () => {
    expect(specForTask('engine_oil', spec)).toBe('5W-30 · VW 504.00');
    expect(specForTask('brake_fluid', spec)).toBe('DOT 4');
    expect(specForTask('coolant', spec)).toBeNull();
    expect(specForTask('spark_plugs', spec)).toBeNull();
    expect(specForTask('engine_oil', undefined)).toBeNull();
  });

  it('short chips; equal pressures shown once', () => {
    expect(specChips(spec)).toEqual([
      { label: 'שמן', value: '5W-30 · VW 504.00' },
      { label: 'בלמים', value: 'DOT 4' },
      { label: 'לחץ', value: '2.3' },
    ]);
  });
});
