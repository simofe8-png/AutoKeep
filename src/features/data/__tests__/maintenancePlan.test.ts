import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { MaintenanceKnowledgeRepository, MIGRATIONS } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

import { LocalStore, type Clock } from '../localStore';

/** Task 8: maintenance knowledge persistence (local migration v6) through the real store. */
const clockAt = (day: string): Clock => ({
  now: () => `${day}T09:00:00.000Z` as Timestamp,
  today: () => isoDate(day) as IsoDate,
});

const FIESTA = '00000000-0000-4000-8000-00000000f001';
const IBIZA = '00000000-0000-4000-8000-00000000f002';

async function setup() {
  const db = await openTestDatabase();
  const files = new MemoryFileStore();
  const store = await LocalStore.open(db, sequentialIds(1), clockAt('2026-09-29'), files);
  await store.addVehicle(
    {
      id: FIESTA,
      kind: 'car',
      manufacturer: 'פורד גרמניה',
      model: 'FIESTA',
      year: 2015,
      registration: '12-345-67',
      odometerKm: 90000,
      odometerMeasuredAt: '2026-09-29',
      archived: false,
    },
    { engine: '1242 סמ״ק', engineCode: 'SNJB', fuel: 'בנזין', firstRegistration: '2015-06' },
  );
  await store.addVehicle(
    {
      id: IBIZA,
      kind: 'car',
      manufacturer: 'סיאט ספרד',
      model: 'IBIZA',
      year: 2012,
      registration: '77-881-76',
      odometerKm: 100000,
      odometerMeasuredAt: '2026-09-29',
      archived: false,
    },
    { engine: '1390 סמ״ק', engineCode: 'CGG', fuel: 'בנזין' },
  );
  return { db, files, store };
}

describe('maintenance knowledge persistence (migration v6)', () => {
  it('the migration is in the local schema chain (v7, the knowledge catalog, follows it)', () => {
    expect(MIGRATIONS[5]).toMatchObject({ version: 6, name: 'maintenance_knowledge' });
    expect(MIGRATIONS.at(-1)).toMatchObject({ version: 7, name: 'knowledge_catalog' });
  });

  it('keeps the registry first-registration month (day unknown) for time-based maintenance', async () => {
    const { db } = await setup();
    const repo = new MaintenanceKnowledgeRepository(db);
    expect((await repo.profile(FIESTA as never))?.inService).toEqual({
      date: '2015-06-01',
      precision: 'month',
      source: 'registry',
    });
    // No registry month → no profile row: unknown stays unknown.
    expect(await repo.profile(IBIZA as never)).toBeNull();
  });

  it('each vehicle gets its own evidence-based plan with the exact missing information', async () => {
    const { store } = await setup();
    const snap = await store.snapshot();
    expect(snap.bundles[FIESTA].plan).toMatchObject({
      status: 'needs_information',
      items: [],
      requests: [
        { kind: 'upload_booklet', hint: 'ford_service_plan' },
        { kind: 'awaiting_verification' },
      ],
    });
    expect(snap.bundles[IBIZA].plan).toMatchObject({
      status: 'needs_information',
      items: [],
      requests: [
        { kind: 'upload_booklet', hint: 'seat_maintenance_programme' },
        { kind: 'awaiting_verification' },
      ],
    });
  });

  it('answers and booklets are vehicle-scoped, survive a restart and never leak', async () => {
    const { db, store } = await setup();
    await store.setMaintenanceAnswers(IBIZA, { serviceRegime: ' qg1 ', usage: 'severe' });
    await store.addDocument(
      IBIZA,
      {
        documentId: '00000000-0000-4000-8000-00000000d001',
        file: {
          uri: 'file:///cache/booklet.jpg',
          mimeType: 'image/jpeg',
          sizeBytes: 10,
          source: 'camera',
        },
        title: 'Booklet',
      },
      'maintenance_schedule',
    );
    await store.registerMaintenanceBooklet(IBIZA, '00000000-0000-4000-8000-00000000d001');
    await store.registerMaintenanceBooklet(IBIZA, '00000000-0000-4000-8000-00000000d001'); // idempotent
    await expect(
      store.registerMaintenanceBooklet(FIESTA, '00000000-0000-4000-8000-00000000d001'),
    ).rejects.toThrow(/not found for this vehicle/);

    const reopened = await LocalStore.open(
      await openTestDatabase(db.export()),
      sequentialIds(900),
      clockAt('2026-09-30'),
      new MemoryFileStore(),
    );
    const repo = new MaintenanceKnowledgeRepository(await openTestDatabase(db.export()));
    expect(await repo.profile(IBIZA as never)).toMatchObject({
      serviceRegime: 'QG1',
      usage: 'severe',
    });
    expect((await repo.profile(FIESTA as never))?.serviceRegime).toBeNull();
    const docs = await repo.documents(IBIZA as never);
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      origin: 'user_upload',
      authenticity: 'owner_confirmed',
      rights: 'none',
      authority: 'vehicle_document',
    });
    expect(await repo.documents(FIESTA as never)).toEqual([]);
    const snap = await reopened.snapshot();
    // The booklet is received but not verified: still no schedule, and it is shown as received.
    expect(snap.bundles[IBIZA].plan).toMatchObject({ items: [], bookletUploaded: true });
    expect(snap.bundles[FIESTA].plan?.bookletUploaded).toBe(false);
  });

  it('deleting a vehicle removes its maintenance knowledge', async () => {
    const { db, store } = await setup();
    await store.setMaintenanceAnswers(FIESTA, { usage: 'normal' });
    await store.deleteVehicle(FIESTA);
    const repo = new MaintenanceKnowledgeRepository(db);
    expect(await repo.profile(FIESTA as never)).toBeNull();
  });
});

// ---------- Task 10: journal ↔ requirement linkage (SYNTHETIC verified requirements) ----------

async function withVerifiedBooklet(db: Awaited<ReturnType<typeof openTestDatabase>>) {
  // A curator-verified edition matched by fingerprint (as the operator tool would record it).
  const repo = new MaintenanceKnowledgeRepository(db);
  const now = '2026-09-29T09:00:00.000Z' as Timestamp;
  await repo.addDocument(
    {
      id: '00000000-0000-4000-8000-00000000e001',
      vehicleId: FIESTA,
      origin: 'user_upload',
      title: 'SYNTHETIC verified booklet',
      authority: 'manufacturer',
      markets: ['IL'],
      sha256: 'b'.repeat(64),
      authenticity: 'matched_official_edition',
      rights: 'none',
      excerptPolicy: 'none',
      coverage: { makes: ['ford'] },
    },
    null,
    now,
  );
  const claim = (task: 'periodic_service' | 'brake_fluid', interval: object) =>
    repo.saveClaim(
      {
        id: `00000000-0000-4000-8000-0000000c${task === 'periodic_service' ? '0001' : '0002'}`,
        documentId: '00000000-0000-4000-8000-00000000e001',
        vehicleId: FIESTA,
        task,
        action: task === 'brake_fluid' ? 'replacement' : 'other',
        interval: interval as never,
        applicability: {},
        locator: { page: 3, table: 'SYNTHETIC' },
        extraction: { method: 'synthetic_test', by: 'test', at: isoDate('2026-09-29') as IsoDate },
        status: 'accepted',
        review: {
          by: 'curator',
          role: 'curator',
          at: isoDate('2026-09-29') as IsoDate,
          decision: 'accepted',
        },
      },
      now,
    );
  await claim('periodic_service', {
    every: { value: 11111, unit: 'km' },
    everyMonths: 12,
    rule: 'whichever_first',
    repeats: true,
  });
  await claim('brake_fluid', { everyMonths: 24, rule: 'time_only', repeats: true });
}

describe('service journal ↔ maintenance requirement (Task 10)', () => {
  it('a recorded service updates ONLY the task it performed; next due recalculates', async () => {
    const { db, store } = await setup();
    await withVerifiedBooklet(db);
    let plan = (await store.snapshot()).bundles[FIESTA].plan!;
    expect(plan.status).toBe('ready');
    const service = plan.items.find((i) => i.task === 'periodic_service')!;
    const brake = plan.items.find((i) => i.task === 'brake_fluid')!;
    // From new (no recorded completion): first registration 2015-06 → next point after today.
    expect(service).toMatchObject({ fromNew: true, nextKm: 99999 });
    const brakeBefore = brake.nextDate;

    await store.addServiceEvent({
      id: '00000000-0000-4000-8000-0000000ee001',
      vehicleId: FIESTA,
      date: '2026-09-20',
      odometerKm: 89500,
      origin: 'manual',
      verification: 'pending',
      sourceAuthority: 'user_report',
      actions: [
        {
          id: 'a1',
          title: service.title,
          actionType: 'other',
          performed: true,
          maintenanceItemId: service.completionId,
          unlisted: false,
        },
      ],
      documentIds: [],
    });

    const snap = await store.snapshot();
    plan = snap.bundles[FIESTA].plan!;
    const after = plan.items.find((i) => i.task === 'periodic_service')!;
    expect(after).toMatchObject({
      fromNew: false,
      lastDone: { date: '2026-09-20', km: 89500 },
      nextKm: 89500 + 11111,
      nextDate: '2027-09-20',
    });
    // Unrelated task untouched.
    expect(plan.items.find((i) => i.task === 'brake_fluid')).toMatchObject({
      fromNew: true,
      nextDate: brakeBefore,
    });
    // History shows the event; the other vehicle is unaffected.
    expect(snap.bundles[FIESTA].history.map((h) => h.id)).toContain(
      '00000000-0000-4000-8000-0000000ee001',
    );
    expect(snap.bundles[IBIZA].history).toEqual([]);
    expect(snap.bundles[IBIZA].plan).toMatchObject({ items: [], status: 'needs_information' });
  });
});
