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
  it('the migration is the latest local schema version', () => {
    expect(MIGRATIONS.at(-1)).toMatchObject({ version: 6, name: 'maintenance_knowledge' });
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
      requests: [{ kind: 'upload_booklet', hint: 'seat_maintenance_programme' }],
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
