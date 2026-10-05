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

describe('השלמת פרופיל הרכב — complete', () => {
  it('complete: a "done" message until closed, then nothing', async () => {
    await store.setVehicleDates(vehicleId, {
      testUntil: '2027-10-01',
      compulsoryUntil: '2027-08-31',
    });
    await store.saveManualSchedule(vehicleId, [
      {
        task: 'engine_oil',
        action: 'replacement',
        title: 'שמן מנוע',
        intervalKm: 15000,
        intervalMonths: 12,
      },
    ]);
    await home();
    await waitFor(() => expect(screen.getByTestId('profile-done')).toBeOnTheScreen(), LONG);
    expect(screen.queryByTestId('profile-card')).toBeNull();
    await fireEvent.press(screen.getByTestId('profile-done-close'));
    await waitFor(() => expect(screen.queryByTestId('profile-done')).toBeNull(), {
      timeout: 30000,
    });
  }, 60000);
});
