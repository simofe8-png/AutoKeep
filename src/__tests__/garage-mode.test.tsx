import { fireEvent, renderRouter, screen, waitFor, within } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import type { OnboardingServices } from '@/features/onboarding/services';
import { MemoryFileStore } from '@/providers/storage/types';
import {
  ActiveVehicleStore,
  GarageRecommendationRepository,
  ScheduleRepository,
} from '@/persistence';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';

/**
 * M14 (T109–T112): Garage Mode on real persisted data. The three sections stay separate, each
 * fact keeps its provenance, and a garage note can never become a manufacturer requirement.
 */

const LONG = { timeout: 10000 };
const clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};
const services = {
  acquisition: {},
  extractor: null,
  registry: {},
  invoiceReader: null,
} as unknown as OnboardingServices;

let world: PopulatedWorld;

beforeEach(async () => {
  world = await populatedWorld(sequentialIds(1), T0);
  configureDataSource({
    kind: 'local',
    openDatabase: async () => world.db,
    ids: sequentialIds(8000),
    clock,
    files: new MemoryFileStore(),
    services,
  });
});
afterEach(() => configureDataSource({ kind: 'demo' }));

async function openGarage() {
  await renderRouter('./src/app', { initialUrl: '/garage' });
  await waitFor(() => expect(screen.getByTestId('screen-garage')).toBeOnTheScreen(), LONG);
}

describe('Garage Mode on real data', () => {
  it('manufacturer section: verified items with due point, interval and exact source locator', async () => {
    await openGarage();
    const m = screen.getByTestId('garage-section-manufacturer');
    expect(m).toHaveTextContent(/שמן מנוע/);
    expect(m).toHaveTextContent(/עמ׳ 412/);
    expect(m).toHaveTextContent(/כל 15,000/);
    expect(within(m).getByTestId('due-overdue')).toBeOnTheScreen();
    // The garage's own recommendation is not a manufacturer requirement.
    expect(m).not.toHaveTextContent(/רפידות/);
  });

  it('known section: last service with its provenance, record count, open deferral', async () => {
    await openGarage();
    const k = screen.getByTestId('garage-section-known');
    expect(k).toHaveTextContent(/75,120/);
    expect(k).toHaveTextContent(/מסמך מוסך/);
    expect(k).toHaveTextContent(/טיפולים מתועדים/);
    expect(k).toHaveTextContent(/פעולות שנדחו/);
  });

  it('a note added in Garage Mode is stored as a user-reported garage note, never a requirement', async () => {
    const schedules = new ScheduleRepository(world.db);
    const before = await schedules.current(world.car.id);
    await openGarage();
    const g = screen.getByTestId('garage-section-garage');
    expect(g).toHaveTextContent(/רפידות/);
    expect(g).toHaveTextContent(/מתוך מסמך מוסך/);

    await fireEvent.press(screen.getByTestId('garage-add-note'));
    await fireEvent.changeText(screen.getByTestId('garage-note-input'), 'להחליף מצבר בקרוב');
    await fireEvent.press(screen.getByTestId('garage-note-dialog-confirm'));
    await waitFor(() =>
      expect(screen.getByTestId('garage-section-garage')).toHaveTextContent(/להחליף מצבר/),
    );
    expect(screen.getByTestId('garage-section-garage')).toHaveTextContent(/הוזן ידנית/);
    expect(screen.getByTestId('garage-section-manufacturer')).not.toHaveTextContent(/מצבר/);

    const recs = await new GarageRecommendationRepository(world.db).list(world.car.id);
    const note = recs.find((r) => r.text === 'להחליף מצבר בקרוב');
    expect(note).toMatchObject({ authority: 'user_report', sourceDocumentId: null });
    // The manufacturer schedule is untouched (same row, same items).
    const after = await schedules.current(world.car.id);
    expect(after).toEqual(before);
    // Scoped to the car only.
    expect(await new GarageRecommendationRepository(world.db).list(world.moto.id)).toEqual([]);
  }, 30000);

  it('without a verified schedule the manufacturer section says so and shows nothing invented', async () => {
    // The persisted active-vehicle pointer selects the motorcycle (no schedule).
    await new ActiveVehicleStore(world.db).set(world.moto.id, T0);
    await openGarage();
    expect(screen.getByTestId('vehicle-target-banner')).toHaveTextContent(/CB500F/);
    const m = screen.getByTestId('garage-section-manufacturer');
    expect(m).toHaveTextContent(/אין לוח תחזוקה מאומת/);
    expect(m).toHaveTextContent(/לא נמצא מקור רשמי מאומת/);
    expect(m).not.toHaveTextContent(/שמן מנוע/);
    // The car's garage notes do not leak into the motorcycle's Garage Mode.
    expect(screen.getByTestId('garage-section-garage')).not.toHaveTextContent(/רפידות/);
  });
});
