import { standardGuidance } from '../standardGuidance';

/** Standard guidance by propulsion type (owner decision 2026-10-03, separate guidance card). */

const keys = (kind: Parameters<typeof standardGuidance>[0], fuel?: string) =>
  standardGuidance(kind, fuel).map((r) => r.key);

describe('standardGuidance', () => {
  it('petrol car: oil + filter, air, cabin, brake fluid and spark plugs', () => {
    expect(keys('car', 'בנזין')).toEqual([
      'engine_oil',
      'air_filter',
      'cabin_filter',
      'brake_fluid',
      'spark_plugs',
    ]);
    expect(standardGuidance('car', 'בנזין')[0]).toEqual({
      key: 'engine_oil',
      label: 'שמן מנוע ומסנן שמן',
      interval: 'כל 15,000 ק״מ או שנה',
    });
  });

  it('never spark plugs for a diesel or an unknown fuel', () => {
    expect(keys('car', 'דיזל')).not.toContain('spark_plugs');
    expect(keys('car')).not.toContain('spark_plugs');
  });

  it('electric: no engine items', () => {
    expect(keys('car', 'חשמל')).toEqual(['brake_fluid', 'cabin_filter']);
  });

  it('motorcycles and scooters: oil, spark plug and valve clearance at 3,000–6,000 km', () => {
    const rows = standardGuidance('motorcycle', 'בנזין');
    expect(rows.map((r) => r.key)).toEqual(['engine_oil', 'spark_plugs', 'valve_clearance']);
    expect(rows.every((r) => r.interval === 'כל 3,000–6,000 ק״מ')).toBe(true);
    expect(keys('scooter')).toEqual(['engine_oil', 'spark_plugs', 'valve_clearance']);
  });
});
