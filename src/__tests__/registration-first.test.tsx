import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import type { RegistrationExtractor } from '@/identification/contract';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import type { AcquisitionProvider } from '@/providers/acquisition/types';
import type { VehicleRegistryProvider } from '@/providers/registry/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * ADR-0017 registration flow: scan → the plate → official registry (with consent) → OCR only for
 * what is still missing. Uncertain OCR values are never accepted silently; registry values
 * replace scanned ones; nothing the user typed is overwritten.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};

const acquisition: AcquisitionProvider = {
  captureWithCamera: async () => ({
    status: 'acquired',
    file: {
      uri: 'file:///cache/lic.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 100,
      source: 'camera',
    },
  }),
  pickImage: async () => ({ status: 'cancelled' }),
  pickDocument: async () => ({ status: 'cancelled' }),
};

// OCR read the plate and year confidently, the manufacturer only uncertainly (0.7).
const extractor: RegistrationExtractor = {
  id: 'fake-ocr',
  extract: async () => ({
    status: 'ok',
    producedBy: 'fake-ocr',
    output: {
      documentType: 'vehicle_license',
      fields: {
        registration: { value: '12-345-67', confidence: 0.97 },
        year: { value: '2019', confidence: 0.95 },
        manufacturer: { value: 'טויטה', confidence: 0.7 },
      },
    },
  }),
};

const lookups: { plate: string; consent: boolean }[] = [];
const registry: VehicleRegistryProvider = {
  id: 'fake-registry',
  lookup: async (plate, { consent }) => {
    lookups.push({ plate, consent });
    return {
      status: 'found',
      retrievedAt: '2026-09-26T09:00:00.000Z',
      candidates: [
        {
          type: 'car',
          manufacturer: 'טויוטה',
          model: 'קורולה',
          year: 2019,
          engine: '1598 סמ״ק',
          fuel: 'בנזין',
          dataset: 'test',
        },
      ],
    };
  },
};

beforeEach(async () => {
  lookups.length = 0;
  const db = await openTestDatabase();
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(1),
    clock,
    files: new MemoryFileStore(),
    services: { acquisition, extractor, registry, invoiceReader: null },
  });
});
afterEach(() => configureDataSource({ kind: 'demo' }));

it('scan → plate → registry fills the rest; the uncertain OCR value was never accepted', async () => {
  await renderRouter('./src/app', { initialUrl: '/onboarding/scan' });
  await waitFor(() => expect(screen.getByTestId('screen-onboarding-scan')).toBeOnTheScreen(), LONG);
  await fireEvent.press(screen.getByTestId('scan-capture'));
  await waitFor(
    () => expect(screen.getByTestId('screen-onboarding-confirm')).toBeOnTheScreen(),
    LONG,
  );

  // The uncertain manufacturer is missing (to be asked), not silently accepted.
  expect(screen.queryByTestId('field-manufacturer')).toBeNull();
  expect(screen.getByTestId('field-registration')).toHaveTextContent(/זוהה מרישיון הרכב/);
  // No lookup without the user's explicit action.
  expect(lookups).toEqual([]);

  await fireEvent.press(screen.getByTestId('registry-lookup-button'));
  await waitFor(() => expect(screen.getByTestId('field-manufacturer')).toBeOnTheScreen());
  expect(lookups).toEqual([{ plate: '1234567', consent: true }]);
  expect(screen.getByTestId('field-manufacturer')).toHaveTextContent(/טויוטה/);
  expect(screen.getByTestId('field-manufacturer')).toHaveTextContent(/ממאגר משרד התחבורה/);
  expect(screen.getByTestId('field-model')).toHaveTextContent(/קורולה/);
  expect(screen.queryByTestId('missing-fields')).toBeNull();
}, 60000);
