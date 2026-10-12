import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type ServiceTable, type Timestamp, type VehicleId } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { ServiceEventVM } from '@/features/data/types';
import type { OnboardingServices } from '@/features/onboarding/services';
import { ServiceRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * History is the source of truth for "last performed" (2026-10-12), on the real local store:
 * History → latest performed event → maintenance due. Records can be added and deleted; the
 * owner can track items beyond the schedule.
 */
const LONG = { timeout: 15000 };
const clock = {
  now: () => '2026-10-12T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-10-12') as IsoDate,
};
const CAR = '00000000-0000-4000-8000-00000000c001';
let db: Awaited<ReturnType<typeof openTestDatabase>>;
let store: LocalStore;

// 15,000 km / 12 months per column: oil every column, air filter every second column, brake fluid
// by rule every 24 months.
const TABLE: ServiceTable = {
  kmStep: 15_000,
  monthsStep: 12,
  columns: 4,
  footnotes: [],
  rows: [
    {
      id: 'air',
      group: 'מנוע',
      title: 'מסנן אוויר',
      footnote: null,
      cells: [[], ['replace'], [], ['replace']],
      rule: null,
    },
    {
      id: 'oil',
      group: 'מנוע',
      title: 'שמן מנוע',
      footnote: null,
      cells: [['replace'], ['replace'], ['replace'], ['replace']],
      rule: null,
    },
    {
      id: 'brake',
      group: 'בלמים',
      title: 'נוזל בלמים',
      footnote: null,
      cells: null,
      rule: { action: 'replace', everyMonths: 24, everyKm: null, text: 'החלף כל שנתיים' },
    },
  ],
};

async function seed() {
  db = await openTestDatabase();
  store = await LocalStore.open(db, sequentialIds(1), clock, new MemoryFileStore());
  await store.addVehicle(
    {
      id: CAR,
      kind: 'car',
      manufacturer: 'פורד גרמניה',
      model: 'FIESTA',
      year: 2012,
      registration: '12-345-67',
      odometerKm: 296_000,
      odometerMeasuredAt: '2026-10-12',
      archived: false,
    },
    { engine: '1388 סמ״ק' },
  );
  await store.setActiveVehicle(CAR);
  await store.saveServiceTable(CAR, {
    table: TABLE,
    status: 'confirmed',
    source: 'manual',
    documentId: null,
    unsure: [],
  });
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(7000),
    clock,
    files: new MemoryFileStore(),
    services: {
      acquisition: {
        captureWithCamera: async () => ({ status: 'cancelled' }),
        pickImage: async () => ({ status: 'cancelled' }),
        pickDocument: async () => ({ status: 'cancelled' }),
      },
      extractor: null,
      registry: {} as OnboardingServices['registry'],
      invoiceReader: null,
    },
  });
}
afterEach(() => configureDataSource({ kind: 'demo' }));

/** A historical service entered by hand: date, mileage, performed items, optional note. */
const service = (date: string, km: number, items: string[], notes?: string): ServiceEventVM => ({
  id: '',
  vehicleId: CAR,
  date,
  odometerKm: km,
  notes,
  origin: 'manual',
  verification: 'pending',
  sourceAuthority: 'user_report',
  documentIds: [],
  actions: items.map((title) => ({
    id: '',
    title,
    actionType: 'replacement',
    performed: true,
    unlisted: true,
  })),
});

const events = () => new ServiceRepository(db).list(CAR as VehicleId);

async function periodic() {
  await renderRouter('./src/app', { initialUrl: '/maintenance' });
  await waitFor(() => expect(screen.getByTestId('screen-maintenance')).toBeOnTheScreen(), LONG);
  await fireEvent.press(screen.getByTestId('maintenance-tabs-periodic'));
  await waitFor(() => expect(screen.getByTestId('periodic-next')).toBeOnTheScreen(), LONG);
}

describe('History → latest performed event → maintenance due', () => {
  it('a historical service is added; its replaced item is not recommended again too early', async () => {
    await seed();
    await store.addServiceEvent(
      service('2026-09-01', 295_000, ['החלפת מסנן אוויר'], 'מוסך השכונה'),
    );
    expect((await events()).map((e) => [e.date, e.odometerKm, e.notes])).toEqual([
      ['2026-09-01', 295_000, 'מוסך השכונה'],
    ]);

    await periodic();
    expect(screen.getByTestId('periodic-next-title')).toHaveTextContent(/300,000/);
    // Replaced at 295,000: not part of the 300,000 service; shown as done recently instead.
    expect(screen.queryByTestId('periodic-item-air')).toBeNull();
    expect(screen.getByTestId('periodic-recent-air')).toHaveTextContent(/295,000/);
    expect(screen.getByTestId('periodic-recent-air')).toHaveTextContent(/325,000/);
    // The oil was not replaced: still recommended.
    expect(screen.getByTestId('periodic-item-oil')).toBeOnTheScreen();
  }, 120000);

  it('history already answers "when was it last done": no question for that item', async () => {
    await seed();
    await periodic();
    expect(screen.getByTestId('periodic-unknown-brake')).toBeOnTheScreen();
    await store.addServiceEvent(service('2025-11-01', 280_000, ['נוזל בלמים']));
    await periodic();
    expect(screen.queryByTestId('periodic-unknown-brake')).toBeNull();
    // Due 24 months after the recorded replacement: in the service after next.
    expect(screen.getByTestId('periodic-after')).toHaveTextContent(/נוזל בלמים/);
    expect(screen.getByTestId('periodic-after')).toHaveTextContent(/1\.11\.2027/);
  }, 120000);

  it('deleting the latest record falls back to the previous matching one', async () => {
    await seed();
    await store.addServiceEvent(service('2024-01-10', 250_000, ['נוזל בלמים']));
    await store.addServiceEvent(service('2026-01-10', 290_000, ['נוזל בלמים']));
    const rule = async () => {
      const snap = await store.snapshot();
      const plan = snap.bundles[CAR].serviceTable?.plan;
      return [...(plan?.next.rules ?? []), ...(plan?.after.rules ?? [])].find(
        (r) => r.rowId === 'brake',
      );
    };
    expect(await rule()).toMatchObject({ dueDate: '2028-01-10', lastDone: { km: 290_000 } });

    const latest = (await events()).find((e) => e.odometerKm === 290_000)!;
    await store.deleteServiceEvent(CAR, latest.id);
    expect(await rule()).toMatchObject({ dueDate: '2026-01-10', lastDone: { km: 250_000 } });
  }, 120000);

  it('a service record is deleted from its detail screen after confirmation; the plan recomputes', async () => {
    await seed();
    await store.addServiceEvent(service('2026-09-01', 295_000, ['מסנן אוויר']));
    const [e] = await events();

    await renderRouter('./src/app', { initialUrl: `/service/${e.id}` });
    await waitFor(
      () => expect(screen.getByTestId('screen-service-detail')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('service-delete'));
    expect(screen.getByTestId('service-delete-dialog')).toHaveTextContent(/יחושבו מחדש/);
    await fireEvent.press(screen.getByTestId('service-delete-dialog-confirm'));
    await waitFor(async () => expect(await events()).toEqual([]), LONG);
    // Its odometer reading went with it.
    const readings = await db.all<{ value_km: number }>(
      'SELECT value_km FROM odometer_readings WHERE vehicle_id = ?',
      [CAR],
    );
    expect(readings.map((r) => r.value_km)).toEqual([296_000]);

    await periodic();
    expect(screen.getByTestId('periodic-item-air')).toBeOnTheScreen();
    expect(screen.queryByTestId('periodic-recent')).toBeNull();
  }, 120000);

  it('a custom tracked item is added with its last date and km, and persists', async () => {
    await seed();
    await periodic();
    await fireEvent.press(screen.getByTestId('tracked-add'));
    await fireEvent.changeText(screen.getByTestId('tracked-title'), 'החלפת מצבר');
    await fireEvent.changeText(screen.getByTestId('tracked-date'), '15.03.2026');
    await fireEvent.changeText(screen.getByTestId('tracked-km'), '288000');
    await fireEvent.press(screen.getByTestId('tracked-save'));

    await waitFor(async () => {
      const snap = await store.snapshot();
      expect(snap.bundles[CAR].trackedItems).toEqual([
        expect.objectContaining({
          title: 'החלפת מצבר',
          lastDone: expect.objectContaining({ date: '2026-03-15', km: 288_000, source: 'history' }),
        }),
      ]);
    }, LONG);
    // Recorded as a history record (the one source of "last performed").
    expect((await events()).map((e) => [e.date, e.odometerKm, e.actions[0].title])).toEqual([
      ['2026-03-15', 288_000, 'החלפת מצבר'],
    ]);
    const [item] = (await store.snapshot()).bundles[CAR].trackedItems!;
    await waitFor(() =>
      expect(screen.getByTestId(`tracked-${item.id}-last`)).toHaveTextContent(/288,000/),
    );

    // Survives a restart.
    const reopened = await LocalStore.open(
      await openTestDatabase(db.export()),
      sequentialIds(9000),
      clock,
    );
    expect((await reopened.snapshot()).bundles[CAR].trackedItems).toEqual([
      expect.objectContaining({
        title: 'החלפת מצבר',
        lastDone: expect.objectContaining({ km: 288_000 }),
      }),
    ]);
  }, 120000);
});
