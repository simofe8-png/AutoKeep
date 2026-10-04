import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { ManualScheduleRepository, VehicleSpecRepository } from '@/persistence';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * "מפרט הרכב" and row notes (owner decision 2026-10-05, option ג): the owner writes the oil, fluids
 * and tyres once; they show on the vehicle screen, beside the matching plan item and in Garage
 * Mode. A row of the owner's table can carry its own note. SYNTHETIC vehicle and values.
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
let vehicleId: string;

beforeEach(async () => {
  db = await openTestDatabase();
  const store = await LocalStore.open(db, sequentialIds(500), clock, new MemoryFileStore());
  vehicleId = await store.addVehicle({
    id: '',
    kind: 'car',
    manufacturer: 'Synthcar',
    model: 'Alpha',
    year: 2012,
    registration: '12-345-67',
    odometerKm: 100000,
    odometerMeasuredAt: '2026-10-05',
    archived: false,
  });
  await store.setActiveVehicle(vehicleId);
  await store.saveManualSchedule(vehicleId, [
    {
      task: 'engine_oil',
      action: 'replacement',
      title: 'שמן מנוע ומסנן שמן',
      intervalKm: 15000,
      intervalMonths: 12,
    },
    {
      task: 'custom',
      action: 'replacement',
      title: 'רצועת אביזרים',
      intervalKm: 60000,
      intervalMonths: null,
      note: 'מק״ט 6PK1050',
    },
  ]);
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

describe('מפרט הרכב', () => {
  it('entered once; shown on the vehicle screen, beside the oil item and in Garage Mode', async () => {
    await renderRouter('./src/app', { initialUrl: `/vehicle/${vehicleId}` });
    await waitFor(() => expect(screen.getByTestId('vehicle-spec')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('vehicle-spec')).toHaveTextContent(/הקישו להוספה/);
    await fireEvent.press(screen.getByTestId('vehicle-spec'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-spec')).toBeOnTheScreen());

    await fireEvent.changeText(screen.getByTestId('vehicle-spec-oilViscosity'), ' 5W-30 ');
    await fireEvent.changeText(screen.getByTestId('vehicle-spec-oilStandard'), 'VW 504.00');
    await fireEvent.changeText(screen.getByTestId('vehicle-spec-brakeFluid'), 'DOT 4');
    await fireEvent.changeText(screen.getByTestId('vehicle-spec-tirePressureFront'), '2.3');
    await fireEvent.changeText(screen.getByTestId('vehicle-spec-tirePressureRear'), '2.1');
    await fireEvent.press(screen.getByTestId('vehicle-spec-save'));

    await waitFor(
      () => expect(screen.getByTestId('vehicle-spec')).toHaveTextContent(/שמן 5W-30 · VW 504.00/),
      LONG,
    );
    expect(screen.getByTestId('vehicle-spec')).toHaveTextContent(/לחץ 2.3 \/ 2.1/);
    expect(await new VehicleSpecRepository(db).get(vehicleId as never)).toMatchObject({
      oilViscosity: '5W-30',
      oilCapacity: null,
      brakeFluid: 'DOT 4',
    });
  }, 60000);

  const seedSpec = async () => {
    await new VehicleSpecRepository(db).save(
      vehicleId as never,
      {
        oilViscosity: '5W-30',
        oilStandard: 'VW 504.00',
        oilCapacity: '4.0 ליטר',
        coolant: null,
        brakeFluid: 'DOT 4',
        transmissionOil: null,
        tireSize: null,
        tirePressureFront: null,
        tirePressureRear: null,
        notes: null,
      },
      clock.now(),
    );
  };

  it('the spec beside the oil item; the row note on its own item', async () => {
    await seedSpec();
    await renderRouter('./src/app', { initialUrl: '/maintenance' });
    await waitFor(
      () => expect(screen.getByTestId('plan-item-engine_oil-spec')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('plan-item-engine_oil-spec')).toHaveTextContent(
      /מפרט: 5W-30 · VW 504.00 · 4.0 ליטר/,
    );
    const belt = (await new ManualScheduleRepository(db).list(vehicleId as never))[1];
    expect(screen.getByTestId(`plan-item-manual-${belt.id}-note`)).toHaveTextContent(
      /הערה: מק״ט 6PK1050/,
    );
    expect(screen.getAllByText(/^הערה:/)).toHaveLength(1);
  }, 60000);

  it('both in Garage Mode', async () => {
    await seedSpec();
    await renderRouter('./src/app', { initialUrl: '/garage' });
    await waitFor(() => expect(screen.getByTestId('garage-section-spec')).toBeOnTheScreen(), LONG);
    const g = screen.getByTestId('garage-section-spec');
    expect(g).toHaveTextContent(/5W-30 · VW 504.00 · 4.0 ליטר/);
    expect(g).toHaveTextContent(/DOT 4/);
    expect(g).toHaveTextContent(/רצועת אביזרים.*מק״ט 6PK1050/);
  }, 60000);
});

describe('a note on a row of the table', () => {
  it('the note icon opens the note line; the note is saved with the row', async () => {
    await renderRouter('./src/app', { initialUrl: '/maintenance' });
    await waitFor(() => expect(screen.getByTestId('plan-add-manual')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('plan-add-manual'));
    await waitFor(() => expect(screen.getByTestId('manual-row-0-title')).toBeOnTheScreen(), LONG);
    expect(screen.queryByTestId('manual-row-0-note')).toBeNull();
    await fireEvent.press(screen.getByTestId('manual-row-0-note-toggle'));
    await fireEvent.changeText(screen.getByTestId('manual-row-0-note'), 'שמן 5W-30 בלבד');
    // The stored note of row 2 opens with its value.
    await fireEvent.press(screen.getByTestId('manual-row-1-note-toggle'));
    expect(screen.getByTestId('manual-row-1-note')).toHaveDisplayValue('מק״ט 6PK1050');
    await fireEvent.press(screen.getByTestId('manual-table-save'));

    await waitFor(async () => {
      const saved = await new ManualScheduleRepository(db).list(vehicleId as never);
      expect(saved.map((s) => [s.title, s.note])).toEqual([
        ['שמן מנוע ומסנן שמן', 'שמן 5W-30 בלבד'],
        ['רצועת אביזרים', 'מק״ט 6PK1050'],
      ]);
    }, LONG);
  }, 60000);
});
