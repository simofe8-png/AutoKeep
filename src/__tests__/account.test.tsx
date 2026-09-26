import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { MemoryAccountBackend, VALID_CODE } from '@/features/account/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { OdometerRepository, VehicleRepository, SettingsRepository } from '@/persistence';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * M19 (T138–T143): account & backup on real data. Registration never blocks use; sign-in is a
 * one-time email code; this device's data is adopted into the account and synced; failures are
 * shown and nothing local is lost; signing out keeps the data on the device.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};

let world: PopulatedWorld;
let backend: MemoryAccountBackend;

function configure(account: MemoryAccountBackend | null) {
  configureDataSource({
    kind: 'local',
    openDatabase: async () => world.db,
    ids: sequentialIds(8000),
    clock,
    files: new MemoryFileStore(),
    notifications: null,
    account,
    services: {
      acquisition: {} as OnboardingServices['acquisition'],
      extractor: null,
      registry: {} as OnboardingServices['registry'],
      invoiceReader: null,
    },
  });
}

beforeEach(async () => {
  world = await populatedWorld(sequentialIds(1), T0);
  backend = new MemoryAccountBackend();
  configure(backend);
});
afterEach(() => configureDataSource({ kind: 'demo' }));

async function open(url: string, testID: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen(), LONG);
}

async function signIn() {
  await fireEvent.changeText(screen.getByTestId('account-email'), 'Owner@Example.com');
  await fireEvent.press(screen.getByTestId('account-create'));
  await waitFor(() => expect(screen.getByTestId('account-code')).toBeOnTheScreen());
  await fireEvent.changeText(screen.getByTestId('account-code'), VALID_CODE);
  await fireEvent.press(screen.getByTestId('account-verify'));
  await waitFor(() => expect(screen.getByTestId('account-signed-in')).toBeOnTheScreen(), LONG);
}

describe('account & backup (T138, T140)', () => {
  it('without a configured cloud, the app says backup is unavailable (and stays usable)', async () => {
    configure(null);
    await open('/account', 'screen-account');
    expect(screen.getByTestId('account-unavailable')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-create')).toBeNull();
    expect(screen.getByTestId('backup-status')).toHaveTextContent(/במכשיר בלבד/);
  });

  it('email code sign-in adopts this device’s data and backs it up', async () => {
    await open('/account', 'screen-account');
    await signIn();
    expect(backend.requested).toEqual(['owner@example.com']);
    expect(screen.getByTestId('account-signed-in')).toHaveTextContent(/owner@example.com/);
    await waitFor(() => expect(screen.getByTestId('backup-status')).toHaveTextContent(/מחובר/));
    expect(screen.getByTestId('backup-status')).toHaveTextContent(/26.9.2026/);
    // Every local vehicle reached the account's store.
    expect(backend.stored.get('vehicles')?.size).toBe(2);
    expect(await new SettingsRepository(world.db).get('lastSyncAt')).not.toBeNull();
  }, 40000);

  it('document originals are backed up to the private folder of the user after sign-in (T162)', async () => {
    const files = new MemoryFileStore();
    configureDataSource({
      kind: 'local',
      openDatabase: async () => world.db,
      ids: sequentialIds(8000),
      clock,
      files,
      notifications: null,
      account: backend,
      services: {
        acquisition: {} as OnboardingServices['acquisition'],
        extractor: null,
        registry: {} as OnboardingServices['registry'],
        invoiceReader: null,
      },
    });
    const store = await LocalStore.open(world.db, sequentialIds(70000), clock, files);
    await store.addDocument(
      world.car.id,
      {
        documentId: '00000000-0000-4000-8000-00000000d0e1',
        file: {
          uri: 'file:///cache/m.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 5,
          source: 'file',
        },
        title: 'ספר בעלים',
      },
      'owners_manual',
    );
    await open('/account', 'screen-account');
    await signIn();
    await waitFor(() => expect(backend.objects.size).toBe(1), LONG);
    const [path] = [...backend.objects.keys()];
    expect(path).toBe(
      `user:owner@example.com/${world.car.id}/00000000-0000-4000-8000-00000000d0e1`,
    );
  }, 40000);

  it('a wrong code is explained and nothing is adopted', async () => {
    await open('/account', 'screen-account');
    await fireEvent.changeText(screen.getByTestId('account-email'), 'owner@example.com');
    await fireEvent.press(screen.getByTestId('account-create'));
    await waitFor(() => expect(screen.getByTestId('account-code')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('account-code'), '000000');
    await fireEvent.press(screen.getByTestId('account-verify'));
    await waitFor(() => expect(screen.getByTestId('account-error')).toHaveTextContent(/שגוי/));
    expect(backend.stored.size).toBe(0);
  });

  it('offline changes wait (shown as pending), then back up when the connection returns', async () => {
    await open('/account', 'screen-account');
    await signIn();
    await waitFor(() => expect(screen.getByTestId('backup-status')).toHaveTextContent(/מחובר/));
    const pushedBefore = backend.pushed.length;

    backend.offline = true;
    // A local change while offline (through the domain) is queued in the sync outbox.
    const odo = new OdometerRepository(world.db);
    const latest = (await odo.latest(world.car.id))!;
    await odo.add({
      ...latest,
      id: '00000000-0000-4000-8000-0000000a0d01' as never,
      valueKm: latest.valueKm + 100,
    });
    await fireEvent.press(screen.getByTestId('account-sync-now'));
    await waitFor(() => expect(screen.getByTestId('backup-error')).toHaveTextContent(/רשת/));
    expect(screen.getByTestId('backup-pending')).toBeOnTheScreen();

    backend.offline = false;
    await fireEvent.press(screen.getByTestId('account-sync-now'));
    await waitFor(() => expect(screen.queryByTestId('backup-error')).toBeNull());
    expect(screen.queryByTestId('backup-pending')).toBeNull();
    expect(backend.pushed.length).toBeGreaterThan(pushedBefore);
  }, 40000);

  it('signing out keeps every local record on the device', async () => {
    await open('/account', 'screen-account');
    await signIn();
    await fireEvent.press(screen.getByTestId('account-sign-out'));
    await waitFor(() => expect(screen.getByTestId('account-email')).toBeOnTheScreen());
    expect(await new VehicleRepository(world.db).list()).toHaveLength(2);
  }, 40000);
});

describe('settings (T139, T141, T142)', () => {
  it('reaches account, vehicle management and shows notification/accessibility preferences', async () => {
    await open('/settings', 'screen-settings');
    expect(screen.getByTestId('settings-notifications')).toBeOnTheScreen();
    expect(screen.getByTestId('screen-settings')).toHaveTextContent(/גודל הטקסט עוקב/);
    await fireEvent.press(screen.getByTestId('settings-vehicles'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicles')).toBeOnTheScreen());
    expect(screen.getByTestId('screen-vehicles')).toHaveTextContent(/קורולה/);
    expect(screen.getByTestId('screen-vehicles')).toHaveTextContent(/CB500F/);
  });
});
