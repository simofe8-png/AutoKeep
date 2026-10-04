import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { ManualScheduleRepository } from '@/persistence';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * The owner enters the schedule by hand (owner decision 2026-10-04): add → the item is in the plan
 * with its next due, labelled as entered by the owner → edit → delete. SYNTHETIC vehicle.
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
let vehicleId: string;

beforeEach(async () => {
  db = await openTestDatabase();
  const store = await LocalStore.open(db, sequentialIds(500), clock, new MemoryFileStore());
  vehicleId = await store.addVehicle({
    id: '',
    kind: 'motorcycle',
    manufacturer: 'הונדה',
    model: 'XR650L',
    year: 2001,
    registration: '73-938-10',
    odometerKm: 31250,
    odometerMeasuredAt: '2026-10-04',
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
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  configureDataSource({ kind: 'demo' });
});

describe('manual schedule entry', () => {
  it('add → in the plan with its next due → edit → delete', async () => {
    await renderRouter('./src/app', { initialUrl: '/maintenance' });
    await waitFor(() => expect(screen.getByTestId('plan-add-manual')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('plan-add-manual'));
    await waitFor(() => expect(screen.getByTestId('screen-maintenance-item')).toBeOnTheScreen());

    // Nothing chosen yet: refused with the reason.
    await fireEvent.press(screen.getByTestId('manual-item-save'));
    expect(screen.getByText('יש לבחור טיפול')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('manual-item-task-engine_oil'));
    await fireEvent.changeText(screen.getByTestId('manual-item-km'), '3000');
    await fireEvent.changeText(screen.getByTestId('manual-item-months'), '12');
    await fireEvent.changeText(screen.getByTestId('manual-item-last-date'), '01.09.2026');
    await fireEvent.changeText(screen.getByTestId('manual-item-last-km'), '30000');
    await fireEvent.press(screen.getByTestId('manual-item-save'));

    await waitFor(() => expect(screen.getByTestId('plan-item-engine_oil')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('plan-item-engine_oil-km')).toHaveTextContent(/33,000/);
    expect(screen.getByTestId('plan-item-engine_oil-evidence')).toHaveTextContent('הוזן על ידך');
    const [saved] = await new ManualScheduleRepository(db).list(vehicleId as never);
    expect(saved).toMatchObject({ task: 'engine_oil', intervalKm: 3000, lastDoneKm: 30000 });

    // Edit: a new interval moves the next due.
    await fireEvent.press(screen.getByTestId('plan-item-engine_oil-edit'));
    await waitFor(() => expect(screen.getByTestId('manual-item-km')).toHaveDisplayValue('3000'));
    await fireEvent.changeText(screen.getByTestId('manual-item-km'), '4000');
    await fireEvent.press(screen.getByTestId('manual-item-save'));
    await waitFor(
      () => expect(screen.getByTestId('plan-item-engine_oil-km')).toHaveTextContent(/34,000/),
      LONG,
    );

    // Delete.
    await fireEvent.press(screen.getByTestId('plan-item-engine_oil-edit'));
    await waitFor(() => expect(screen.getByTestId('manual-item-delete')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('manual-item-delete'));
    await fireEvent.press(screen.getByTestId('manual-item-delete-dialog-confirm'));
    await waitFor(() => expect(screen.queryByTestId('plan-item-engine_oil')).toBeNull(), LONG);
    expect(await new ManualScheduleRepository(db).list(vehicleId as never)).toEqual([]);
  }, 60000);
});
