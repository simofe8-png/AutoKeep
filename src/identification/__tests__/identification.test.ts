import { createVehicle, createLocalProfile } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import {
  screenAcquiredFile,
  ACCEPTED_IMAGE_TYPES,
  type AcquisitionResult,
} from '@/providers/acquisition/types';
import { MockRegistrationExtractor } from '@/providers/registration/mockExtractor';

import { parseExtraction } from '../contract';
import {
  applyUserInput,
  confirmUncertain,
  draftFromExtraction,
  manualDraft,
  missingFields,
  recognizeType,
  resolveIdentification,
  toVehicleInput,
  uncertainFields,
  type VehicleVariant,
} from '../engine';
import { emptyCatalog, identifyFromAcquisition, type VehicleCatalog } from '../pipeline';

const YEAR = 2026;
const acquired: AcquisitionResult = {
  status: 'acquired',
  file: {
    uri: 'file:///cache/license.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 200_000,
    source: 'camera',
  },
};

const f = (value: string, confidence = 0.97) => ({ value, confidence });
const fullLicense = {
  documentType: 'vehicle_license',
  fields: {
    registration: f('45-678-90'),
    manufacturer: f('מאזדה'),
    model: f('3'),
    year: f('2020'),
    engine: f('2.0'),
    fuel: f('בנזין'),
    vin: f('JM1BP0000L0000001'),
    vehicleCategory: f('פרטי'),
  },
};

describe('acquisition boundary (T051)', () => {
  it('screens type and size before any processing', () => {
    const base = { uri: 'file:///x', sizeBytes: 10, source: 'library' as const };
    expect(
      screenAcquiredFile({ ...base, mimeType: 'text/html' }, ACCEPTED_IMAGE_TYPES).status,
    ).toBe('rejected');
    expect(
      screenAcquiredFile({ ...base, mimeType: 'image/png', sizeBytes: 0 }, ACCEPTED_IMAGE_TYPES),
    ).toEqual({
      status: 'rejected',
      reason: 'empty',
    });
    expect(
      screenAcquiredFile(
        { ...base, mimeType: 'image/png', sizeBytes: 60 * 1024 * 1024 },
        ACCEPTED_IMAGE_TYPES,
      ),
    ).toEqual({ status: 'rejected', reason: 'too_large' });
    expect(
      screenAcquiredFile({ ...base, mimeType: 'image/png' }, ACCEPTED_IMAGE_TYPES).status,
    ).toBe('acquired');
  });

  it('cancel / denied permission are returned in context (no dead end)', async () => {
    const ex = new MockRegistrationExtractor(() => fullLicense);
    expect(await identifyFromAcquisition({ status: 'cancelled' }, ex, emptyCatalog, YEAR)).toEqual({
      kind: 'acquisition',
      result: { status: 'cancelled' },
    });
    expect(
      await identifyFromAcquisition({ status: 'permission_denied' }, ex, emptyCatalog, YEAR),
    ).toEqual({
      kind: 'acquisition',
      result: { status: 'permission_denied' },
    });
  });
});

describe('extraction contract (T052)', () => {
  it('rejects malformed provider output instead of guessing', () => {
    expect(parseExtraction({ fields: { registration: 'x' } })).toBeNull();
    expect(
      parseExtraction({ documentType: 'vehicle_license', fields: { year: f('2020', 1.5) } }),
    ).toBeNull();
  });

  it('strips personal data the contract does not allow (owner name, ID)', () => {
    const parsed = parseExtraction({
      ...fullLicense,
      ownerName: 'ישראל ישראלי',
      fields: { ...fullLicense.fields, ownerId: f('123456789') },
    });
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed)).not.toMatch(/ישראל ישראלי|123456789|owner/);
  });
});

describe('vehicle type recognition (T053)', () => {
  it('recognizes cars and explicit two-wheeler kinds deterministically', () => {
    expect(recognizeType('פרטי')).toEqual({ status: 'recognized', type: 'car' });
    expect(recognizeType('M1')).toEqual({ status: 'recognized', type: 'car' });
    expect(recognizeType('אופנוע')).toEqual({ status: 'recognized', type: 'motorcycle' });
    expect(recognizeType('קטנוע')).toEqual({ status: 'recognized', type: 'scooter' });
  });

  it('does not guess between motorcycle and scooter', () => {
    expect(recognizeType('L3')).toEqual({
      status: 'ambiguous',
      options: ['motorcycle', 'scooter'],
    });
    expect(recognizeType('משאית')).toEqual({ status: 'unknown' });
    expect(recognizeType(undefined)).toEqual({ status: 'unknown' });
  });
});

describe('confidence & ambiguity (T054)', () => {
  it('accepts high confidence, flags medium, drops low or malformed values', () => {
    const ex = parseExtraction({
      documentType: 'vehicle_license',
      fields: {
        registration: f('12-345-67', 0.95),
        manufacturer: f('טויוטה', 0.75),
        model: f('קורולה', 0.4),
        year: f('3020', 0.99),
        vin: f('NOT-A-VIN', 0.99),
      },
    })!;
    const { draft } = draftFromExtraction(ex, YEAR);
    expect(draft.registration).toMatchObject({ origin: 'scan', uncertain: false });
    expect(draft.manufacturer).toMatchObject({ uncertain: true });
    expect(draft.model).toBeUndefined();
    expect(draft.year).toBeUndefined();
    expect(draft.vin).toBeUndefined();
    expect(uncertainFields(draft)).toEqual(['manufacturer']);
  });

  it('several exact candidates require a user choice; one candidate fills gaps as "catalog"', () => {
    const partial = parseExtraction({
      documentType: 'vehicle_license',
      fields: {
        registration: f('77-123-45'),
        manufacturer: f('סאן יאנג'),
        model: f('Joymax Z'),
        year: f('2021'),
        vehicleCategory: f('L3'),
      },
    });
    const variants: VehicleVariant[] = [
      {
        manufacturer: 'סאן יאנג',
        model: 'Joymax Z',
        year: 2021,
        engine: '300',
        trim: 'ABS',
        type: 'scooter',
      },
      {
        manufacturer: 'סאן יאנג',
        model: 'Joymax Z',
        year: 2021,
        engine: '300',
        trim: 'ABS+TCS',
        type: 'scooter',
      },
    ];
    expect(resolveIdentification(partial, variants, YEAR).kind).toBe('needs_selection');
    const one = resolveIdentification(partial, [variants[0]], YEAR);
    expect(one.kind).toBe('draft');
    if (one.kind !== 'draft') return;
    expect(one.draft.engine).toMatchObject({ value: '300', origin: 'catalog' });
    expect(one.draft.manufacturer?.origin).toBe('scan'); // scanned values are never overwritten
    expect(one.missing).toEqual([]);
  });

  it('a non-license document fails in context', () => {
    expect(resolveIdentification({ documentType: 'unknown', fields: {} }, [], YEAR)).toEqual({
      kind: 'failed',
      reason: 'not_a_license',
    });
  });
});

describe('confirmation & missing-fields engine (T055)', () => {
  it('asks only for missing necessary fields and blocks until uncertain values are checked', () => {
    const ex = parseExtraction({
      ...fullLicense,
      fields: { ...fullLicense.fields, engine: undefined, model: f('3', 0.8) },
    })!;
    const { draft } = draftFromExtraction(ex, YEAR);
    expect(missingFields(draft)).toEqual(['engine']);
    const profile = createLocalProfile(sequentialIds(), T0);
    expect(toVehicleInput(draft, profile.id)).toEqual({
      ready: false,
      missing: ['engine'],
      uncertain: ['model'],
    });

    const filled = applyUserInput(draft, { engine: '2.0', year: '1800' }, YEAR);
    expect(filled.errors).toEqual([{ field: 'year', code: 'invalid' }]);
    expect(filled.draft.engine).toMatchObject({ origin: 'user' });
    expect(filled.draft.year?.origin).toBe('scan'); // invalid input does not replace a good value

    const checked = confirmUncertain(filled.draft, 'model');
    const ready = toVehicleInput(checked, profile.id);
    expect(ready.ready).toBe(true);
    if (!ready.ready) return;
    const vehicle = createVehicle(ready.input, sequentialIds(100), T0);
    expect(vehicle.ok && vehicle.value.type).toBe('car');
    expect(vehicle.ok && vehicle.value.registration).toBe('4567890');
  });
});

describe('manual fallback (T056)', () => {
  it('produces the same draft shape, all user-entered, validated', () => {
    const { draft, errors } = manualDraft(
      {
        type: 'scooter',
        manufacturer: 'ימאהה',
        model: 'XMAX 300',
        year: '2022',
        registration: '98-765-43',
        engine: '300',
        vin: 'bad',
      },
      YEAR,
    );
    expect(errors).toEqual([{ field: 'vin', code: 'invalid' }]);
    expect(Object.values(draft).every((v) => v?.origin === 'user')).toBe(true);
    expect(missingFields(draft)).toEqual([]);
  });
});

describe('identification acceptance (T057)', () => {
  const catalog = (variants: VehicleVariant[]): VehicleCatalog => ({
    variantsFor: async () => variants,
  });

  it('full license scan → complete draft ready for confirmation', async () => {
    const r = await identifyFromAcquisition(
      acquired,
      new MockRegistrationExtractor(() => fullLicense),
      emptyCatalog,
      YEAR,
    );
    expect(r.kind).toBe('draft');
    if (r.kind === 'draft') {
      expect(r.missing).toEqual([]);
      expect(r.draft.type?.value).toBe('car');
    }
  });

  it('unreadable scan and provider errors fail in context', async () => {
    expect(
      await identifyFromAcquisition(
        acquired,
        new MockRegistrationExtractor(() => 'unreadable'),
        emptyCatalog,
        YEAR,
      ),
    ).toEqual({ kind: 'failed', reason: 'unreadable' });
    expect(
      await identifyFromAcquisition(
        acquired,
        new MockRegistrationExtractor(() => new Error('timeout')),
        emptyCatalog,
        YEAR,
      ),
    ).toEqual({ kind: 'failed', reason: 'error' });
    expect(
      await identifyFromAcquisition(
        acquired,
        new MockRegistrationExtractor(() => ({ junk: true })),
        emptyCatalog,
        YEAR,
      ),
    ).toEqual({ kind: 'failed', reason: 'unreadable' });
  });

  it('two-wheeler with ambiguous category asks for the type instead of guessing', async () => {
    const moto = {
      documentType: 'vehicle_license',
      fields: {
        registration: f('321-65-987'),
        manufacturer: f('קוואסאקי'),
        model: f('Z650'),
        year: f('2023'),
        engine: f('650'),
        vehicleCategory: f('L3'),
      },
    };
    const r = await identifyFromAcquisition(
      acquired,
      new MockRegistrationExtractor(() => moto),
      emptyCatalog,
      YEAR,
    );
    expect(r.kind === 'draft' && r.missing).toEqual(['type']);
  });

  it('ambiguous catalog match surfaces candidates for selection', async () => {
    const r = await identifyFromAcquisition(
      acquired,
      new MockRegistrationExtractor(() => fullLicense),
      catalog([
        { manufacturer: 'מאזדה', model: '3', year: 2020, trim: 'Comfort' },
        { manufacturer: 'מאזדה', model: '3', year: 2020, trim: 'Premium' },
      ]),
      YEAR,
    );
    expect(r.kind).toBe('needs_selection');
  });
});
