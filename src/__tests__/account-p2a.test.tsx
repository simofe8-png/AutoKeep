import { act, fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';
import { AppState, type AppStateStatus } from 'react-native';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { MemoryAccountBackend, VALID_CODE } from '@/features/account/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * P2A (app level): account deletion flow with an explicit, typed confirmation; failures change
 * nothing; the session lifecycle (foreground-only token refresh, sign-in elsewhere ending) and
 * automatic backup triggers (app start, foreground, local change).
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-27T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-27') as IsoDate,
};

let world: PopulatedWorld;
let backend: MemoryAccountBackend;
let appStateListener: ((s: AppStateStatus) => void) | null = null;

beforeEach(async () => {
  world = await populatedWorld(sequentialIds(1), T0);
  backend = new MemoryAccountBackend();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListener = listener as (s: AppStateStatus) => void;
    return { remove: () => (appStateListener = null) } as ReturnType<
      typeof AppState.addEventListener
    >;
  });
  configureDataSource({
    kind: 'local',
    openDatabase: async () => world.db,
    ids: sequentialIds(8000),
    clock,
    files: new MemoryFileStore(),
    notifications: null,
    account: backend,
    services: {
      acquisition: {} as OnboardingServices['acquisition'],
      extractor: null,
      registry: {} as OnboardingServices['registry'],
      invoiceReader: null,
    },
  });
});
afterEach(() => {
  configureDataSource({ kind: 'demo' });
  jest.restoreAllMocks();
});

async function open(url: string, testID: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen(), LONG);
}

async function signIn() {
  await fireEvent.changeText(screen.getByTestId('account-email'), 'owner@example.com');
  await fireEvent.press(screen.getByTestId('account-create'));
  await waitFor(() => expect(screen.getByTestId('account-code')).toBeOnTheScreen());
  await fireEvent.changeText(screen.getByTestId('account-code'), VALID_CODE);
  await fireEvent.press(screen.getByTestId('account-verify'));
  await waitFor(() => expect(screen.getByTestId('account-signed-in')).toBeOnTheScreen(), LONG);
  await waitFor(() => expect(screen.getByTestId('backup-status')).toHaveTextContent(/מחובר/), LONG);
}

const vehicles = async () =>
  (await world.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM vehicles'))?.n ?? 0;

describe('account deletion (P2A)', () => {
  it('requires typing the account email, then deletes the account and this device’s data', async () => {
    await open('/account', 'screen-account');
    await signIn();
    await fireEvent.press(screen.getByTestId('account-delete'));
    const dialog = screen.getByTestId('account-delete-dialog');
    expect(dialog).toHaveTextContent(/לא ניתן לבטל/);
    expect(dialog).toHaveTextContent(/המסמכים והקבצים המקוריים/);

    // Not armed until the exact account email is typed.
    await fireEvent.press(screen.getByTestId('account-delete-dialog-confirm'));
    expect(backend.deletedAccounts).toEqual([]);
    await fireEvent.changeText(
      screen.getByTestId('account-delete-confirm-input'),
      'someone@else.com',
    );
    await fireEvent.press(screen.getByTestId('account-delete-dialog-confirm'));
    expect(backend.deletedAccounts).toEqual([]);

    await fireEvent.changeText(
      screen.getByTestId('account-delete-confirm-input'),
      'Owner@Example.com',
    );
    await fireEvent.press(screen.getByTestId('account-delete-dialog-confirm'));
    await waitFor(() => expect(backend.deletedAccounts).toEqual(['owner@example.com']), LONG);
    await waitFor(() => expect(screen.queryByTestId('screen-account')).toBeNull(), LONG);
    expect(await vehicles()).toBe(0);
  }, 60000);

  it('a failed deletion is reported and deletes nothing on this device', async () => {
    await open('/account', 'screen-account');
    await signIn();
    backend.deleteFails = 'server';
    await fireEvent.press(screen.getByTestId('account-delete'));
    await fireEvent.changeText(
      screen.getByTestId('account-delete-confirm-input'),
      'owner@example.com',
    );
    await fireEvent.press(screen.getByTestId('account-delete-dialog-confirm'));
    await waitFor(() => expect(screen.getByTestId('account-delete-error')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('account-delete-error')).toHaveTextContent(/דבר לא נמחק מהמכשיר/);
    expect(await vehicles()).toBe(2);
    expect(screen.getByTestId('account-signed-in')).toBeOnTheScreen();
  }, 60000);
});

describe('session lifecycle and automatic backup (P2A)', () => {
  it('token refresh runs only in the foreground; returning to the foreground backs up', async () => {
    await open('/account', 'screen-account');
    await signIn();
    const pushedBefore = backend.pushed.length;
    await world.db.run("UPDATE vehicles SET trim = 'bg-edit' WHERE id = ?", [world.car.id]);

    await act(async () => appStateListener?.('background'));
    expect(backend.active).toBe(false);
    await act(async () => appStateListener?.('active'));
    expect(backend.active).toBe(true);
    await waitFor(() => expect(backend.pushed.length).toBeGreaterThan(pushedBefore), LONG);
  }, 60000);

  it('a session that ends elsewhere is reflected (signed out, local data kept)', async () => {
    await open('/account', 'screen-account');
    await signIn();
    await act(async () => backend.expireSession());
    await waitFor(() => expect(screen.getByTestId('account-email')).toBeOnTheScreen(), LONG);
    expect(await vehicles()).toBe(2);
  }, 60000);

  it('an adopted, signed-in device backs up automatically on app start', async () => {
    // A previous run signed in and adopted; a change was made afterwards (e.g. offline).
    const store = await LocalStore.open(
      world.db,
      sequentialIds(9000),
      clock,
      new MemoryFileStore(),
    );
    await backend.verifyCode('owner@example.com', VALID_CODE);
    await store.connectAccount(backend);
    await world.db.run("UPDATE vehicles SET trim = 'offline-edit' WHERE id = ?", [world.car.id]);
    const before = backend.pushed.length;

    await open('/', 'screen-home');
    await waitFor(() => expect(backend.pushed.length).toBeGreaterThan(before), LONG);
    expect(backend.pushed.some((o) => o.entity_id === world.car.id)).toBe(true);
  }, 60000);
});

it('sign-out affects this device only (wording) and keeps the data', async () => {
  await open('/account', 'screen-account');
  await signIn();
  expect(screen.getByTestId('account-sign-out')).toHaveTextContent(/מהמכשיר הזה/);
  await fireEvent.press(screen.getByTestId('account-sign-out'));
  await waitFor(() => expect(screen.getByTestId('account-email')).toBeOnTheScreen(), LONG);
  expect(await vehicles()).toBe(2);
}, 60000);
