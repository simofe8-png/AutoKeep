import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { createSchedule, isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { MemoryFileStore } from '@/providers/storage/types';
import { ScheduleRepository } from '@/persistence';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import type { VehicleRegistryProvider } from '@/providers/registry/types';

/**
 * M13 integration (T108): the approved UI running on the real local store (sql.js SQLite), with
 * the production onboarding path: acquisition → (no OCR provider yet) → registry lookup with
 * consent → confirm → odometer → honest "no verified source" → Home. Data survives a restart.
 */

const LONG = { timeout: 10000 };

const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
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
          manufacturer: 'טויוטה',
          model: 'קורולה',
          year: 2019,
          type: 'car',
          engine: '1598 סמ״ק',
          fuel: 'בנזין',
          dataset: 'test',
        },
      ],
    };
  },
};

const services: OnboardingServices = {
  acquisition: {
    captureWithCamera: async () => ({
      status: 'acquired',
      file: {
        uri: 'file:///cache/license.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 1000,
        source: 'camera',
      },
    }),
    pickImage: async () => ({ status: 'cancelled' }),
    pickDocument: async () => ({ status: 'cancelled' }),
  },
  extractor: null,
  registry,
  invoiceReader: null,
};

function useLocal(db: TestDatabase) {
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(1),
    clock,
    files: new MemoryFileStore(),
    services,
  });
}

afterEach(() => configureDataSource({ kind: 'demo' }));

describe('real local data behind the approved UI', () => {
  it('first use → onboarding via registry → Home from SQLite → survives restart', async () => {
    const db = await openTestDatabase();
    useLocal(db);
    await renderRouter('./src/app', { initialUrl: '/' });

    // Empty store: straight into onboarding, no demo tools or banner.
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-welcome')).toBeOnTheScreen(),
      LONG,
    );
    // Add Vehicle = plate search against the Ministry data (no scan offered).
    await fireEvent.press(screen.getByTestId('onboarding-add-first'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-search')).toBeOnTheScreen());
    expect(screen.queryByTestId('onboarding-start-scan')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('vehicle-search-plate'), '1234567');
    await fireEvent.press(screen.getByTestId('vehicle-search-find'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-details')).toBeOnTheScreen());
    // Only the plate was sent, on the user's explicit request.
    expect(lookups).toEqual([{ plate: '1234567', consent: true }]);
    expect(screen.getByTestId('screen-vehicle-details')).toHaveTextContent(/טויוטה קורולה 2019/);

    await fireEvent.press(screen.getByTestId('vehicle-details-add'));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-odometer')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('input-odometer'), '84,250');
    await fireEvent.press(screen.getByTestId('odometer-continue'));

    // No discovery provider is configured: the honest outcome, never a fabricated schedule.
    await waitFor(
      () => expect(screen.getByTestId('sources-result-notFound')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.queryByTestId('source-scenario')).toBeNull();
    await fireEvent.press(screen.getByTestId('sources-finish'));

    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
    await waitFor(() =>
      expect(screen.getByTestId('home-active-vehicle')).toHaveTextContent(/קורולה/),
    );
    expect(screen.getByTestId('home-odometer-card')).toHaveTextContent(/84,250/);
    expect(screen.getByTestId('schedule-unavailable')).toBeOnTheScreen();
    expect(screen.queryByTestId('next-service-summary')).toBeNull();
    expect(screen.queryByTestId('demo-data-strip')).toBeNull();

    // Restart: a new app instance on the same on-disk bytes shows the persisted vehicle.
    const bytes = db.export();
    screen.unmount();
    const reopened = await openTestDatabase(bytes);
    useLocal(reopened);
    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('home-active-vehicle')).toHaveTextContent(/קורולה/);
  }, 60000);

  it('odometer update is saved through the domain and reflected on Home', async () => {
    const db = await openTestDatabase();
    useLocal(db);
    const store = await LocalStore.open(db, sequentialIds(500), clock);
    const id = await store.addVehicle({
      id: '00000000-0000-4000-8000-0000000000c1',
      kind: 'motorcycle',
      manufacturer: 'הונדה',
      model: 'CB500F',
      year: 2021,
      registration: '123-45-678',
      odometerKm: 18420,
      odometerMeasuredAt: '2026-06-02',
      archived: false,
    });
    await store.setActiveVehicle(id);
    // A verified distance-based schedule: here a stale reading impairs the calculation (T128).
    const ids = sequentialIds(900);
    const schedule = createSchedule(
      {
        vehicleId: id,
        intervals: [
          {
            id: ids.next(),
            label: 'A',
            rule: 'distance_only',
            everyKm: 6000,
            items: [
              {
                id: ids.next(),
                title: 'שרשרת הנעה',
                actionType: 'inspection',
                manufacturerText: 'בדיקה',
                reference: { sourceId: ids.next(), page: 1 },
              },
            ],
          },
        ],
        evidence: [{ authority: 'manufacturer', exactApplicability: true }],
        applicability: { matchedOn: ['model'], exact: true },
      },
      ids,
      clock.now(),
    );
    if (!schedule.ok) throw new Error('fixture');
    await new ScheduleRepository(db).add(schedule.value);

    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
    // A reading 116 days old is flagged, with its reason.
    await waitFor(() => expect(screen.getByTestId('home-alerts')).toBeOnTheScreen());

    await fireEvent.press(screen.getByTestId('home-odometer-card'));
    await waitFor(() => expect(screen.getByTestId('screen-odometer')).toBeOnTheScreen(), LONG);
    await fireEvent.changeText(screen.getByTestId('odometer-input'), '19,500');
    await fireEvent.press(screen.getByTestId('odometer-save'));
    await waitFor(() =>
      expect(screen.getByTestId('home-odometer-card')).toHaveTextContent(/19,500/),
    );
    expect(screen.queryByTestId('home-alerts')).toBeNull();
  }, 60000);
  it('a denied camera permission is explained on the scan screen (no dead end)', async () => {
    const db = await openTestDatabase();
    configureDataSource({
      kind: 'local',
      openDatabase: async () => db,
      ids: sequentialIds(1),
      clock,
      files: new MemoryFileStore(),
      services: {
        ...services,
        acquisition: {
          ...services.acquisition,
          captureWithCamera: async () => ({ status: 'permission_denied' }),
        },
      },
    });
    await renderRouter('./src/app', { initialUrl: '/onboarding/scan' });
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-scan')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('scan-capture'));
    await waitFor(() => expect(screen.getByTestId('scan-problem')).toBeOnTheScreen());
    expect(screen.getByTestId('scan-problem')).toHaveTextContent(/אין הרשאה/);
    expect(screen.queryByTestId('screen-onboarding-identify')).toBeNull();
    expect(screen.getByTestId('scan-manual')).toBeEnabled();
  }, 30000);
});
