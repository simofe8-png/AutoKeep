import {
  buildFingerprint,
  displacementCcOf,
  displacementLabels,
  fingerprintKey,
  normalizeEngineCodes,
  normalizeModel,
  vinPrefixOf,
  type VehicleFingerprint,
} from '../fingerprint';

export const FIESTA_INPUT = {
  kind: 'car' as const,
  manufacturer: 'פורד גרמניה',
  model: 'FIESTA',
  year: 2015,
  engine: '1242 סמ״ק',
  engineCode: 'SNJB',
  fuel: 'בנזין',
  transmission: 'ידני',
};
export const IBIZA_INPUT = {
  kind: 'car' as const,
  manufacturer: 'סיאט ספרד',
  model: 'IBIZA',
  year: 2012,
  engine: '1390 סמ״ק',
  engineCode: 'CGG',
  fuel: 'בנזין',
};

const fp = (input: Parameters<typeof buildFingerprint>[0]): VehicleFingerprint => {
  const r = buildFingerprint(input);
  if (!r.ok) throw new Error(r.missing.join(','));
  return r.fingerprint;
};

describe('fingerprint normalization', () => {
  it('normalizes the Ford Fiesta registry facts', () => {
    expect(fp(FIESTA_INPUT)).toEqual({
      kind: 'car',
      make: 'ford',
      makeLabel: 'Ford',
      model: 'Fiesta',
      modelYear: 2015,
      displacementCc: 1242,
      displacementLabels: ['1.2', '1.25'],
      engineCodes: ['SNJB'],
      fuelType: 'petrol',
      transmission: 'manual',
      market: 'IL',
      country: 'IL',
      manufacturerCountry: 'DE',
    });
  });

  it('normalizes the SEAT Ibiza with the registry engine code (CGG, not guessed CGGB)', () => {
    const f = fp(IBIZA_INPUT);
    expect(f).toMatchObject({
      make: 'seat',
      makeLabel: 'SEAT',
      model: 'Ibiza',
      engineCodes: ['CGG'],
      displacementLabels: ['1.4'],
      manufacturerCountry: 'ES',
    });
    expect(f.transmission).toBeUndefined();
    expect(f.generation).toBeUndefined();
  });

  it('casing, whitespace, separators and aliases', () => {
    expect(normalizeEngineCodes(' cggb ')).toEqual(['CGGB']);
    expect(normalizeEngineCodes('CGG/CGGB')).toEqual(['CGG', 'CGGB']);
    expect(normalizeEngineCodes('snj-b')).toEqual(['SNJB']);
    expect(normalizeEngineCodes('1234')).toEqual([]);
    expect(normalizeEngineCodes('')).toEqual([]);
    expect(normalizeModel('  model   3 ')).toBe('Model 3');
    expect(normalizeModel('c-hr')).toBe('C-HR');
    expect(fp({ ...FIESTA_INPUT, manufacturer: '  Ford ' }).make).toBe('ford');
  });

  it('displacement: cc only from cc values, never from a litre label', () => {
    expect(displacementCcOf('1242 סמ״ק')).toBe(1242);
    expect(displacementCcOf('1390cc')).toBe(1390);
    expect(displacementCcOf(1598)).toBe(1598);
    expect(displacementCcOf('1.4')).toBeUndefined();
    expect(displacementCcOf('14')).toBeUndefined();
    expect(displacementLabels(999)).toEqual(['1.0']);
    expect(displacementLabels(undefined)).toEqual([]);
  });

  it('never keeps more than the VIN prefix; masked characters end it', () => {
    expect(vinPrefixOf('VSSZZZ6JZCR122118')).toBe('VSSZZZ6JZ');
    expect(vinPrefixOf('WF0DXXGAKDF•••••')).toBe('WF0DXXGAK');
    expect(vinPrefixOf('VS')).toBeUndefined();
    const withVin = fp({ ...IBIZA_INPUT, vin: 'VSSZZZ6JZCR122118' });
    expect(JSON.stringify(withVin)).not.toContain('122118');
  });

  it('missing make / model / year is reported, never filled in', () => {
    expect(buildFingerprint({ ...FIESTA_INPUT, manufacturer: 'יצרן לא מוכר' })).toEqual({
      ok: false,
      missing: ['make'],
    });
    expect(buildFingerprint({ ...FIESTA_INPUT, model: ' ', year: 0 })).toEqual({
      ok: false,
      missing: ['model', 'modelYear'],
    });
  });

  it('the class key identifies a vehicle class, never a vehicle', () => {
    expect(fingerprintKey(fp({ ...FIESTA_INPUT, vin: 'WF0DXXGAKDFA12345' }))).toBe(
      'car|ford|fiesta|2015|1242|SNJB|petrol|manual',
    );
  });
});

describe('body variant', () => {
  it('body variant comes from registry body words, never from the model name', () => {
    expect(fp({ ...IBIZA_INPUT, body: "הצ'בק" }).bodyVariant).toBe('hatchback');
    expect(fp({ ...IBIZA_INPUT, body: 'סטיישן' }).bodyVariant).toBe('estate');
    expect(fp({ ...IBIZA_INPUT, body: 'Saloon' }).bodyVariant).toBe('sedan');
    expect(fp({ ...IBIZA_INPUT, model: 'Fiesta ST' }).bodyVariant).toBeUndefined();
  });
});
