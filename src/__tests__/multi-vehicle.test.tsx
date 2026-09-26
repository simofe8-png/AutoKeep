import { act, fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { createSchedule, isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { ActiveVehicleStore, ScheduleRepository, type SqlDatabase } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryScheduler } from '@/providers/notifications/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * M18 (T133–T136): a car, a motorcycle and a scooter in ONE real store. Every screen shows only
 * the active vehicle's data, switching changes context only, and deep links / notifications for
 * one vehicle never show another vehicle's data.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};
const CAR = '00000000-0000-4000-8000-0000000000c1';
const MOTO = '00000000-0000-4000-8000-0000000000c2';
const SCOOTER = '00000000-0000-4000-8000-0000000000c3';

let db: SqlDatabase;
let scheduler: MemoryScheduler;

async function seed() {
  db = await openTestDatabase();
  const store = await LocalStore.open(db, sequentialIds(1), clock, new MemoryFileStore());
  const add = (
    id: string,
    kind: 'car' | 'motorcycle' | 'scooter',
    m: string,
    model: string,
    reg: string,
    km: number,
    at: string,
  ) =>
    store.addVehicle({
      id,
      kind,
      manufacturer: m,
      model,
      year: 2021,
      registration: reg,
      odometerKm: km,
      odometerMeasuredAt: at,
      archived: false,
    });
  await add(CAR, 'car', 'טויוטה', 'קורולה', '12-345-67', 84250, '2026-09-10');
  await add(MOTO, 'motorcycle', 'הונדה', 'CB500F', '123-45-678', 18420, '2026-06-02');
  await add(SCOOTER, 'scooter', 'ימאהה', 'XMAX 300', '98-765-43', 9650, '2026-09-01');

  // Only the motorcycle has a verified, distance-based schedule (its reading is stale → alert).
  const ids = sequentialIds(500);
  const s = createSchedule(
    {
      vehicleId: MOTO as never,
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
              manufacturerText: 'בדיקת מתיחות',
              reference: { sourceId: ids.next(), page: 88 },
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
  if (!s.ok) throw new Error('fixture');
  await new ScheduleRepository(db).add(s.value);

  for (const [vid, title] of [
    [CAR, 'שירות רכב'],
    [MOTO, 'שירות אופנוע'],
    [SCOOTER, 'שירות קטנוע'],
  ] as const) {
    await store.addServiceEvent({
      id: `${vid.slice(0, -2)}e${vid.slice(-1)}`,
      vehicleId: vid,
      date: '2026-05-01',
      odometerKm: 1000,
      origin: 'manual',
      verification: 'pending',
      sourceAuthority: 'user_report',
      actions: [{ id: 'a', title, actionType: 'other', performed: true, unlisted: true }],
      documentIds: [],
    });
    await store.addGarageRecommendation({
      id: `${vid.slice(0, -2)}f${vid.slice(-1)}`,
      vehicleId: vid,
      text: `הערה ל${title}`,
      date: '2026-05-01',
    });
  }
  await store.setActiveVehicle(CAR);
  await store.snapshot();
}

beforeEach(async () => {
  await seed();
  scheduler = new MemoryScheduler();
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(8000),
    clock,
    files: new MemoryFileStore(),
    notifications: scheduler,
    services: {
      acquisition: {} as OnboardingServices['acquisition'],
      extractor: null,
      registry: {} as OnboardingServices['registry'],
      invoiceReader: null,
    },
  });
});
afterEach(() => configureDataSource({ kind: 'demo' }));

async function open(url: string, testID: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen(), LONG);
}

async function switchTo(id: string) {
  await fireEvent.press(screen.getByTestId('active-vehicle-chip'));
  await waitFor(() => expect(screen.getByTestId('screen-vehicles')).toBeOnTheScreen());
  await fireEvent.press(screen.getByTestId(`vehicle-select-${id}`));
  await waitFor(() => expect(screen.queryByTestId('screen-vehicles')).toBeNull());
}

const OTHERS: Record<string, RegExp> = {
  [CAR]: /אופנוע|קטנוע/,
  [MOTO]: /שירות רכב|קטנוע/,
  [SCOOTER]: /שירות רכב|אופנוע/,
};

describe('car + motorcycle + scooter (T133–T135)', () => {
  it('history shows only the active vehicle, across repeated switching', async () => {
    await open('/history', 'screen-history');
    const order = [MOTO, SCOOTER, CAR, SCOOTER, MOTO, CAR, MOTO];
    for (const id of order) {
      await switchTo(id);
      await waitFor(() =>
        expect(screen.getByTestId('history-list')).not.toHaveTextContent(OTHERS[id]),
      );
      const own = id === CAR ? /שירות רכב/ : id === MOTO ? /שירות אופנוע/ : /שירות קטנוע/;
      expect(screen.getByTestId('history-list')).toHaveTextContent(own);
    }
    // Switching changes only the pointer — it is persisted, and no data moved.
    expect(await new ActiveVehicleStore(db).get()).toBe(MOTO);
  }, 60000);

  it('each vehicle keeps its own schedule state, odometer and garage notes', async () => {
    await open('/garage', 'screen-garage');
    expect(screen.getByTestId('garage-section-manufacturer')).toHaveTextContent(/אין לוח/);
    expect(screen.getByTestId('garage-section-garage')).toHaveTextContent(/הערה לשירות רכב/);
    expect(screen.getByTestId('garage-section-garage')).not.toHaveTextContent(/אופנוע|קטנוע/);
    await fireEvent.press(screen.getByTestId('screen-header-back'));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen());
    await switchTo(MOTO);
    await waitFor(() =>
      expect(screen.getByTestId('active-vehicle-chip')).toHaveTextContent(/18,420/),
    );
    expect(screen.getByTestId('home-alerts')).toBeOnTheScreen();
    await switchTo(SCOOTER);
    await waitFor(() =>
      expect(screen.getByTestId('active-vehicle-chip')).toHaveTextContent(/9,650/),
    );
    expect(screen.queryByTestId('home-alerts')).toBeNull();
  }, 60000);

  it('a record opened by id shows its OWN vehicle, even when another vehicle is active', async () => {
    await open(`/service/${MOTO.slice(0, -2)}e2`, 'screen-service-detail');
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/CB500F/);
    expect(screen.getByTestId('screen-service-detail')).not.toHaveTextContent(/קורולה/);
  });

  it('recording a service targets the active vehicle, and names it before confirming', async () => {
    await open('/', 'screen-home');
    await switchTo(SCOOTER);
    await fireEvent.press(screen.getByTestId('home-record-service'));
    await waitFor(() => expect(screen.getByTestId('screen-service-new')).toBeOnTheScreen());
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/XMAX 300/);
  }, 40000);
});

describe('notifications / deep links (T136)', () => {
  it('each reminder names its vehicle; tapping one opens that vehicle only', async () => {
    await open('/settings', 'screen-settings');
    await fireEvent(screen.getByTestId('settings-notifications'), 'valueChange', true);
    await waitFor(() => expect(scheduler.scheduled.length).toBeGreaterThan(0));
    // Only the motorcycle has a justified alert (stale reading on a distance schedule).
    expect(scheduler.scheduled.every((n) => n.title.startsWith('הונדה CB500F'))).toBe(true);
    await act(async () => scheduler.tap(scheduler.scheduled[0].url));
    await waitFor(() => expect(screen.getByTestId('screen-alert-detail')).toBeOnTheScreen(), LONG);
    const detail = screen.getByTestId('screen-alert-detail');
    expect(within(detail).getByTestId('vehicle-target-banner')).toHaveTextContent(/CB500F/);
    expect(detail).not.toHaveTextContent(/קורולה|XMAX/);
    expect(await new ActiveVehicleStore(db).get()).toBe(MOTO);
  }, 40000);
});
