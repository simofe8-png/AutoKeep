import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import type { OnboardingServices } from '@/features/onboarding/services';
import type { OcrTextLine } from '@/identification/plateCandidates';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { localLicenseOcr, type LicenseOcr } from '@/providers/ocr/localLicenseOcr';
import type { VehicleRegistryProvider } from '@/providers/registry/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * License-scan flow: camera (+ crop) → on-device OCR (FAKE here; the real
 * module is Tesseract, device-verified separately) → plate candidate → user confirms/corrects →
 * registry lookup with consent → confirm screen. OCR is never authoritative; owner data seen by
 * OCR is never shown, stored or logged. All data below is SYNTHETIC.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-28T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-28') as IsoDate,
};

// Synthetic owner data that OCR "sees" — must never surface anywhere.
const OWNER = 'ישראל ישראלי';
const OWNER_ID = '123456782';
const ADDRESS = 'רחוב הדוגמה 5 תל אביב';

let ocrLines: OcrTextLine[] | Error = [];
let digitPasses: { pass: string; lines: OcrTextLine[] }[] = [];
let lookups: string[] = [];
let captureOptions: unknown[] = [];

const ocr: LicenseOcr = {
  id: 'fake-local-ocr',
  recognize: async () => {
    if (ocrLines instanceof Error) throw ocrLines;
    return {
      lines: ocrLines,
      digitPasses,
      meanConfidence: 80,
      rotation: 0,
      ms: 900,
    };
  },
};

const registry: VehicleRegistryProvider = {
  id: 'fake-registry',
  lookup: async (plate) => {
    lookups.push(plate);
    return {
      status: 'found',
      retrievedAt: '2026-09-28T09:00:00.000Z',
      candidates: [
        {
          type: 'car',
          manufacturer: 'סיאט',
          model: 'IBIZA',
          year: 2012,
          engineCode: 'CGG',
          color: 'שחור מטלי',
          dataset: 'test',
        },
      ],
    };
  },
};

function services(): OnboardingServices {
  return {
    acquisition: {
      captureWithCamera: async (o) => {
        captureOptions.push(o);
        return {
          status: 'acquired',
          file: {
            uri: 'file:///cache/ImagePicker/x.jpg',
            mimeType: 'image/jpeg',
            sizeBytes: 9,
            source: 'camera',
          },
        };
      },
      pickImage: async () => ({ status: 'cancelled' }),
      pickDocument: async () => ({ status: 'cancelled' }),
    },
    extractor: null,
    registry,
    licenseOcr: ocr,
    invoiceReader: null,
  };
}

const lines = (...t: string[]): OcrTextLine[] => t.map((text) => ({ text, confidence: 0.8 }));
const LICENSE = (plateLine: string) =>
  lines('רישיון רכב', plateLine, `שם בעל הרכב ${OWNER}`, `ת.ז. ${OWNER_ID}`, `כתובת ${ADDRESS}`);

let logSpy: jest.SpyInstance[];
beforeEach(async () => {
  lookups = [];
  digitPasses = [];
  captureOptions = [];
  const db = await openTestDatabase();
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(1),
    clock,
    files: new MemoryFileStore(),
    services: services(),
  });
  logSpy = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m));
});
afterEach(() => {
  configureDataSource({ kind: 'demo' });
  logSpy.forEach((s) => s.mockRestore());
});

async function scan() {
  await renderRouter('./src/app', { initialUrl: '/onboarding/scan' });
  await waitFor(() => expect(screen.getByTestId('screen-onboarding-scan')).toBeOnTheScreen(), LONG);
  await fireEvent.press(screen.getByTestId('scan-capture'));
  await waitFor(
    () => expect(screen.getByTestId('screen-onboarding-plate')).toBeOnTheScreen(),
    LONG,
  );
}

describe('cropped plate + voting across digit passes', () => {
  it('the camera asks for a crop; two agreeing passes pre-fill the plate, nothing else is read', async () => {
    ocrLines = lines('77 881 76'); // labelled pass: plate-shaped but not in canonical form
    digitPasses = [
      { pass: 'gray:line', lines: lines('7788176') },
      { pass: 'otsu:line', lines: lines('7788176') },
    ];
    await scan();
    expect(captureOptions).toEqual([{ crop: true }]);
    expect(screen.getByTestId('plate-input').props.value).toBe('77-881-76');
    expect(lookups).toEqual([]); // the registry is consulted only after the user confirms
  }, 40000);

  it('disagreeing passes → nothing pre-filled, both readings offered as choices', async () => {
    ocrLines = lines('רישיון רכב');
    digitPasses = [
      { pass: 'gray:line', lines: lines('7788176') },
      { pass: 'otsu:line', lines: lines('7788178') },
    ];
    await scan();
    expect(screen.getByTestId('plate-input').props.value).toBe('');
    expect(screen.getByTestId('plate-candidates')).toBeOnTheScreen();
  }, 40000);
});

function expectNoOwnerDataAnywhere() {
  const tree = JSON.stringify(screen.toJSON());
  for (const secret of [OWNER, OWNER_ID, ADDRESS]) {
    expect(tree).not.toContain(secret);
    for (const s of logSpy) {
      expect(JSON.stringify(s.mock.calls)).not.toContain(secret);
    }
  }
}

describe('license scan → plate → registry (on-device OCR POC)', () => {
  it('one credible plate: proposed, confirmed, then the registry supplies the vehicle', async () => {
    ocrLines = LICENSE('מספר רכב 12-345-67');
    await scan();
    expect(screen.getByTestId('plate-input').props.value).toBe('12-345-67');
    expect(lookups).toEqual([]); // nothing is looked up before the user confirms
    expectNoOwnerDataAnywhere();

    await fireEvent.press(screen.getByTestId('registry-lookup-button'));
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-confirm')).toBeOnTheScreen(),
      LONG,
    );
    expect(lookups).toEqual(['1234567']);
    // Registry facts carry registry provenance; the plate is the confirmed scan candidate.
    expect(screen.getByTestId('field-engineCode')).toHaveTextContent(/CGG.*ממאגר משרד התחבורה/);
    expect(screen.getByTestId('field-color')).toHaveTextContent(/שחור מטלי/);
    expect(screen.getByTestId('field-registration')).toHaveTextContent(/12-345-67/);
    expectNoOwnerDataAnywhere();
  }, 40000);

  it('a corrected plate is looked up as typed and marked as user-entered', async () => {
    ocrLines = LICENSE('מספר רכב 12-345-67');
    await scan();
    await fireEvent.changeText(screen.getByTestId('plate-input'), '12-345-68');
    await fireEvent.press(screen.getByTestId('registry-lookup-button'));
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-confirm')).toBeOnTheScreen(),
      LONG,
    );
    expect(lookups).toEqual(['1234568']);
    expect(screen.getByTestId('field-registration')).toHaveTextContent(/הוזן ידנית/);
  }, 40000);

  it('ambiguous: candidates are offered, nothing is pre-selected', async () => {
    ocrLines = lines('12-345-67', '76-543-21');
    await scan();
    expect(screen.getByTestId('plate-input').props.value).toBe('');
    expect(screen.getByTestId('plate-candidate-0')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('plate-candidate-1'));
    expect(screen.getByTestId('plate-input').props.value).toBe('76-543-21');
  }, 40000);

  it('no plate recognized (only owner data and dates): empty field, manual entry still works', async () => {
    ocrLines = lines(`ת.ז. ${OWNER_ID}`, 'תוקף 12.03.2027');
    await scan();
    expect(screen.getByTestId('plate-input').props.value).toBe('');
    expect(screen.queryByTestId('plate-candidates')).toBeNull();
    expectNoOwnerDataAnywhere();
    await fireEvent.press(screen.getByTestId('plate-manual'));
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-manual')).toBeOnTheScreen(),
      LONG,
    );
  }, 40000);

  it('OCR failure: explained in context, the plate can still be typed', async () => {
    ocrLines = new Error(`native failure mentioning ${OWNER}`);
    await scan();
    expect(screen.getByTestId('plate-status')).toHaveTextContent(/קריאת התמונה נכשלה/);
    await fireEvent.changeText(screen.getByTestId('plate-input'), '12-345-67');
    await fireEvent.press(screen.getByTestId('registry-lookup-button'));
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-confirm')).toBeOnTheScreen(),
      LONG,
    );
    expectNoOwnerDataAnywhere();
  }, 40000);
});

describe('no on-device reader (Expo Go / tests): manual plate entry only', () => {
  it('without the native module there is no reader, so the license scan is not offered', () => {
    expect(localLicenseOcr()).toBeNull();
  });

  it('without a reader, onboarding offers manual entry only: plate → registry → confirm', async () => {
    configureDataSource({
      kind: 'local',
      openDatabase: openTestDatabase,
      ids: sequentialIds(1),
      clock,
      files: new MemoryFileStore(),
      services: { ...services(), licenseOcr: null },
    });
    await renderRouter('./src/app', { initialUrl: '/onboarding/method' });
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-method')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.queryByTestId('onboarding-start-scan')).toBeNull();
    expect(screen.getByTestId('onboarding-manual')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('onboarding-continue'));
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-manual')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.changeText(screen.getByTestId('input-registration'), '12-345-67');
    await fireEvent.press(screen.getByTestId('registry-lookup-button'));
    await waitFor(() => expect(screen.getByTestId('registry-result')).toBeOnTheScreen(), LONG);
    expect(lookups).toEqual(['1234567']);
  }, 60000);
});
