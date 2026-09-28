import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { MemoryAccountBackend, TEST_PASSWORD } from '@/features/account/testing';
import { configureDataSource } from '@/features/data/dataSource';
import type { OnboardingServices } from '@/features/onboarding/services';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';
import type { SqlDatabase } from '@/persistence';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Screen parity with the approved visual references (docs/design/README.md): the behaviours the
 * corrected screens add or move — existing-user sign-in from the welcome screen, alerts grouped by
 * urgency with their actions, the plan timeline and the next-service detail, the vehicle details.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};

function configureLocal(db: SqlDatabase, account: MemoryAccountBackend) {
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
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

async function open(url: string, testID: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen(), LONG);
}

afterEach(() => configureDataSource({ kind: 'demo' }));

describe('existing Private Beta user on a new device', () => {
  it('fresh install → welcome → "יש לי חשבון — התחברות" → Username + Password, no vehicle first', async () => {
    const backend = new MemoryAccountBackend();
    backend.addAccount('Dana');
    configureLocal(await openTestDatabase(), backend);

    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-welcome')).toBeOnTheScreen(),
      LONG,
    );
    // The approved welcome: add the first vehicle, or sign in to an existing account.
    expect(screen.getByTestId('onboarding-add-first')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('onboarding-sign-in'));
    await waitFor(() => expect(screen.getByTestId('screen-account')).toBeOnTheScreen(), LONG);

    await fireEvent.changeText(screen.getByTestId('account-username'), 'dana');
    await fireEvent.changeText(screen.getByTestId('account-password'), TEST_PASSWORD);
    await fireEvent.press(screen.getByTestId('account-sign-in'));
    await waitFor(() => expect(screen.getByTestId('account-restoring')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('account-signed-in')).toHaveTextContent(/Dana/);
    // No vehicle in this account yet: the user continues into the app explicitly.
    await fireEvent.press(screen.getByTestId('account-continue'));
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-welcome')).toBeOnTheScreen(),
      LONG,
    );
  }, 40000);

  it('once the account data is on the device, signing in from the welcome lands on Home', async () => {
    const world = await populatedWorld(sequentialIds(1), T0);
    const backend = new MemoryAccountBackend();
    backend.addAccount('Dana');
    configureLocal(world.db, backend);

    await open('/account?from=welcome', 'screen-account');
    await fireEvent.changeText(screen.getByTestId('account-username'), 'Dana');
    await fireEvent.changeText(screen.getByTestId('account-password'), TEST_PASSWORD);
    await fireEvent.press(screen.getByTestId('account-sign-in'));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('vehicle-hero')).toHaveTextContent(/קורולה/);
  }, 40000);
});

describe('alerts after the approved reference', () => {
  it('groups by urgency, filters, and "סמן כטופל" opens recording for the alert item', async () => {
    await open('/alerts', 'screen-alerts');
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/12-345-67/);
    expect(screen.getByTestId('alerts-group-soon')).toHaveTextContent(/טיפול 90,000/);
    // Every urgency group is offered with its count (reference), empty ones included.
    expect(screen.getByTestId('alerts-filter-urgent')).toHaveTextContent(/\(0\)/);
    await fireEvent.press(screen.getByTestId('alerts-filter-soon'));
    expect(screen.getByTestId('alerts-group-soon')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('alert-card-alert-car-upcoming-open'));
    await waitFor(() => expect(screen.getByTestId('screen-alert-detail')).toBeOnTheScreen());
    expect(screen.getByTestId('alert-status')).toHaveTextContent(/טיפול 90,000/);
    await fireEvent.press(screen.getByTestId('alert-record-service'));
    await waitFor(() => expect(screen.getByTestId('screen-service-new')).toBeOnTheScreen());
    expect(screen.getByTestId('service-from-alert')).toBeOnTheScreen();
  }, 40000);
});

describe('maintenance plan and next-service detail', () => {
  it('timeline shows recorded, next and upcoming services; filters narrow it', async () => {
    await open('/maintenance', 'screen-maintenance');
    expect(screen.getByTestId('plan-source-banner')).toHaveTextContent(/מאומתת/);
    const timeline = screen.getByTestId('plan-timeline');
    expect(within(timeline).getByTestId('plan-item-next')).toHaveTextContent(/הטיפול הבא/);
    expect(within(timeline).getByTestId('plan-item-svc-car-1')).toHaveTextContent(/בוצע/);
    await fireEvent.press(screen.getByTestId('plan-filter-future'));
    expect(screen.queryByTestId('plan-item-next')).toBeNull();
    expect(screen.queryByTestId('plan-item-svc-car-1')).toBeNull();
    expect(screen.getByTestId('plan-timeline')).toHaveTextContent(/105,000/);
  }, 40000);

  it('next-service detail keeps garage recommendations apart as "not mandatory"; no AI group', async () => {
    await open('/next-service', 'screen-next-service');
    expect(screen.getByTestId('next-service-manufacturer')).toHaveTextContent(/שמן מנוע/);
    expect(screen.getByTestId('next-service-garage')).toHaveTextContent(/לא חובה/);
    expect(screen.getByTestId('next-service-manufacturer')).not.toHaveTextContent(
      /רפידות בלם קדמיות/,
    );
    expect(screen.getByTestId('screen-next-service')).not.toHaveTextContent(/AI|ממליץ/);
  }, 40000);
});

describe('vehicles after the approved reference', () => {
  it('cards never claim "תקין"; the vehicle detail lists only known facts', async () => {
    await open('/vehicles', 'screen-vehicles');
    expect(screen.getByTestId('screen-vehicles')).not.toHaveTextContent(/תקין/);
    expect(screen.getByTestId('vehicle-card-mock-vehicle-car')).toHaveTextContent(/רכב פעיל/);
    await fireEvent.press(screen.getByTestId('vehicle-manage-mock-vehicle-car'));
    await waitFor(() => expect(screen.getByTestId('screen-vehicle-manage')).toBeOnTheScreen());
    const details = screen.getByTestId('vehicle-details');
    expect(details).toHaveTextContent(/טויוטה/);
    expect(details).toHaveTextContent(/1.8/);
    expect(details).toHaveTextContent(/12-345-67/);
    // No VIN recorded for this vehicle: the row is absent, not invented.
    expect(details).not.toHaveTextContent(/VIN/);
  }, 40000);
});

describe('service recording without an open draft', () => {
  it('is never a blank dead end', async () => {
    await open('/service/manual', 'screen-service-no-draft');
    expect(screen.getByRole('button', { name: /רישום טיפול/ })).toBeOnTheScreen();
  }, 30000);
});
