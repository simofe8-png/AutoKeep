import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type ServiceTable, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { ServiceTableRepository, VehicleSpecRepository } from '@/persistence';
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
/** The owner's table (SYNTHETIC): oil replaced, the belt checked, with its own note. */
const TABLE: ServiceTable = {
  kmStep: 15000,
  monthsStep: 12,
  columns: 2,
  footnotes: [],
  rows: [
    {
      id: 'r1',
      group: 'מנוע',
      title: 'שמן מנוע ומסנן שמן',
      footnote: null,
      cells: [['replace'], ['replace']],
      rule: null,
    },
    {
      id: 'r2',
      group: 'מנוע',
      title: 'רצועת אביזרים',
      footnote: null,
      cells: [['check'], ['check']],
      rule: null,
      note: 'מק״ט 6PK1050',
    },
  ],
};

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
  await store.saveServiceTable(vehicleId, {
    table: TABLE,
    status: 'confirmed',
    source: 'manual',
    documentId: null,
    unsure: [],
  });
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
    await waitFor(() => expect(screen.getByTestId('periodic-next')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('periodic-group-replace')).toHaveTextContent(
      /שמן מנוע ומסנן שמן.*מפרט: 5W-30 · VW 504.00 · 4.0 ליטר/,
    );
    await fireEvent.press(screen.getByTestId('periodic-toggle-checks'));
    expect(screen.getByTestId('periodic-group-check')).toHaveTextContent(
      /רצועת אביזרים.*הערה: מק״ט 6PK1050/,
    );
    expect(screen.getAllByText(/הערה:/)).toHaveLength(1);
  }, 60000);

  it('Home: tyre pressures under the plate; tap to add when not entered', async () => {
    const view = await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(
      () => expect(screen.getByTestId('vehicle-tire-pressure')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('vehicle-tire-pressure-text')).toHaveTextContent(
      'לחץ אוויר: לא הוזן — הקישו להוספה',
    );
    view.unmount();
    await new VehicleSpecRepository(db).save(
      vehicleId as never,
      {
        ...(await new VehicleSpecRepository(db).get(vehicleId as never)),
        tirePressureFront: '2.3',
        tirePressureRear: '2.1',
      },
      clock.now(),
    );
    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(
      () =>
        expect(screen.getByTestId('vehicle-tire-pressure-text')).toHaveTextContent(
          'לחץ אוויר: קדמי 2.3 · אחורי 2.1',
        ),
      LONG,
    );
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
    await renderRouter('./src/app', { initialUrl: '/maintenance?tab=table' });
    await waitFor(() => expect(screen.getByTestId('table-edit')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('table-row-r2-note')).toHaveTextContent('הערה: מק״ט 6PK1050');
    expect(screen.queryByTestId('table-row-r1-note')).toBeNull();
    await fireEvent.press(screen.getByTestId('table-edit'));
    await fireEvent.press(screen.getByTestId('table-row-r1-title'));
    await waitFor(() => expect(screen.getByTestId('table-row-note')).toBeOnTheScreen(), LONG);
    await fireEvent.changeText(screen.getByTestId('table-row-note'), 'שמן 5W-30 בלבד');
    await fireEvent.press(screen.getByTestId('table-row-save'));

    await waitFor(async () => {
      const saved = await new ServiceTableRepository(db).get(vehicleId as never);
      expect(saved?.table.rows.map((r) => [r.title, r.note])).toEqual([
        ['שמן מנוע ומסנן שמן', 'שמן 5W-30 בלבד'],
        ['רצועת אביזרים', 'מק״ט 6PK1050'],
      ]);
      expect(saved?.status).toBe('confirmed');
    }, LONG);
  }, 60000);
});
