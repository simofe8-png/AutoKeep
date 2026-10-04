import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore, type VehicleDetails } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import type { VehicleSummary } from '@/features/vehicles/types';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Vehicle image (owner decision 2026-10-04): only the photo the user adds. Without it the image
 * area is empty with "take photo" / "pick from gallery"; nothing is looked up automatically.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-29T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-29') as IsoDate,
};

let db: TestDatabase;
const acquired = (name: string) => ({
  status: 'acquired' as const,
  file: {
    uri: `file:///cache/${name}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 10,
    source: 'camera' as const,
  },
});
const services: OnboardingServices = {
  acquisition: {
    captureWithCamera: async () => acquired('camera-photo'),
    pickImage: async () => acquired('gallery-photo'),
    pickDocument: async () => ({ status: 'cancelled' }),
  },
  extractor: null,
  registry: { id: 'unused', lookup: async () => ({ status: 'not_found' }) },
  invoiceReader: null,
};

async function withVehicle(summary: Partial<VehicleSummary>, details: VehicleDetails) {
  const store = await LocalStore.open(db, sequentialIds(500), clock, new MemoryFileStore());
  return store.addVehicle(
    {
      id: '',
      kind: 'car',
      manufacturer: 'סיאט ספרד',
      model: 'IBIZA',
      year: 2012,
      registration: '12-345-67',
      odometerKm: 0,
      odometerMeasuredAt: '2026-09-29',
      archived: false,
      ...summary,
    },
    details,
  );
}

function configure() {
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(1000),
    clock,
    files: new MemoryFileStore(),
    services,
  });
}

beforeEach(async () => {
  db = await openTestDatabase();
  configure();
});
afterEach(() => {
  // renderRouter switches to fake timers; drop any pending timer before the next app instance.
  jest.clearAllTimers();
  jest.useRealTimers();
  configureDataSource({ kind: 'demo' });
});

/**
 * Polls a data-layer condition by flushing pending work inside act() — no async waitFor callbacks
 * (they leak dangling promises under renderRouter's fake timers into the next test).
 */
async function eventually(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  throw new Error('condition not met');
}

async function home() {
  await renderRouter('./src/app', { initialUrl: '/' });
  await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
}

/**
 * What a restarted app would load: the persisted bytes reopened in a new store. (The UI restart
 * itself is verified on the Galaxy A54; re-rendering the router in one test is not reliable.)
 */
async function afterRestart() {
  const reopened = await openTestDatabase(db.export());
  const store = await LocalStore.open(reopened, sequentialIds(9000), clock, new MemoryFileStore());
  return store.snapshot();
}

describe('vehicle image: the user photo only', () => {
  it('no photo → an empty frame with take / pick; a camera photo is the image and persists', async () => {
    await withVehicle({ manufacturer: 'טויוטה', model: 'קורולה' }, { modelCode: 'ZRE181L' });
    await home();
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-empty')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('image-pick')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('image-capture'));
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-user')).toBeOnTheScreen(), LONG);
    await eventually(async () => Object.keys((await afterRestart()).vehiclePhotos).length === 1);
  }, 40000);

  it('added and removed on the vehicle screen; removing it empties the frame again', async () => {
    const id = await withVehicle({}, { modelCode: '6J52E4', color: 'שחור מטלי' });
    const homeHero = async () => {
      await renderRouter('./src/app', { initialUrl: '/' });
      await waitFor(() => expect(screen.getByTestId('vehicle-hero')).toBeOnTheScreen(), LONG);
    };
    await renderRouter('./src/app', { initialUrl: `/vehicle/${id}` });
    await waitFor(() => expect(screen.getByTestId('vehicle-photo')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('vehicle-photo')); // gallery
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-remove')).toBeOnTheScreen(), LONG);
    await homeHero();
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-user')).toBeOnTheScreen(), LONG);
    await renderRouter('./src/app', { initialUrl: `/vehicle/${id}` });
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-remove')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('vehicle-photo-remove'));
    await waitFor(() => expect(screen.queryByTestId('vehicle-photo-remove')).toBeNull());
    await homeHero();
    await waitFor(() => expect(screen.getByTestId('vehicle-photo-empty')).toBeOnTheScreen(), LONG);
  }, 60000);
});
