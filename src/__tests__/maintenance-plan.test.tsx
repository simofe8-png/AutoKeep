import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { isoDate, type IsoDate, type Timestamp, type VehicleId } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { configureDataSource } from '@/features/data/dataSource';
import { LocalStore } from '@/features/data/localStore';
import type { OnboardingServices } from '@/features/onboarding/services';
import {
  DiscoveryMissRepository,
  MaintenanceKnowledgeRepository,
  MSourceRepository,
  VehicleRegistryRecordRepository,
} from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';
import { FakeWeb } from '@/discovery/maintenance/msource/testing';
import type { TextReader } from '@/discovery/maintenance/types';
import {
  startMaintenanceDiscovery,
  type DiscoveryStore,
} from '@/features/maintenance/msource/service';

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

// The owner's booklet (SYNTHETIC): states the vehicle; two items.
const BOOKLET = new TextEncoder().encode(
  '<html><head><title>Ford Fiesta 2013-2017 1.25 maintenance schedule</title></head><body>' +
    '<h1>Ford Fiesta 2013-2017 1.25 maintenance schedule</h1>' +
    '<p>Engine oil: replace every 20,000 km or 12 months, whichever comes first.</p>' +
    '<p>Brake fluid: replace every 24 months.</p></body></html>',
);

/** One discovery run for FIESTA with the owner's upload (offline: no web sources). */
async function discoverWithUpload(name: string, bytes: Uint8Array, uploadPdf?: TextReader) {
  const store = await LocalStore.open(db, sequentialIds(9000), clock, new MemoryFileStore());
  const io: DiscoveryStore = {
    load: async (id) => ({
      ...(await store.msourceLoad(id))!,
      uploads: [{ id: 'doc-owner-1', name, bytes }],
    }),
    progress: (id, run, key, status) => store.msourceProgress(id, run, key, status),
    complete: (id, run, status, reqs, cache) => store.msourceComplete(id, run, status, reqs, cache),
  };
  const web = new FakeWeb({});
  await startMaintenanceDiscovery(
    FIESTA,
    io,
    {
      net: web.net(),
      sha256: async () => 'c'.repeat(64),
      registry: [],
      catalog: () => [],
      research: null,
      uploadPdf: uploadPdf ?? null,
    },
    clock,
  );
}

describe('Maintenance tab (Task 9)', () => {
  it('insufficient evidence: no interval, the exact next action (generic booklet request)', async () => {
    await seed(false);
    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('plan-fallback')).toBeOnTheScreen(), LONG);
    // §24: the owner-approved fallback message, verbatim, with a direct private upload action.
    expect(screen.getByTestId('plan-fallback-message-0')).toHaveTextContent(
      'חיפשתי לוח טיפולים מתאים לרכב שלך, אך לא מצאתי מידע מספיק מדויק כדי לבנות לוח טיפולים אמין.',
    );
    expect(screen.getByTestId('plan-fallback-message-1')).toHaveTextContent(
      'כדי שאוכל לבנות עבורך לוח טיפולים מדויק, פנה לסוכנות או ליבואן הרכב ובקש את לוח הטיפולים המתאים לרכב שלך.',
    );
    expect(screen.getByTestId('plan-fallback-message-2')).toHaveTextContent(
      'לאחר שתקבל אותו, העלה אותו כאן ל־AutoKeep ואני אחלץ ממנו את הטיפולים ואבנה עבורך את לוח התחזוקה.',
    );
    expect(screen.getByTestId('plan-fallback-upload')).toHaveTextContent(/העלה את לוח הטיפולים/);
    expect(screen.getByTestId('plan-fallback-privacy')).toHaveTextContent(/פרטי.*PDF/);
    expect(screen.queryByTestId('plan-needs-information')).toBeNull();
    // The failure reason is recorded per vehicle CLASS — no vehicle id, plate or VIN.
    const misses = await new DiscoveryMissRepository(db).all();
    expect(misses).toEqual([
      expect.objectContaining({
        classKey: 'car|ford|fiesta|2015',
        reasons: expect.arrayContaining(['official_source_pending']),
      }),
      expect.objectContaining({
        classKey: 'car|seat|ibiza|2012',
        reasons: expect.arrayContaining(['permission_required']),
      }),
    ]);
    expect(JSON.stringify(misses)).not.toMatch(new RegExp(`${FIESTA}|12-345-67|1234567`));
    // Generic for every make: no manufacturer-specific instructions in production.
    expect(screen.getByTestId('plan-booklet-hint')).toHaveTextContent(/טבלת הטיפולים/);
    expect(screen.queryByTestId('plan-request-awaiting')).toBeNull();
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

  it('§24 partial: some tasks verified, another unresolved → labelled PARTIAL, never as complete', async () => {
    await seed(true);
    await new MaintenanceKnowledgeRepository(db).saveClaim(
      {
        id: '00000000-0000-4000-8000-0000000c0009',
        documentId: '00000000-0000-4000-8000-00000000e001',
        vehicleId: FIESTA,
        task: 'spark_plugs',
        action: 'replacement',
        interval: { every: { value: 60000, unit: 'km' }, rule: 'distance_only', repeats: true },
        // The vehicle's engine code is unknown: this obligation cannot be resolved yet.
        applicability: { engineCodes: ['SYNTH9'] },
        locator: { page: 4, table: 'SYNTHETIC' },
        extraction: { method: 'synthetic_test', by: 'test', at: clock.today() },
        status: 'accepted',
        review: { by: 'curator', role: 'curator', at: clock.today(), decision: 'accepted' },
      },
      clock.now(),
    );
    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('plan-items')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('plan-items')).toHaveTextContent(/לוח טיפולים חלקי/);
    expect(screen.getByTestId('plan-partial')).toHaveTextContent(/זה אינו לוח טיפולים מלא/);
    expect(screen.queryByTestId('plan-fallback')).toBeNull();
    expect(screen.queryByTestId('plan-item-spark_plugs')).toBeNull();
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

  describe('VERIFIED_IDENTITY_ONLY', () => {
    /** A finished discovery run that matched no schedule (SYNTHETIC status). */
    async function noSchedule() {
      await new MSourceRepository(db).saveStatus(
        FIESTA as VehicleId,
        'run-test-1',
        'car|ford|fiesta|2015|1242|SNJB|petrol|',
        'msource/1',
        {
          state: 'INSUFFICIENT_EVIDENCE',
          partial: false,
          retryAvailable: true,
          uploadDocumentAvailable: true,
          sourcesFound: 12,
          sourcesUsed: 0,
          runId: 'run-test-1',
          updatedAt: clock.now(),
        },
        clock.now(),
      );
    }

    it('registry-identified vehicle without a matched schedule: its verified identity, no interval', async () => {
      await seed(false);
      // Ministry record facts as published (SYNTHETIC values; the VIN is altered).
      await new VehicleRegistryRecordRepository(db).save(
        FIESTA as VehicleId,
        {
          sources: ['test'],
          retrievedAt: clock.now(),
          facts: [
            {
              key: 'manufacturerRegistered',
              group: 'identity',
              kind: 'text',
              value: 'פורד גרמניה',
            },
            { key: 'commercialName', group: 'identity', kind: 'text', value: 'FIESTA' },
            { key: 'modelYear', group: 'identity', kind: 'number', value: 2015 },
            { key: 'vin', group: 'identity', kind: 'text', value: 'WF0DXXGAKDF000001' },
            { key: 'engineCode', group: 'technical', kind: 'text', value: 'SNJB' },
            { key: 'displacement', group: 'technical', kind: 'number', value: 1242 },
            { key: 'fuel', group: 'technical', kind: 'text', value: 'בנזין' },
          ],
        },
        clock.now(),
      );
      await noSchedule();
      await open('/maintenance', 'screen-maintenance');
      await waitFor(
        () => expect(screen.getByTestId('plan-discovery-VERIFIED_IDENTITY_ONLY')).toBeOnTheScreen(),
        LONG,
      );
      expect(screen.getByTestId('plan-discovery-VERIFIED_IDENTITY_ONLY')).toHaveTextContent(
        /פרטי הרכב אומתו מול משרד התחבורה. שגרת הטיפולים לדגם זה טרם אומתה./,
      );
      expect(screen.getByTestId('plan-identity-engineCode')).toHaveTextContent(/SNJB/);
      expect(screen.getByTestId('plan-identity-commercialName')).toHaveTextContent(/FIESTA/);
      expect(screen.getByTestId('plan-identity-modelYear')).toHaveTextContent(/2015/);
      // The VIN is not part of the maintenance identity card (and never shown in full anywhere).
      expect(screen.queryByTestId('plan-identity-vin')).toBeNull();
      expect(screen.queryByText(/WF0DXXGAKDF000001/)).toBeNull();
      // Fallback paths stay available; no interval is shown.
      expect(screen.getByTestId('plan-discovery-retry')).toBeOnTheScreen();
      expect(screen.getByTestId('plan-discovery-upload')).toBeOnTheScreen();
      expect(screen.getByTestId('plan-discovery-upload')).toHaveTextContent(
        /פרטי הרכב אומתו בהצלחה. לקבלת מפרט טיפולים מדויק לדגם זה, ניתן להעלות את ספר הרכב או להזין טיפולים ידנית./,
      );
      expect(screen.getByTestId('plan-fallback')).toBeOnTheScreen();
      expect(screen.queryByTestId('plan-items')).toBeNull();
    }, 60000);

    it('a vehicle entered by hand (no registry record) keeps the plain not-found state', async () => {
      await seed(false);
      await noSchedule();
      await open('/maintenance', 'screen-maintenance');
      await waitFor(
        () => expect(screen.getByTestId('plan-discovery-INSUFFICIENT_EVIDENCE')).toBeOnTheScreen(),
        LONG,
      );
      expect(screen.queryByTestId('plan-discovery-VERIFIED_IDENTITY_ONLY')).toBeNull();
      expect(screen.queryByTestId('plan-discovery-identity')).toBeNull();
    }, 60000);
  });

  it("owner review: items from the owner's own document enter the plan only once accepted", async () => {
    await seed(false);
    await discoverWithUpload('booklet.html', BOOKLET);

    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('plan-owner-review')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('plan-owner-review')).toHaveTextContent(/2 פריטים ממתינים לאישורך/);
    // Held: nothing from the document is scheduled before the owner decides.
    expect(screen.queryByTestId('plan-item-engine_oil')).toBeNull();

    await fireEvent.press(screen.getByTestId('plan-owner-review-open'));
    await waitFor(
      () => expect(screen.getByTestId('screen-maintenance-review')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('owner-proposal-engine_oil-interval')).toHaveTextContent(
      /20,000.*12 חודשים, המוקדם מביניהם/,
    );
    expect(screen.getByTestId('owner-proposal-brake_fluid-interval')).toHaveTextContent(
      /כל 24 חודשים/,
    );
    await fireEvent.press(screen.getByTestId('owner-proposal-engine_oil-accept'));
    await fireEvent.press(screen.getByTestId('owner-proposal-brake_fluid-reject'));
    await waitFor(
      () =>
        expect(screen.getByTestId('owner-proposal-engine_oil-decision')).toHaveTextContent(/אושר/),
      LONG,
    );
    expect(screen.getByTestId('owner-proposal-brake_fluid-decision')).toHaveTextContent(/נדחה/);

    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('plan-item-engine_oil')).toBeOnTheScreen(), LONG);
    expect(screen.queryByTestId('plan-item-brake_fluid')).toBeNull();
    expect(screen.getByTestId('plan-owner-review')).toHaveTextContent(/כל הפריטים מהמסמך נבדקו/);
  }, 90000);

  it('a scanned (image-only) PDF upload is explained, never silent', async () => {
    await seed(false);
    // SYNTHETIC: a PDF whose pages carry no text layer (what the on-device reader returns).
    const scan = new TextEncoder().encode('%PDF-1.4\n% scanned pages only\n');
    await discoverWithUpload('scan.pdf', scan, {
      read: async () => [{ n: 1, lines: [], text: '' }],
    });
    await open('/maintenance', 'screen-maintenance');
    await waitFor(
      () => expect(screen.getByTestId('plan-owner-review-no-text')).toBeOnTheScreen(),
      LONG,
    );
    const NO_TEXT =
      /המסמך שהועלה הוא קובץ תמונה\/סריקה ללא טקסט קריא. כרגע נתמכים ספרי רכב דיגיטליים מקוריים בלבד. באפשרותך להזין את הטיפולים ידנית./;
    expect(screen.getByTestId('plan-owner-review-no-text')).toHaveTextContent(NO_TEXT);
    await fireEvent.press(screen.getByTestId('plan-owner-review-open'));
    await waitFor(() => expect(screen.getByTestId('owner-review-no-text')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('owner-review-no-text')).toHaveTextContent(/scan\.pdf/);
    expect(screen.getByTestId('owner-review-no-text')).toHaveTextContent(NO_TEXT);
  }, 90000);

  it('owner review: an item corrected before approval is scheduled as edited, labelled so', async () => {
    await seed(false);
    await discoverWithUpload('booklet.html', BOOKLET);
    await open('/maintenance-review', 'screen-maintenance-review');
    await waitFor(
      () => expect(screen.getByTestId('owner-proposal-engine_oil-edit')).toBeOnTheScreen(),
      LONG,
    );
    await fireEvent.press(screen.getByTestId('owner-proposal-engine_oil-edit'));
    // Invalid first: no interval at all is refused.
    await fireEvent.changeText(screen.getByTestId('owner-proposal-engine_oil-edit-km'), '');
    await fireEvent.changeText(screen.getByTestId('owner-proposal-engine_oil-edit-months'), '');
    await fireEvent.press(screen.getByTestId('owner-proposal-engine_oil-edit-save'));
    expect(screen.getByTestId('owner-proposal-engine_oil-edit-error')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('owner-proposal-engine_oil-edit-km'), '15000');
    await fireEvent.changeText(screen.getByTestId('owner-proposal-engine_oil-edit-months'), '12');
    await fireEvent.press(screen.getByTestId('owner-proposal-engine_oil-edit-save'));
    await waitFor(
      () => expect(screen.getByTestId('owner-proposal-engine_oil-edited')).toBeOnTheScreen(),
      LONG,
    );
    expect(screen.getByTestId('owner-proposal-engine_oil-decision')).toHaveTextContent(/אושר/);
    expect(screen.getByTestId('owner-proposal-engine_oil-interval')).toHaveTextContent(/15,000/);
    // The document's own reading stays visible beside the correction.
    expect(screen.getByTestId('owner-proposal-engine_oil')).toHaveTextContent(/במסמך:.*20,000/);

    await open('/maintenance', 'screen-maintenance');
    await waitFor(() => expect(screen.getByTestId('plan-item-engine_oil')).toBeOnTheScreen(), LONG);
    expect(screen.getByTestId('plan-item-engine_oil')).toHaveTextContent(/15,000/);
    expect(screen.getByTestId('plan-item-engine_oil-source')).toHaveTextContent(
      /מסמך הבעלים \(נערך על ידי המשתמש\)/,
    );
  }, 90000);
});
