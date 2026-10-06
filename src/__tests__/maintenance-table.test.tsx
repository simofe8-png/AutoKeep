import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp, type VehicleId } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { FIESTA_2012_TABLE } from '@/features/maintenance/table/fiesta2012';
import { ServiceRepository, ServiceTableRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Maintenance as two screens (owner decision 2026-10-06) on the real local store: the table built
 * like the booklet (transcribed / typed / read, then approved by the owner) and the periodic
 * service derived from it, saved item by item into the history.
 */
const LONG = { timeout: 15000 };
const clock = {
  now: () => '2026-10-06T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-10-06') as IsoDate,
};
const FIESTA = '00000000-0000-4000-8000-00000000f001';
const MAZDA = '00000000-0000-4000-8000-00000000f002';
let db: Awaited<ReturnType<typeof openTestDatabase>>;
let store: LocalStore;

async function seed(active = FIESTA) {
  db = await openTestDatabase();
  store = await LocalStore.open(db, sequentialIds(1), clock, new MemoryFileStore());
  for (const [id, manufacturer, model, reg] of [
    [FIESTA, 'פורד גרמניה', 'FIESTA', '12-345-67'],
    [MAZDA, 'מאזדה יפן', 'MAZDA 3', '77-881-76'],
  ] as const) {
    await store.addVehicle(
      {
        id,
        kind: 'car',
        manufacturer,
        model,
        year: 2012,
        registration: reg,
        odometerKm: 158_300,
        odometerMeasuredAt: '2026-10-06',
        archived: false,
      },
      { engine: '1388 סמ״ק', fuel: 'בנזין' },
    );
  }
  await store.setActiveVehicle(active);
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

async function open(url: string, testID: string) {
  await renderRouter('./src/app', { initialUrl: url });
  await waitFor(() => expect(screen.getByTestId(testID)).toBeOnTheScreen(), LONG);
}

const row = (title: string) => FIESTA_2012_TABLE.rows.find((r) => r.title === title)!.id;

describe('לוח טיפולים → טיפול תקופתי', () => {
  it('the transcribed Fiesta table: reviewed, approved, then the next service is saved item by item', async () => {
    await seed();
    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('table-empty')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('table-photo')).toHaveTextContent(/צלם את הלוח מהספר/);
    expect(screen.getByTestId('table-privacy')).toHaveTextContent(/לא יוצא מהמכשיר/);

    // Offered to this Ford Fiesta 2012 only, as a proposal.
    await fireEvent.press(screen.getByTestId('table-offer'));
    await waitFor(() => expect(screen.getByTestId('table-proposed')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('table-proposed')).toHaveTextContent(/הועתק מספר הרכב/);
    // Exactly the booklet: drive belt replaced at 120,000 (column 8), checked elsewhere.
    expect(screen.getByTestId(`table-cell-${row('רצועת הנעה')}:7`)).toHaveTextContent('ה');
    expect(screen.getByTestId(`table-cell-${row('רצועת הנעה')}:6`)).toHaveTextContent('ב');
    expect(screen.getByTestId(`table-row-${row('נוזל בלמים')}-rule`)).toHaveTextContent(
      'החלף כל שנתיים',
    );
    expect(screen.getByTestId('table-legend')).toHaveTextContent(
      /בדוק.*כוונן.*החלף.*סוך.*חזק.*נקה/,
    );
    // Nothing counts before the owner approves it.
    expect(screen.getByTestId('maintenance-tabs-periodic')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('table-approve'));
    await waitFor(() => expect(screen.getByTestId('periodic-next')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('periodic-next-title')).toHaveTextContent('טיפול 165,000');
    // No previous service recorded: no date is invented.
    expect(screen.getByTestId('periodic-due')).toHaveTextContent(/^מגיע ב-165,000 ק״מ$/);
    expect(screen.getByTestId('periodic-no-last')).toBeOnTheScreen();
    expect(screen.getByTestId('periodic-unknown')).toHaveTextContent(/נוזל בלמים/);
    expect(screen.getByTestId('periodic-group-replace')).toHaveTextContent(/שמן מנוע/);
    expect(screen.getByTestId('periodic-group-adjust')).toHaveTextContent(/אורות ראשיים/);
    expect(screen.getByTestId('periodic-after-title')).toHaveTextContent('טיפול 180,000');

    // The last service: 150,000 in March → due by distance or 12 months after it.
    await fireEvent.press(screen.getByRole('button', { name: 'עדכן את הטיפול האחרון' }));
    await fireEvent.changeText(screen.getByTestId('periodic-last-date'), '10.03.2026');
    await fireEvent.press(screen.getByTestId('periodic-last-save'));
    await waitFor(
      () => expect(screen.getByTestId('periodic-due')).toHaveTextContent(/2027.*המוקדם מביניהם/),
      LONG,
    );
    expect(screen.queryByTestId('periodic-no-last')).toBeNull();

    // Nothing checked: refused. Then oil and filter performed, saved as one record.
    await fireEvent.press(screen.getByTestId('periodic-save'));
    expect(screen.getByTestId('periodic-nothing')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId(`periodic-item-${row('שמן מנוע')}`));
    await fireEvent.press(screen.getByTestId(`periodic-item-${row('מסנן שמן מנוע')}`));
    await fireEvent.press(screen.getByTestId('periodic-save'));
    await waitFor(
      () => expect(screen.getByTestId('periodic-next-title')).toHaveTextContent('טיפול 180,000'),
      LONG,
    );
    expect(screen.getByTestId('periodic-saved')).toHaveTextContent(/נשמר בהיסטוריה/);

    const history = await new ServiceRepository(db).list(FIESTA as VehicleId);
    expect(history).toHaveLength(1);
    // A user report, entered by hand (never garage evidence).
    expect(history[0]).toMatchObject({ authority: 'user_report', origin: 'manual' });
    expect(history[0].actions.map((a) => [a.title, a.actionType, a.performed])).toEqual([
      ['שמן מנוע — החלף', 'replacement', true],
      ['מסנן שמן מנוע — החלף', 'replacement', true],
    ]);
    // Vehicle-scoped: the other vehicle has no table and no record.
    expect(await new ServiceTableRepository(db).get(MAZDA as VehicleId)).toBeNull();
  }, 120000);

  it('typed by the owner: the shape, a row filled at once, one cell changed, approved', async () => {
    await seed(MAZDA);
    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('table-empty')).toBeOnTheScreen(), LONG);
    // The transcribed table is for a Ford Fiesta 2012 only.
    expect(screen.queryByTestId('table-offer')).toBeNull();

    await fireEvent.press(screen.getByTestId('table-manual'));
    await fireEvent.press(screen.getByTestId('table-shape-create'));
    await waitFor(() => expect(screen.getByTestId('table-row-title')).toBeOnTheScreen(), LONG);
    // A row needs a name.
    await fireEvent.press(screen.getByTestId('table-row-save'));
    await waitFor(() => expect(screen.getByTestId('table-row-sheet')).toHaveTextContent(/הזן שם/));
    await fireEvent.changeText(screen.getByTestId('table-row-title'), 'שמן מנוע');
    await fireEvent.changeText(screen.getByTestId('table-row-group'), 'מנוע');
    await fireEvent.press(screen.getByTestId('table-row-fill-replace'));
    await fireEvent.press(screen.getByTestId('table-row-save'));
    await waitFor(() => expect(screen.getAllByTestId(/^table-cell-.*:0$/)).toHaveLength(1), LONG);

    await fireEvent.press(screen.getAllByTestId(/^table-cell-.*:0$/)[0]);
    await fireEvent.press(screen.getByTestId('table-cell-action-check'));
    await fireEvent.press(screen.getByTestId('table-cell-save'));
    await waitFor(
      () => expect(screen.getAllByTestId(/^table-cell-.*:0$/)[0]).toHaveTextContent('ה/ב'),
      LONG,
    );
    expect(screen.getAllByTestId(/^table-cell-.*:1$/)[0]).toHaveTextContent('ה');

    await fireEvent.press(screen.getByTestId('table-approve'));
    await waitFor(() => expect(screen.getByTestId('periodic-next')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('periodic-group-replace')).toHaveTextContent(/שמן מנוע/);
    const stored = await new ServiceTableRepository(db).get(MAZDA as VehicleId);
    expect(stored).toMatchObject({ status: 'confirmed', source: 'manual' });
  }, 120000);

  it('a table read from a photo: uncertain cells are marked until the owner fixes them', async () => {
    await seed();
    await store.saveServiceTable(FIESTA, {
      table: FIESTA_2012_TABLE,
      status: 'proposed',
      source: 'photo',
      documentId: null,
      unsure: [`${row('שמן מנוע')}:0`],
    });
    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('table-proposed')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('table-proposed')).toHaveTextContent(/1 תאים מסומנים בצהוב/);
    // The periodic service waits for the approved table.
    await fireEvent.press(screen.getByTestId('maintenance-tabs-periodic'));
    expect(screen.getByTestId('periodic-no-table')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('periodic-to-table'));

    await fireEvent.press(screen.getByTestId(`table-cell-${row('שמן מנוע')}:0`));
    await fireEvent.press(screen.getByTestId('table-cell-save'));
    await waitFor(
      () => expect(screen.getByTestId('table-proposed')).toHaveTextContent(/^.*השווה לספר/),
      LONG,
    );
    expect(screen.getByTestId('table-proposed')).not.toHaveTextContent(/מסומנים בצהוב/);
  }, 120000);
});
