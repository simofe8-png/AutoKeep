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

describe('השלמת פרופיל הרכב', () => {
  it('shows the open items in order with the percentage; an item opens its screen', async () => {
    await home();
    await waitFor(() => expect(screen.getByTestId('profile-card')).toBeOnTheScreen(), LONG);
    // details + odometer of 5 required (no registry test here: the test is an item).
    expect(screen.getByTestId('profile-card-percent')).toHaveTextContent('40%');
    expect(screen.getByTestId('profile-item-details-done')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-item-schedule')).toHaveTextContent(
      /1.*לוח טיפולים.*הכי חשוב/,
    );
    expect(screen.getByTestId('profile-item-photo')).toHaveTextContent(/רשות/);
    expect(screen.queryByTestId('schedule-unavailable')).toBeNull();
    // The item opens a window on the same screen (owner decision 2026-10-05): photograph, upload
    // or type the table; typing opens the table screen (owner decision 2026-10-06), and the item
    // is done once the owner approves the table.
    await fireEvent.press(screen.getByTestId('profile-item-schedule'));
    await waitFor(() => expect(screen.getByTestId('profile-sheet')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('profile-schedule-photo')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-schedule-file')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('profile-schedule-manual'));
    await waitFor(() => expect(screen.getByTestId('table-shape-create')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('table-shape-create'));
    await waitFor(() => expect(screen.getByTestId('table-row-title')).toBeOnTheScreen(), LONG);
    await fireEvent.changeText(screen.getByTestId('table-row-title'), 'שמן מנוע ומסנן שמן');
    await fireEvent.press(screen.getByTestId('table-row-fill-replace'));
    await fireEvent.press(screen.getByTestId('table-row-save'));
    await waitFor(() => expect(screen.getByTestId('table-approve')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('table-approve'));
    await waitFor(() => expect(screen.getByTestId('periodic-next')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('tab-home'));
    await waitFor(
      () => expect(screen.getByTestId('profile-item-schedule-done')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('profile-card-percent')).toHaveTextContent('60%');
    expect(screen.getByTestId('screen-home')).toBeOnTheScreen();
  }, 60000);

  it('hide is remembered', async () => {
    await home();
    await waitFor(() => expect(screen.getByTestId('profile-card')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('profile-card-hide'));
    await waitFor(() => expect(screen.queryByTestId('profile-card')).toBeNull(), LONG);
    // Hidden, but required items are missing: a short note on Home.
    expect(screen.getByTestId('profile-missing')).toHaveTextContent(/חסר: לוח טיפולים, טסט, ביטוח/);
    // Stored on the device: it stays hidden after a restart.
    await waitFor(async () =>
      expect((await store.snapshot()).profileCard[vehicleId]).toBe('hidden'),
    );
  }, 60000);
});
