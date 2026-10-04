import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import type { OnboardingServices } from '@/features/onboarding/services';
import {
  GarageRecommendationRepository,
  ScheduleRepository,
  ServiceRepository,
  VehicleRepository,
  type SqlDatabase,
} from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * M23 acceptance journeys on real persisted data (the remaining ones are listed in
 * docs/acceptance/M23.md with their suites): T171 garage → service → history and T175 a scooter.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};
let db: SqlDatabase;

function configure() {
  configureDataSource({
    kind: 'local',
    openDatabase: async () => db,
    ids: sequentialIds(8000),
    clock,
    files: new MemoryFileStore(),
    services: {
      acquisition: {} as OnboardingServices['acquisition'],
      extractor: null,
      registry: {} as OnboardingServices['registry'],
      invoiceReader: null,
    },
  });
}
afterEach(() => configureDataSource({ kind: 'demo' }));

describe('T171 garage → service → history', () => {
  it('advisor note, then the recorded service; provenance separated end to end', async () => {
    const w = await populatedWorld(sequentialIds(1), T0);
    db = w.db;
    configure();
    const scheduleBefore = await new ScheduleRepository(db).current(w.car.id);

    await renderRouter('./src/app', { initialUrl: '/garage' });
    await waitFor(() => expect(screen.getByTestId('screen-garage')).toBeOnTheScreen(), LONG);
    await fireEvent.press(screen.getByTestId('garage-add-note'));
    await fireEvent.changeText(screen.getByTestId('garage-note-input'), 'רפידות קדמיות ב-30%');
    await fireEvent.press(screen.getByTestId('garage-note-dialog-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('garage-section-garage')).toHaveTextContent(/30%/),
    );

    // Back to the app, record what the garage did (oil performed = the deferred item).
    await fireEvent.press(screen.getByTestId('screen-header-back'));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('tab-history'));
    await waitFor(() => expect(screen.getByTestId('screen-history')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('history-add'));
    await waitFor(() => expect(screen.getByTestId('screen-service-new')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('service-method-manual'));
    await waitFor(() => expect(screen.getByTestId('screen-service-manual')).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('checkbox', { name: 'שמן מנוע' }));
    await fireEvent.changeText(screen.getByTestId('service-garage'), 'מוסך העיר');
    await fireEvent.press(screen.getByTestId('service-to-review'));
    await waitFor(() => expect(screen.getByTestId('screen-service-review')).toBeOnTheScreen());
    await fireEvent.press(screen.getByTestId('service-confirm'));
    await fireEvent.press(screen.getByTestId('service-confirm-dialog-confirm'));
    await waitFor(() => expect(screen.getByTestId('screen-history')).toBeOnTheScreen(), LONG);
    await waitFor(() => expect(screen.getByTestId('history-list')).toHaveTextContent(/26.9.2026/));

    const events = await new ServiceRepository(db).list(w.car.id);
    expect(events[0]).toMatchObject({ garageName: 'מוסך העיר', authority: 'user_report' });
    const notes = await new GarageRecommendationRepository(db).list(w.car.id);
    expect(notes.map((n) => n.text)).toContain('רפידות קדמיות ב-30%');
    // The manufacturer schedule is exactly as before: notes and records never alter it.
    expect(await new ScheduleRepository(db).current(w.car.id)).toEqual(scheduleBefore);
  }, 60000);
});

describe('T175 scooter', () => {
  it('a scooter is onboarded manually as a scooter (never guessed) and tracked like any vehicle', async () => {
    db = await openTestDatabase();
    configure();
    await renderRouter('./src/app', { initialUrl: '/onboarding/manual' });
    await waitFor(
      () => expect(screen.getByTestId('screen-onboarding-manual')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByRole('radio', { name: 'קטנוע' }));
    await fireEvent.changeText(screen.getByTestId('input-manufacturer'), 'ימאהה');
    await fireEvent.changeText(screen.getByTestId('input-model'), 'XMAX 300');
    await fireEvent.changeText(screen.getByTestId('input-year'), '2022');
    await fireEvent.changeText(screen.getByTestId('input-engine'), '292 סמ״ק');
    await fireEvent.changeText(screen.getByTestId('input-registration'), '98-765-43');
    await fireEvent.press(screen.getByTestId('manual-continue'));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-confirm')).toBeOnTheScreen());
    expect(screen.getByTestId('field-kind')).toHaveTextContent(/קטנוע/);
    await fireEvent.press(screen.getByTestId('confirm-details'));
    await waitFor(() => expect(screen.getByTestId('screen-onboarding-odometer')).toBeOnTheScreen());
    await fireEvent.changeText(screen.getByTestId('input-odometer'), '9650');
    await fireEvent.press(screen.getByTestId('odometer-continue'));
    await waitFor(() => expect(screen.getByTestId('screen-home')).toBeOnTheScreen(), LONG);
    await waitFor(() =>
      expect(screen.getByTestId('home-active-vehicle')).toHaveTextContent(/XMAX 300/),
    );
    const [v] = await new VehicleRepository(db).list();
    expect(v).toMatchObject({ type: 'scooter', identity: { engine: '292 סמ״ק' } });
  }, 60000);
});
