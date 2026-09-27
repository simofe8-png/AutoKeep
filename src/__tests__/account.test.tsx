import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { MemoryAccountBackend, TEST_PASSWORD, VALID_INVITATION } from '@/features/account/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { OdometerRepository, VehicleRepository, SettingsRepository } from '@/persistence';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * M19 (T138–T143) + Private Beta auth: account & backup on real data. Registration never blocks
 * use; accounts come from an invitation (Username + Password); sign-in is Username + Password;
 * this device's data is adopted into the account and synced; failures are shown and nothing local
 * is lost; signing out keeps the data on the device.
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

async function signIn(username = ' Owner ') {
  backend.addAccount('Owner');
  await fireEvent.changeText(screen.getByTestId('account-username'), username);
  await fireEvent.changeText(screen.getByTestId('account-password'), TEST_PASSWORD);
  await fireEvent.press(screen.getByTestId('account-sign-in'));
  await waitFor(() => expect(screen.getByTestId('account-signed-in')).toBeOnTheScreen(), LONG);
}

async function fillInvite(username: string, password: string, confirm = password) {
  await fireEvent.changeText(screen.getByTestId('invite-username'), username);
  await fireEvent.changeText(screen.getByTestId('invite-password'), password);
  await fireEvent.changeText(screen.getByTestId('invite-password-confirm'), confirm);
}

describe('account & backup (T138, T140)', () => {
  it('without a configured cloud, the app says backup is unavailable (and stays usable)', async () => {
    configure(null);
    await open('/account', 'screen-account');
    expect(screen.getByTestId('account-unavailable')).toBeOnTheScreen();
    expect(screen.queryByTestId('account-sign-in')).toBeNull();
    expect(screen.getByTestId('backup-status')).toHaveTextContent(/במכשיר בלבד/);
  });

  it('Username + Password sign-in adopts this device’s data and backs it up', async () => {
    await open('/account', 'screen-account');
    // No e-mail and no code anywhere in the Beta sign-in.
    expect(screen.getByTestId('screen-account')).not.toHaveTextContent(/אימייל|קוד/);
    await signIn(' OWNER ');
    expect(screen.getByTestId('account-signed-in')).toHaveTextContent(/Owner/);
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
    expect(path).toBe(`user:owner/${world.car.id}/00000000-0000-4000-8000-00000000d0e1`);
  }, 40000);

  it('a wrong password or unknown username is explained the same way; nothing is adopted', async () => {
    backend.addAccount('Owner');
    await open('/account', 'screen-account');
    for (const [u, pw] of [
      ['owner', 'wrong!'],
      ['nobody', TEST_PASSWORD],
    ]) {
      await fireEvent.changeText(screen.getByTestId('account-username'), u);
      await fireEvent.changeText(screen.getByTestId('account-password'), pw);
      await fireEvent.press(screen.getByTestId('account-sign-in'));
      await waitFor(() =>
        expect(screen.getByTestId('account-error')).toHaveTextContent(/שם המשתמש או הסיסמה שגויים/),
      );
    }
    expect(backend.stored.size).toBe(0);
    expect(screen.getByTestId('screen-account')).toHaveTextContent(/פנו למנהל הבטא/);
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
    await waitFor(() => expect(screen.getByTestId('account-username')).toBeOnTheScreen());
    expect(await new VehicleRepository(world.db).list()).toHaveLength(2);
  }, 40000);

  it('changing the password: no rules of AutoKeep, only the provider floor is reported', async () => {
    await open('/account', 'screen-account');
    await signIn();
    await fireEvent.press(screen.getByTestId('account-change-password-open'));
    await fireEvent.changeText(screen.getByTestId('account-new-password'), 'abc');
    await fireEvent.changeText(screen.getByTestId('account-new-password-confirm'), 'abd');
    expect(screen.getByTestId('account-save-password')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('account-new-password-confirm'), 'abc');
    await fireEvent.press(screen.getByTestId('account-save-password'));
    await waitFor(() =>
      expect(screen.getByTestId('account-password-notice')).toHaveTextContent(
        /Supabase.*6 תווים.*לא של AutoKeep/,
      ),
    );
    // Any 6 characters are accepted: no classes, no strength rules.
    await fireEvent.changeText(screen.getByTestId('account-new-password'), 'aaaaaa');
    await fireEvent.changeText(screen.getByTestId('account-new-password-confirm'), 'aaaaaa');
    await fireEvent.press(screen.getByTestId('account-save-password'));
    await waitFor(() =>
      expect(screen.getByTestId('account-password-notice')).toHaveTextContent(/הסיסמה עודכנה/),
    );
    expect(backend.accounts.get('owner')?.password).toBe('aaaaaa');
  }, 40000);
});

describe('Private Beta invitation registration', () => {
  it('an invitation link opens registration; the tester chooses username and password', async () => {
    await open(`/invite?t=${VALID_INVITATION}`, 'screen-invite');
    expect(screen.getByTestId('invite-from-link')).toBeOnTheScreen();
    expect(screen.queryByTestId('invite-link')).toBeNull();
    // Only username, password and its confirmation are asked.
    expect(screen.getByTestId('screen-invite')).not.toHaveTextContent(/אימייל|טלפון|קוד/);
    await fillInvite('  Dana K ', 'a b c 1', 'a b c 2');
    expect(screen.getByTestId('invite-submit')).toBeDisabled();
    await fillInvite('  Dana K ', 'a b c 1');
    await fireEvent.press(screen.getByTestId('invite-submit'));
    await waitFor(() => expect(screen.getByTestId('account-signed-in')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('account-signed-in')).toHaveTextContent(/Dana K/);
    expect(backend.invitations.get(VALID_INVITATION)).toBe('used');
    expect(backend.accounts.get('dana k')?.password).toBe('a b c 1');
    await waitFor(() => expect(backend.stored.get('vehicles')?.size).toBe(2), LONG);
  }, 40000);

  it('from the sign-in screen, a pasted invitation link works too', async () => {
    await open('/account', 'screen-account');
    await fireEvent.press(screen.getByTestId('account-have-invitation'));
    await waitFor(() => expect(screen.getByTestId('screen-invite')).toBeOnTheScreen(), LONG);
    await fireEvent.changeText(screen.getByTestId('invite-link'), 'not a link');
    expect(screen.getByTestId('invite-submit')).toBeDisabled();
    await fireEvent.changeText(
      screen.getByTestId('invite-link'),
      `הוזמנת: autokeep://invite?t=${VALID_INVITATION}`,
    );
    await fillInvite('dana', 'secret');
    await fireEvent.press(screen.getByTestId('invite-submit'));
    await waitFor(() => expect(screen.getByTestId('account-signed-in')).toBeOnTheScreen(), LONG);
  }, 40000);

  const tryWith = async (username: string, password: string, message: RegExp) => {
    await fillInvite(username, password);
    await fireEvent.press(screen.getByTestId('invite-submit'));
    await waitFor(() => expect(screen.getByTestId('invite-error')).toHaveTextContent(message));
  };

  it('a taken username and the provider floor are explained; the invitation is kept', async () => {
    backend.addAccount('Taken');
    await open(`/invite?t=${VALID_INVITATION}`, 'screen-invite');
    await tryWith('TAKEN ', 'secret', /תפוס/);
    await tryWith('new-user', '12345', /Supabase.*6 תווים/);
    expect(backend.invitations.get(VALID_INVITATION)).toBe('unused');
    expect(backend.accounts.size).toBe(1);
  }, 40000);

  it.each([
    ['used', /כבר נוצלה/],
    ['expired', /פג/],
    ['revoked', /אינו תקף/],
  ] as const)(
    'a %s invitation is refused and creates nothing',
    async (state, message) => {
      const token = `${state}-invitation-${'0'.repeat(32)}`;
      backend.invitations.set(token, state);
      await open(`/invite?t=${token}`, 'screen-invite');
      await tryWith('someone', 'secret', message);
      expect(backend.accounts.size).toBe(0);
    },
    40000,
  );
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
