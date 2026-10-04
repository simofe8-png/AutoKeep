import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore, type VehicleDetails } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import type { VehicleSummary } from '@/features/vehicles/types';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { PLATE_FIELDS, factsFrom } from '@/providers/registry/vehicleRecord';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Test and insurance under the vehicle name on Home (owner decision 2026-10-04): days left and the
 * date, orange within 30 days, red once passed. The test date comes from the registry (cars);
 * insurance only as the owner enters it. SYNTHETIC vehicles.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-10-04T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-10-04') as IsoDate,
};
const services: OnboardingServices = {
  acquisition: {
    captureWithCamera: async () => ({ status: 'cancelled' }),
    pickImage: async () => ({ status: 'cancelled' }),
    pickDocument: async () => ({ status: 'cancelled' }),
  },
  extractor: null,
  registry: { id: 'unused', lookup: async () => ({ status: 'not_found' }) },
  invoiceReader: null,
};

let db: TestDatabase;

async function withVehicle(summary: Partial<VehicleSummary>, details: VehicleDetails = {}) {
  const store = await LocalStore.open(db, sequentialIds(500), clock, new MemoryFileStore());
  return store.addVehicle(
    {
      id: '',
      kind: 'car',
      manufacturer: 'טויוטה',
      model: 'קורולה',
      year: 2019,
      registration: '12-345-67',
      odometerKm: 84250,
      odometerMeasuredAt: '2026-10-04',
      archived: false,
      ...summary,
    },
    details,
  );
}

const registryWithTest = (tokef: string): VehicleDetails => ({
  registryRecord: {
    sources: ['res-main'],
    retrievedAt: '2026-10-04T09:00:00.000Z',
    facts: factsFrom({ tokef_dt: tokef, baalut: 'פרטי' }, PLATE_FIELDS),
  },
});

beforeEach(async () => {
  db = await openTestDatabase();
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(1000),
    clock,
    files: new MemoryFileStore(),
    services,
  });
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  configureDataSource({ kind: 'demo' });
});

async function home() {
  await renderRouter('./src/app', { initialUrl: '/' });
  await waitFor(() => expect(screen.getByTestId('vehicle-expiry')).toBeOnTheScreen(), LONG);
}

describe('test and insurance on Home', () => {
  it('test from the registry with days left; insurance not entered invites to add it', async () => {
    await withVehicle({}, registryWithTest('2026-12-30T00:00:00'));
    await home();
    expect(screen.getByTestId('vehicle-expiry-test-text')).toHaveTextContent(
      /טסט: עוד 87 ימים · 30\.12\.2026/,
    );
    expect(screen.getByTestId('vehicle-expiry-insurance-text')).toHaveTextContent(/ביטוח: לא הוזן/);
  }, 40000);

  it('the owner enters insurance on the vehicle screen; Home shows the nearest, soon in warning', async () => {
    const id = await withVehicle({}, registryWithTest('2026-09-29'));
    await renderRouter('./src/app', { initialUrl: `/vehicle/${id}` });
    await waitFor(() => expect(screen.getByTestId('vehicle-dates')).toBeOnTheScreen(), LONG);
    // The registry test date is prefilled and labelled as such.
    expect(screen.getByText(/לפי משרד התחבורה/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('vehicle-dates-compulsory'), '31.02.2027');
    await fireEvent.press(screen.getByTestId('vehicle-dates-save'));
    expect(screen.getByText('תאריך לא תקין')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('vehicle-dates-compulsory'), '20.10.2026');
    await fireEvent.press(screen.getByTestId('vehicle-dates-kind-comprehensive'));
    await fireEvent.changeText(screen.getByTestId('vehicle-dates-other'), '01.03.2027');
    await fireEvent.press(screen.getByTestId('vehicle-dates-save'));
    await waitFor(() => expect(screen.getByTestId('vehicle-dates-saved')).toBeOnTheScreen());

    await home();
    await waitFor(() =>
      expect(screen.getByTestId('vehicle-expiry-insurance-text')).toHaveTextContent(
        /ביטוח \(חובה\): עוד 16 ימים · 20\.10\.2026/,
      ),
    );
    // The registry test date has passed: stated as expired.
    expect(screen.getByTestId('vehicle-expiry-test-text')).toHaveTextContent(/טסט: פג לפני 5 ימים/);
  }, 60000);

  it('a two-wheeler has no registry test date: the owner enters it', async () => {
    const id = await withVehicle({ kind: 'motorcycle', manufacturer: 'הונדה', model: 'XR650L' });
    await home();
    expect(screen.getByTestId('vehicle-expiry-test-text')).toHaveTextContent(/טסט: לא הוזן/);
    await renderRouter('./src/app', { initialUrl: `/vehicle/${id}` });
    await waitFor(() => expect(screen.getByTestId('vehicle-dates')).toBeOnTheScreen(), LONG);
    expect(screen.getByText(/אינו מפרסם את מועד הטסט לדו־גלגלי/)).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('vehicle-dates-test'), '15.05.2027');
    await fireEvent.press(screen.getByTestId('vehicle-dates-save'));
    await waitFor(() => expect(screen.getByTestId('vehicle-dates-saved')).toBeOnTheScreen());
    await home();
    await waitFor(() =>
      expect(screen.getByTestId('vehicle-expiry-test-text')).toHaveTextContent(
        /טסט: עוד 223 ימים · 15\.5\.2027/,
      ),
    );
  }, 60000);
});
