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
 * "לוח טיפולים תקופתי" (owner decision 2026-10-04): the owner types the schedule as a table — item,
 * every km, every months; the next due counts from the odometer at entry. SYNTHETIC vehicle.
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
    kind: 'car',
    manufacturer: 'סיאט',
    model: 'IBIZA',
    year: 2012,
    registration: '78-869-76',
    odometerKm: 290000,
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

describe('לוח טיפולים תקופתי (manual table)', () => {
  it('rows of item / every km / every months; counted from the odometer at entry; edit and delete', async () => {
    await renderRouter('./src/app', { initialUrl: '/maintenance' });
    await waitFor(() => expect(screen.getByTestId('plan-add-manual')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('plan-add-manual')).toHaveTextContent(/הזנה ידנית של לוח טיפולים/);
    expect(screen.getByTestId('plan-booklet-photo')).toHaveTextContent(
      /צלם את עמוד הטיפולים מספר הרכב/,
    );
    await fireEvent.press(screen.getByTestId('plan-add-manual'));
    await waitFor(() => expect(screen.getByTestId('screen-maintenance-table')).toBeOnTheScreen());
    expect(screen.getByTestId('screen-maintenance-table')).toHaveTextContent(/לוח טיפולים תקופתי/);

    // Row 1 typed; row 2 from a suggestion; a row without an interval is refused.
    await fireEvent.changeText(screen.getByTestId('manual-row-0-title'), 'שמן מנוע ומסנן שמן');
    await fireEvent.changeText(screen.getByTestId('manual-row-0-km'), '15000');
    await fireEvent.changeText(screen.getByTestId('manual-row-0-months'), '12');
    await fireEvent.press(screen.getByTestId('manual-suggest-brake_fluid'));
    await fireEvent.press(screen.getByTestId('manual-table-save'));
    expect(screen.getByTestId('manual-table-error')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('manual-row-1-months'), '24');
    await fireEvent.press(screen.getByTestId('manual-table-add-row'));
    await fireEvent.changeText(screen.getByTestId('manual-row-2-title'), 'שימון צירים');
    await fireEvent.changeText(screen.getByTestId('manual-row-2-km'), '5000');
    await fireEvent.press(screen.getByTestId('manual-table-save'));

    // From the odometer at entry: 290,000 + 15,000.
    await waitFor(() => expect(screen.getByTestId('plan-item-engine_oil')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('plan-item-engine_oil-km')).toHaveTextContent(/305,000/);
    expect(screen.getByTestId('plan-item-engine_oil')).toHaveTextContent(
      /מחושב מהקילומטראז׳ בעת ההזנה/,
    );
    expect(screen.getByTestId('plan-item-engine_oil-evidence')).toHaveTextContent('הוזן על ידך');
    let saved = await new ManualScheduleRepository(db).list(vehicleId as never);
    expect(saved.map((s) => [s.title, s.intervalKm, s.intervalMonths, s.startKm])).toEqual([
      ['שמן מנוע ומסנן שמן', 15000, 12, 290000],
      ['נוזל בלמים', null, 24, 290000],
      ['שימון צירים', 5000, null, 290000],
    ]);

    // Edit the table: change the oil interval, delete the custom row.
    await fireEvent.press(screen.getByTestId('plan-add-manual'));
    await waitFor(() => expect(screen.getByTestId('manual-row-0-km')).toHaveDisplayValue('15000'));
    await fireEvent.changeText(screen.getByTestId('manual-row-0-km'), '10000');
    await fireEvent.press(screen.getByTestId('manual-row-2-delete'));
    await fireEvent.press(screen.getByTestId('manual-table-save'));
    await waitFor(
      () => expect(screen.getByTestId('plan-item-engine_oil-km')).toHaveTextContent(/300,000/),
      LONG,
    );
    saved = await new ManualScheduleRepository(db).list(vehicleId as never);
    expect(saved.map((s) => s.title)).toEqual(['שמן מנוע ומסנן שמן', 'נוזל בלמים']);
  }, 60000);
});
