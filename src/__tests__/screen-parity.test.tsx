import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { nodeBackupCrypto } from '@/persistence/backup/testing';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';
import type { SqlDatabase } from '@/persistence';
import { MemoryBackupFiles } from '@/providers/backup/types';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Screen parity with the approved visual references (docs/design/README.md): the behaviours the
 * corrected screens add or move — restoring a backup from the welcome screen, alerts grouped by
 * urgency with their actions, the plan timeline and the next-service detail, the vehicle details.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};

function configureLocal(
  db: SqlDatabase,
  backupFiles: MemoryBackupFiles | null = null,
  files = new MemoryFileStore(),
) {
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(8000),
    clock,
    files,
    notifications: null,
    backupFiles,
    backupCrypto: backupFiles ? nodeBackupCrypto : null,
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

describe("a new device restored from the owner's backup file", () => {
  it('fresh install → welcome → "יש לי קובץ גיבוי — שחזור" → confirm → Home with the vehicle', async () => {
    // The backup file comes from another device holding the data.
    const source = await populatedWorld(sequentialIds(1), T0);
    const sourceFiles = new MemoryFileStore();
    const made = await (
      await LocalStore.open(source.db, sequentialIds(500), clock, sourceFiles)
    ).createBackup(nodeBackupCrypto);
    const picker = new MemoryBackupFiles();
    picker.next = made.text;
    configureLocal(await openTestDatabase(), picker);

    await renderRouter('./src/app', { initialUrl: '/' });
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-welcome')).toBeOnTheScreen(),
      LONG,
    );
    // The approved welcome: add the first vehicle, or restore a backup file.
    expect(screen.getByTestId('onboarding-add-first')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('onboarding-restore'));
    await waitFor(() => expect(screen.getByTestId('screen-backup')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('backup-restore'));
    await fireEvent.press(screen.getByRole('button', { name: 'בחירת קובץ ושחזור' }));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('home-active-vehicle')).toHaveTextContent(/קורולה/);
  }, 40000);

  it('a file that is not a backup changes nothing and says so', async () => {
    const world = await populatedWorld(sequentialIds(1), T0);
    const picker = new MemoryBackupFiles();
    picker.next = '{"hello":"world"}';
    configureLocal(world.db, picker);

    await open('/backup', 'screen-backup');
    await fireEvent.press(screen.getByTestId('backup-restore'));
    await fireEvent.press(screen.getByRole('button', { name: 'בחירת קובץ ושחזור' }));
    await waitFor(
      () => expect(screen.getByTestId('backup-notice')).toHaveTextContent(/אינו קובץ גיבוי/),
      LONG,
    );
    const n = await world.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM vehicles');
    expect(n?.n).toBeGreaterThan(0);
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

describe('next-service detail', () => {
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
