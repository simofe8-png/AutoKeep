import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Home "השלמת פרופיל הרכב" (owner decision 2026-10-05): required items make the percentage; each
 * open item opens its screen; hide is remembered; once complete a "done" message until closed.
 * SYNTHETIC vehicle.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-10-05T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-10-05') as IsoDate,
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
let store: LocalStore;
let vehicleId: string;

beforeEach(async () => {
  db = await openTestDatabase();
  store = await LocalStore.open(db, sequentialIds(500), clock, new MemoryFileStore());
  vehicleId = await store.addVehicle({
    id: '',
    kind: 'car',
    manufacturer: 'Synthcar',
    model: 'Alpha',
    year: 2015,
    registration: '12-345-67',
    odometerKm: 100000,
    odometerMeasuredAt: '2026-10-05',
    archived: false,
  });
  await store.setActiveVehicle(vehicleId);
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(1000),
    clock,
    files: new MemoryFileStore(),
    services,
  });
});
afterEach(() => configureDataSource({ kind: 'demo' }));

const home = async () => {
  await renderRouter('./src/app', { initialUrl: '/' });
  await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
};

describe('השלמת פרופיל הרכב — windows', () => {
  it('tyre pressures and insurance are entered in their windows on Home', async () => {
    await home();
    await waitFor(() => expect(screen.getByTestId('profile-card')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('profile-item-pressure'));
    await waitFor(() => expect(screen.getByTestId('profile-sheet')).toBeOnTheScreen(), LONG);
    await fireEvent.changeText(screen.getByTestId('profile-pressure-front'), '2.3');
    await fireEvent.changeText(screen.getByTestId('profile-pressure-rear'), '2.1');
    await fireEvent.press(screen.getByTestId('profile-pressure-save'));
    await waitFor(
      () =>
        expect(screen.getByTestId('profile-item-pressure-done')).toHaveTextContent(/2.3 \/ 2.1/),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('profile-item-insurance'));
    await waitFor(() =>
      expect(screen.getByTestId('profile-insurance-compulsory')).toBeOnTheScreen(),
    );
    await fireEvent.changeText(screen.getByTestId('profile-insurance-compulsory'), '31.8.2027');
    await fireEvent.press(screen.getByTestId('profile-insurance-save'));
    await waitFor(
      () => expect(screen.getByTestId('profile-item-insurance-done')).toHaveTextContent(/31/),
      LONG,
    );
    expect(screen.getByTestId('screen-home')).toBeOnTheScreen();
  }, 60000);
});
