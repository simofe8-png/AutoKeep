import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { ActiveVehicleStore, AlertRepository, DeferredItemRepository } from '@/persistence';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import { MemoryScheduler } from '@/providers/notifications/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * M17 (T126–T132): alerts on real persisted data — explainable, actionable, with a lifecycle
 * (resolve when the condition clears, snooze, deferrals) and vehicle-aware notifications.
 * Day 2026-11-20: the car's oil item was deferred and its last reading is 71 days old.
 */

const LONG = { timeout: 10000 };
const DAY = '2026-11-20';
const clock = {
  now: () => `${DAY}T09:00:00.000Z` as Timestamp,
  today: () => isoDate(DAY) as IsoDate,
};

let world: PopulatedWorld;
let scheduler: MemoryScheduler;

beforeEach(async () => {
  world = await populatedWorld(sequentialIds(1), T0);
  scheduler = new MemoryScheduler();
  configureDataSource({
    kind: 'local',
    openDatabase: async () => world.db,
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

async function carAlerts() {
  return new AlertRepository(world.db).list(world.car.id);
}

async function openAlert(kind: string) {
  // Persist the justified alerts (as the app does on load), then render the router once.
  await (await LocalStore.open(world.db, sequentialIds(40000), clock)).snapshot();
  const a = (await carAlerts()).find((x) => x.kind === kind && x.status === 'active')!;
  await open(`/alerts/${a.id}`, 'screen-alert-detail');
  return a;
}

describe('explainable, actionable alerts (T127–T129, T132)', () => {
  it('stale odometer: why, basis, vehicle; updating the reading resolves it', async () => {
    const a = await openAlert('stale_odometer');
    expect(screen.getByTestId('alert-why')).toHaveTextContent(/71 ימים/);
    expect(screen.getByTestId('alert-basis')).toHaveTextContent(/84,250/);
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/12-345-67/);
    await fireEvent.press(screen.getByTestId('alert-update-odometer'));
    await waitFor(() => expect(screen.getByTestId('screen-odometer')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('odometer-input'), '86,000');
    await fireEvent.press(screen.getByTestId('odometer-save'));
    // Back on the alert: its condition cleared, so it no longer offers the action.
    await waitFor(() => expect(screen.queryByTestId('alert-update-odometer')).toBeNull(), LONG);
    const after = (await carAlerts()).find((x) => x.id === a.id)!;
    expect(after.status).toBe('handled');
    expect(after.basis.facts.resolution).toBe('condition_cleared');
  }, 40000);

  it('deferred action: explained, and resolved when a later service performs the item', async () => {
    await openAlert('deferred');
    expect(screen.getByTestId('alert-why')).toHaveTextContent(/נדחה/);
    expect(screen.getByTestId('alert-basis')).toHaveTextContent(/רישום טיפול 10.12.2025/);
    await fireEvent.press(screen.getByTestId('alert-record-service'));
    await waitFor(() => expect(screen.getByTestId('screen-service-new')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('service-method-manual'));
    await waitFor(() => expect(screen.getByTestId('screen-service-manual')).toBeOnTheScreen());
    // Opened from the alert: the deferred item is preselected as performed.
    expect(screen.getByRole('checkbox', { name: 'שמן מנוע' })).toBeChecked();
    await fireEvent.press(screen.getByTestId('service-to-review'));
    await waitFor(() => expect(screen.getByTestId('screen-service-review')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('service-confirm'));
    await fireEvent.press(screen.getByTestId('service-confirm-dialog-confirm'));
    await waitFor(() => expect(screen.getByTestId('screen-history')).toBeOnTheScreen(), LONG);
    // The record appears once its write (and the alert reconciliation) has been applied.
    await waitFor(() => expect(screen.getByTestId('history-list')).toHaveTextContent(/20.11.2026/));
    expect(await new DeferredItemRepository(world.db).listOpen(world.car.id)).toEqual([]);
    const active = (await carAlerts()).filter((x) => x.status === 'active').map((x) => x.kind);
    expect(active).not.toContain('deferred');
  }, 40000);

  it('a manufacturer item can be consciously deferred at a service (T129)', async () => {
    // First perform the pending oil deferral, then defer oil again at the next visit.
    const store = await LocalStore.open(world.db, sequentialIds(30000), clock);
    const oilId = (await store.snapshot()).bundles[world.car.id].schedule.next!.items[0].id;
    await store.addServiceEvent({
      id: '00000000-0000-4000-8000-00000000f001',
      vehicleId: world.car.id,
      date: '2026-11-01',
      odometerKm: 86000,
      origin: 'manual',
      verification: 'pending',
      sourceAuthority: 'user_report',
      actions: [
        {
          id: 'x',
          title: 'שמן מנוע',
          actionType: 'replacement',
          performed: true,
          maintenanceItemId: oilId,
          unlisted: false,
        },
      ],
      documentIds: [],
    });
    expect(await new DeferredItemRepository(world.db).listOpen(world.car.id)).toEqual([]);

    await open('/service/new', 'screen-service-new');
    await fireEvent.press(screen.getByTestId('service-method-manual'));
    await waitFor(() => expect(screen.getByTestId('screen-service-manual')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId(`action-defer-draft-${oilId}`));
    expect(screen.getByTestId(`action-defer-draft-${oilId}`)).toHaveTextContent(/נדחה/);
    await fireEvent.changeText(screen.getByTestId('new-action-input'), 'בדיקת צמיגים');
    await fireEvent.press(screen.getByTestId('add-action'));
    await fireEvent.press(screen.getByTestId('service-to-review'));
    await fireEvent.press(screen.getByTestId('service-confirm'));
    await fireEvent.press(screen.getByTestId('service-confirm-dialog-confirm'));
    await waitFor(() => expect(screen.getByTestId('screen-history')).toBeOnTheScreen(), LONG);

    const open_ = await new DeferredItemRepository(world.db).listOpen(world.car.id);
    expect(open_).toHaveLength(1);
    expect(open_[0]).toMatchObject({ maintenanceItemId: oilId, deferredAt: DAY });
  }, 40000);

  it('"remind me later" snoozes the alert out of view for a week', async () => {
    const a = await openAlert('stale_odometer');
    await fireEvent.press(screen.getByTestId('alert-snooze'));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
    await waitFor(() => expect(screen.queryByTestId(`alert-card-${a.id}`)).toBeNull());
    const after = (await carAlerts()).find((x) => x.id === a.id)!;
    expect(after).toMatchObject({ status: 'deferred', snoozedUntil: '2026-11-27' });
  }, 30000);
});

describe('notifications (T130, T131)', () => {
  it('opt-in asks permission, then schedules vehicle-named reminders; a tap opens the right vehicle', async () => {
    await new ActiveVehicleStore(world.db).set(world.moto.id, T0);
    await open('/settings', 'screen-settings');
    expect(scheduler.scheduled).toEqual([]);
    await fireEvent(screen.getByTestId('settings-notifications'), 'valueChange', true);
    await waitFor(() => expect(scheduler.scheduled.length).toBeGreaterThan(0));
    expect(scheduler.asked).toBe(1);
    expect(scheduler.scheduled.every((n) => n.title.startsWith('טויוטה קורולה 2019'))).toBe(true);

    // Tapping the reminder for the CAR while the MOTORCYCLE is active switches context.
    const url = scheduler.scheduled[0].url;
    await act(async () => scheduler.tap(url));
    await waitFor(() => expect(screen.getByTestId('screen-alert-detail')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/קורולה/);
    expect(await new ActiveVehicleStore(world.db).get()).toBe(world.car.id);
  }, 40000);

  it('a denied permission keeps notifications off and says so', async () => {
    scheduler.granted = false;
    await open('/settings', 'screen-settings');
    await fireEvent(screen.getByTestId('settings-notifications'), 'valueChange', true);
    await waitFor(() =>
      expect(screen.getByTestId('settings-notifications-denied')).toBeOnTheScreen(),
    );
    expect(scheduler.scheduled).toEqual([]);
  });
  it('where local notifications are unavailable (Expo Go), Settings says so and schedules nothing', async () => {
    configureDataSource({
      kind: 'local',
      openDatabase: async () => world.db,
      ids: sequentialIds(8000),
      clock,
      files: new MemoryFileStore(),
      notifications: null,
      services: {
        acquisition: {} as OnboardingServices['acquisition'],
        extractor: null,
        registry: {} as OnboardingServices['registry'],
        invoiceReader: null,
      },
    });
    await open('/settings', 'screen-settings');
    expect(screen.getByTestId('settings-notifications-unavailable')).toBeOnTheScreen();
    await fireEvent(screen.getByTestId('settings-notifications'), 'valueChange', true);
    expect(scheduler.asked).toBe(0);
  });
});
