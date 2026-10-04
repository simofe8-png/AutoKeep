import { ENGINE_FAMILIES, engineFamilyFor } from '../engineFamilyGuidance';
import { guidanceFor } from '../standardGuidance';

/**
 * Maintenance guidance (owner decisions 2026-10-03 / 2026-10-04): by engine family when the
 * registry engine code matches exactly, else by propulsion type. Never a schedule.
 */

const car = (manufacturer: string, engineCode?: string, fuel?: string) =>
  guidanceFor({ kind: 'car', manufacturer, engineCode, fuel });

describe('engineFamilyFor', () => {
  it('matches the exact registry engine code within the family makes', () => {
    expect(engineFamilyFor({ manufacturer: 'יונדאי', engineCode: 'G4FC' })?.id).toBe('g4fa');
    expect(engineFamilyFor({ manufacturer: "סקודה צ'כיה", engineCode: 'CJZA' })?.id).toBe(
      'ea211-12tsi',
    );
    expect(engineFamilyFor({ manufacturer: 'פורד גרמניה', engineCode: 'snj-b' })?.id).toBe(
      'duratec-125',
    );
  });

  it('never by substring, and never for another make with the same short code', () => {
    expect(engineFamilyFor({ manufacturer: 'יונדאי', engineCode: 'G4F' })).toBeNull();
    expect(engineFamilyFor({ manufacturer: 'יונדאי', engineCode: 'G4FCX' })).toBeNull();
    // "PE" is a Mazda family code: not for another make.
    expect(engineFamilyFor({ manufacturer: 'מאזדה', engineCode: 'PE' })?.id).toBe('pe');
    expect(engineFamilyFor({ manufacturer: "פיג'ו", engineCode: 'PE' })).toBeNull();
    // H5H is the Renault / Nissan / Dacia baseline only (owner decision: Mercedes excluded).
    expect(engineFamilyFor({ manufacturer: 'מרצדס', engineCode: 'H5H' })).toBeNull();
  });

  it('a bare code two families share is told apart by the registry fuel (else nothing)', () => {
    expect(engineFamilyFor({ manufacturer: 'טויוטה', engineCode: '2ZR', fuel: 'היבריד' })?.id).toBe(
      '2zr-fxe',
    );
    expect(engineFamilyFor({ manufacturer: 'טויוטה', engineCode: '2ZR', fuel: 'בנזין' })?.id).toBe(
      'zr-fae',
    );
    expect(engineFamilyFor({ manufacturer: 'טויוטה', engineCode: '2ZR' })).toBeNull();
    expect(engineFamilyFor({ manufacturer: 'טויוטה', engineCode: '2ZR-FXE' })?.id).toBe('2zr-fxe');
  });

  it('the data has no range and no duplicate exact code', () => {
    const seen = new Set<string>();
    for (const f of ENGINE_FAMILIES) {
      for (const c of f.codes) {
        const k = `${f.makes.join(',')}|${c}`;
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
      for (const i of f.intervals) expect(i.km != null || i.months != null).toBe(true);
    }
    expect(ENGINE_FAMILIES.length).toBeGreaterThanOrEqual(50);
  });
});

describe('guidanceFor', () => {
  it('engine family: the family name and its rows (owner resolutions applied)', () => {
    const g = car('סקודה', 'DADA', 'בנזין');
    expect(g.kind).toBe('engine_family');
    expect(g.family).toContain('1.5 TSI EA211 evo');
    // EA211 air filter standardized at 30,000 km / 24 months.
    expect(g.rows.find((r) => r.item === 'air_filter')?.interval).toBe(
      'כל 30,000 ק״מ או 24 חודשים',
    );
    const k = car('יונדאי', 'G4LA', 'בנזין');
    expect(k.rows.find((r) => r.item === 'coolant')?.interval).toBe(
      'לראשונה ב-120,000 ק״מ או 60 חודשים, ואחר כך כל 30,000 ק״מ',
    );
    const vw = car('פולקסווגן', 'CHZB');
    expect(vw.rows.find((r) => r.item === 'brake_fluid')?.interval).toBe(
      'לראשונה אחרי 36 חודשים, ואחר כך כל 24 חודשים',
    );
    expect(vw.rows.find((r) => r.item === 'timing_belt_inspection-inspect')?.label).toBe(
      'בדיקת רצועת טיימינג',
    );
  });

  it('no family: by propulsion type; spark plugs only for known spark-ignition fuels', () => {
    expect(car('פורד', undefined, 'בנזין')).toMatchObject({ kind: 'propulsion' });
    expect(car('פורד', undefined, 'בנזין').rows.map((r) => r.item)).toContain('spark_plugs');
    expect(car('פורד', undefined, 'דיזל').rows.map((r) => r.item)).not.toContain('spark_plugs');
    expect(car('טסלה', undefined, 'חשמל').rows.map((r) => r.item)).toEqual([
      'brake_fluid',
      'cabin_filter',
    ]);
  });

  it("two-wheelers: the owner's concrete values (no ranges)", () => {
    const g = guidanceFor({ kind: 'motorcycle', manufacturer: 'Honda', fuel: null });
    expect(g.rows.map((r) => [r.item, r.interval])).toEqual([
      ['oil_and_filter', 'כל 3,000 ק״מ או 12 חודשים'],
      ['spark_plugs', 'כל 6,000 ק״מ או 12 חודשים'],
      ['valve_clearance-inspect', 'כל 6,000 ק״מ או 12 חודשים'],
      ['brake_fluid', 'כל 12,000 ק״מ או 24 חודשים'],
    ]);
  });
});
