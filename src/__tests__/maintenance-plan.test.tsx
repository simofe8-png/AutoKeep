import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import { MaintenanceKnowledgeRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

/**
 * Tasks 9–10 on the real local store: the Maintenance tab shows a useful schedule only from
 * verified evidence, otherwise the exact missing information; recording a service updates only
 * the performed task. Verified requirements here are SYNTHETIC test data.
 */
const LONG = { timeout: 15000 };
const clock = {
  now: () => '2026-09-29T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-29') as IsoDate,
};
const FIESTA = '00000000-0000-4000-8000-00000000f001';
const IBIZA = '00000000-0000-4000-8000-00000000f002';
let db: Awaited<ReturnType<typeof openTestDatabase>>;

async function seed(verified: boolean, markets: string[] = ['IL'], active = FIESTA) {
  db = await openTestDatabase();
  const store = await LocalStore.open(db, sequentialIds(1), clock, new MemoryFileStore());
  for (const [id, manufacturer, model, year, reg, km, first] of [
    [FIESTA, 'פורד גרמניה', 'FIESTA', 2015, '12-345-67', 90000, '2015-06'],
    [IBIZA, 'סיאט ספרד', 'IBIZA', 2012, '77-881-76', 100000, undefined],
  ] as const) {
    await store.addVehicle(
      {
        id,
        kind: 'car',
        manufacturer,
        model,
        year,
        registration: reg,
        odometerKm: km,
        odometerMeasuredAt: '2026-09-29',
        archived: false,
      },
      { engine: '1242 סמ״ק', fuel: 'בנזין', firstRegistration: first },
    );
  }
  await store.setActiveVehicle(active);
  if (verified) {
    const repo = new MaintenanceKnowledgeRepository(db);
    await repo.addDocument(
      {
        id: '00000000-0000-4000-8000-00000000e001',
        vehicleId: FIESTA,
        origin: 'user_upload',
        title: 'SYNTHETIC verified booklet',
        authority: 'manufacturer',
        markets,
        sha256: 'b'.repeat(64),
        authenticity: 'matched_official_edition',
        rights: 'none',
        excerptPolicy: 'none',
        coverage: { makes: ['ford'] },
      },
      null,
      clock.now(),
    );
    for (const [n, task, interval] of [
      [
        1,
        'periodic_service',
        {
          every: { value: 11111, unit: 'km' },
          everyMonths: 12,
          rule: 'whichever_first',
          repeats: true,
        },
      ],
      [2, 'brake_fluid', { everyMonths: 24, rule: 'time_only', repeats: true }],
    ] as const) {
      await repo.saveClaim(
        {
          id: `00000000-0000-4000-8000-0000000c000${n}`,
          documentId: '00000000-0000-4000-8000-00000000e001',
          vehicleId: FIESTA,
          task,
          action: task === 'brake_fluid' ? 'replacement' : 'other',
          interval: interval as never,
          applicability: {},
          locator: { page: 3, table: 'SYNTHETIC' },
          extraction: { method: 'synthetic_test', by: 'test', at: clock.today() },
          status: 'accepted',
          review: { by: 'curator', role: 'curator', at: clock.today(), decision: 'accepted' },
        },
        clock.now(),
      );
    }
  }
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

describe('Maintenance tab (Task 9)', () => {
  it('insufficient evidence: no interval, the exact next action (Ford: booklet or importer plan)', async () => {
    await seed(false);
    await open('/maintenance', 'screen-maintenance');
    await waitFor(
      () => expect(screen.getByTestId('plan-needs-information')).toBeOnTheScreen(),
      LONG,
    );
    const card = screen.getByTestId('plan-needs-information');
    expect(card).toHaveTextContent(/נדרש מידע נוסף כדי לבנות את לוח הטיפולים/);
    expect(screen.getByTestId('plan-upload-booklet')).toHaveTextContent(
      /העלה את חוברת הטיפולים של הרכב/,
    );
    expect(screen.getByTestId('plan-booklet-hint')).toHaveTextContent(/תוכנית טיפול/);
    expect(screen.getByTestId('plan-request-awaiting')).toHaveTextContent(/ford\.co\.il/);
    // No interval anywhere, and no architecture terms.
    expect(screen.queryByTestId('plan-items')).toBeNull();
    expect(screen.getByTestId('screen-maintenance')).not.toHaveTextContent(/15,000|claim|resolver/);
    // The precise reason, never a generic "not found": Delek's Ford source is identified but not
    // yet approved as a trusted source.
    expect(screen.getByTestId('plan-request-official-pending')).toHaveTextContent(/עדיין בבדיקה/);
    expect(screen.queryByTestId('plan-request-no-official-source')).toBeNull();
  }, 60000);

  it('verified evidence: each task with action, when, remaining and its source', async () => {
    await seed(true);
    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('plan-items')).toBeOnTheScreen(), LONG);
    const service = screen.getByTestId('plan-item-periodic_service');
    expect(service).toHaveTextContent(/טיפול תקופתי/);
    expect(service).toHaveTextContent(/11,111 ק״מ או כל 12 חודשים, המוקדם מביניהם/);
    expect(screen.getByTestId('plan-item-periodic_service-km')).toHaveTextContent(/99,999/);
    expect(screen.getByTestId('plan-item-periodic_service-source')).toHaveTextContent(
      /SYNTHETIC verified booklet · יצרן · עמ׳ 3/,
    );
    expect(screen.getByTestId('plan-item-brake_fluid')).toHaveTextContent(/נוזל בלמים/);
    expect(screen.getByTestId('plan-item-brake_fluid')).toHaveTextContent(/החלפה/);
    expect(screen.getByTestId('plan-figures')).toBeOnTheScreen();
    // Level A: the source names the Israeli market.
    expect(screen.getByTestId('plan-item-periodic_service-evidence')).toHaveTextContent(
      'לפי מקור רשמי לשוק הישראלי',
    );
  }, 60000);

  it('a manufacturer document for another market is labelled level B — never as Israeli', async () => {
    await seed(true, ['UK']);
    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('plan-items')).toBeOnTheScreen(), LONG);
    const label = screen.getByTestId('plan-item-periodic_service-evidence');
    expect(label).toHaveTextContent(
      'על פי ספר היצרן לדגם זה · טרם אומתה התאמה ספציפית לשוק הישראלי',
    );
    expect(screen.queryByText('לפי מקור רשמי לשוק הישראלי')).toBeNull();
  }, 60000);
});

describe('fallback reasons (M-SOURCE Step 15)', () => {
  it('SEAT: the Israeli importer schedule needs written permission — the reason and its official page', async () => {
    await seed(false, ['IL'], IBIZA);
    await open('/maintenance', 'screen-maintenance');
    await waitFor(
      () => expect(screen.getByTestId('plan-request-official-source')).toBeOnTheScreen(),
      LONG,
    );
    const src = screen.getByTestId('plan-official-source-il-champion-service-routine');
    expect(src).toHaveTextContent(/היבואן הרשמי בישראל/);
    expect(src).toHaveTextContent(/דורשים אישור בכתב לקריאה אוטומטית/);
    expect(screen.getByTestId('plan-official-link-www.championmotors.co.il')).toHaveTextContent(
      /פתח את www\.championmotors\.co\.il/,
    );
    expect(screen.getByTestId('screen-maintenance')).not.toHaveTextContent(/לא מצאנו|לא נמצא/);
  }, 60000);
});

describe('service journal (Task 10)', () => {
  it('recording a checked task updates only that task; unchecked tasks are not marked done', async () => {
    await seed(true);
    await open('/service/new', 'screen-service-new');
    await fireEvent.press(screen.getByTestId('service-method-manual'));
    await waitFor(
      () => expect(screen.getByTestId('screen-service-manual')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('action-draft-plan-periodic_service')).toBeOnTheScreen();
    expect(screen.getByTestId('action-draft-plan-brake_fluid')).toBeOnTheScreen();
    expect(screen.queryByTestId('action-defer-draft-plan-periodic_service')).toBeNull();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'טיפול תקופתי' }));
    await fireEvent.changeText(screen.getByTestId('service-date'), '2026-09-20');
    await fireEvent.changeText(screen.getByTestId('service-odometer'), '89500');
    await fireEvent.press(screen.getByTestId('service-to-review'));
    await waitFor(
      () => expect(screen.getByTestId('screen-service-review')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('service-confirm'));
    await fireEvent.press(screen.getByTestId('service-confirm-dialog-confirm'));

    await open('/maintenance', 'screen-maintenance');
    await waitFor(
      () =>
        expect(screen.getByTestId('plan-item-periodic_service-km')).toHaveTextContent(/100,611/),
      LONG,
    );
    expect(screen.getByTestId('plan-item-periodic_service')).toHaveTextContent(
      /בוצע לאחרונה 20.9.2026/,
    );
    expect(screen.getByTestId('plan-item-brake_fluid')).toHaveTextContent(/טרם תועד ביצוע/);
  }, 90000);
});
