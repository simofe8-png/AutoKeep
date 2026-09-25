import {
  confirmServiceDraft,
  createAlert,
  createDocument,
  createExtraction,
  createGarageRecommendation,
  createOdometerReading,
  createSchedule,
  createVehicle,
  handleAlert,
  isoDate,
  timestamp,
  touch,
  type DocumentId,
  type IdGenerator,
  type LocalProfile,
  type Vehicle,
} from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';

import {
  ActiveVehicleStore,
  AlertRepository,
  ConcurrencyError,
  DeferredItemRepository,
  DocumentRepository,
  ExtractionRepository,
  GarageRecommendationRepository,
  lifecycle,
  migrate,
  MIGRATIONS,
  OdometerRepository,
  ProfileRepository,
  ScheduleRepository,
  ServiceRepository,
  VehicleRepository,
} from '..';
import { openTestDatabase, type TestDatabase } from '../testing/sqljsDatabase';

const now = () => T0;

interface World {
  db: TestDatabase;
  ids: IdGenerator;
  profile: LocalProfile;
  car: Vehicle;
  moto: Vehicle;
}

async function world(): Promise<World> {
  const db = await openTestDatabase();
  await migrate(db, MIGRATIONS, now);
  const ids = sequentialIds();
  const profile = await new ProfileRepository(db).getOrCreate(ids, T0);
  const make = (type: Vehicle['type'], registration: string, model: string) => {
    const r = createVehicle(
      {
        ownerProfileId: profile.id,
        type,
        identity: { manufacturer: 'יצרן', model, year: 2021 },
        registration,
      },
      ids,
      T0,
    );
    if (!r.ok) throw new Error('fixture');
    return r.value;
  };
  const car = make('car', '12-345-67', 'קורולה');
  const moto = make('motorcycle', '123-45-678', 'CB500F');
  const vehicles = new VehicleRepository(db);
  await vehicles.insert(car);
  await vehicles.insert(moto);
  return { db, ids, profile, car, moto };
}

function doc(w: World, vehicle: Vehicle, title = 'חשבונית') {
  const r = createDocument(
    {
      vehicleId: vehicle.id,
      kind: 'invoice',
      title,
      origin: 'user_upload',
      authority: 'garage_document',
      original: {
        storageKey: `local/${title}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 10,
        sha256: 'b'.repeat(64),
      },
    },
    w.ids,
    T0,
  );
  if (!r.ok) throw new Error('fixture');
  return r.value;
}

function service(w: World, vehicle: Vehicle, documentIds: DocumentId[] = []) {
  const r = confirmServiceDraft(
    {
      vehicleId: vehicle.id,
      origin: documentIds.length ? 'document' : 'manual',
      date: '2026-09-20',
      odometerKm: 84250,
      garageName: 'מוסך',
      notes: '',
      actions: [
        {
          title: 'שמן',
          actionType: 'replacement',
          performed: true,
          maintenanceItemId: null,
          unlisted: false,
        },
        {
          title: 'שטיפה',
          actionType: 'other',
          performed: true,
          maintenanceItemId: null,
          unlisted: true,
        },
      ],
      documentIds,
      extractionId: null,
    },
    { confirmedBy: 'user', confirmedAt: T0 },
    w.ids,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

describe('vehicle repository & active vehicle (T044)', () => {
  it('round-trips vehicles and lists only active by default', async () => {
    const w = await world();
    const repo = new VehicleRepository(w.db);
    expect(await repo.get(w.car.id)).toEqual(w.car);
    expect((await repo.list()).map((v) => v.id)).toEqual([w.car.id, w.moto.id]);
  });

  it('rejects stale updates (optimistic concurrency)', async () => {
    const w = await world();
    const repo = new VehicleRepository(w.db);
    const later = timestamp('2026-09-26T00:00:00.000Z');
    const v2 = { ...w.car, identity: { ...w.car.identity, trim: 'Sun' }, ...touch(w.car, later) };
    await repo.update(v2);
    await expect(repo.update(v2)).rejects.toBeInstanceOf(ConcurrencyError);
    expect((await repo.get(w.car.id))?.identity.trim).toBe('Sun');
  });

  it('persists the active vehicle; switching changes only the pointer', async () => {
    const w = await world();
    const store = new ActiveVehicleStore(w.db);
    expect(await store.get()).toBe(w.car.id); // defaults to first vehicle
    await store.set(w.moto.id, T0);
    expect(await store.get()).toBe(w.moto.id);
    // Data is untouched by switching.
    expect(await new VehicleRepository(w.db).get(w.car.id)).toEqual(w.car);
  });
});

describe('odometer (T045)', () => {
  it('keeps independent readings per vehicle', async () => {
    const w = await world();
    const repo = new OdometerRepository(w.db);
    const add = async (v: Vehicle, km: number, date: string) => {
      const r = createOdometerReading(
        { vehicleId: v.id, valueKm: km, measuredAt: isoDate(date), source: 'user' },
        await repo.listForVehicle(v.id),
        w.ids,
        T0,
      );
      if (!r.ok) throw new Error('fixture');
      await repo.add(r.value);
    };
    await add(w.car, 80000, '2026-04-01');
    await add(w.car, 84250, '2026-09-10');
    await add(w.moto, 18420, '2026-06-02');
    expect((await repo.latest(w.car.id))?.valueKm).toBe(84250);
    expect((await repo.latest(w.moto.id))?.valueKm).toBe(18420);
    expect((await repo.listForVehicle(w.moto.id)).every((r) => r.vehicleId === w.moto.id)).toBe(
      true,
    );
  });
});

describe('schedules, documents and extractions (T046)', () => {
  it('stores schedules append-only and returns the current one with its verification', async () => {
    const w = await world();
    const s = createSchedule(
      {
        vehicleId: w.car.id,
        intervals: [
          {
            id: w.ids.next(),
            label: 'oil',
            rule: 'earliest_of',
            everyKm: 15000,
            everyMonths: 12,
            items: [
              {
                id: w.ids.next(),
                title: 'שמן',
                actionType: 'replacement',
                manufacturerText: 'x',
                reference: { sourceId: w.ids.next(), page: 1 },
              },
            ],
          },
        ],
        evidence: [{ authority: 'manufacturer', exactApplicability: true }],
        applicability: { matchedOn: ['model'], exact: true },
      },
      w.ids,
      T0,
    );
    if (!s.ok) throw new Error('fixture');
    const repo = new ScheduleRepository(w.db);
    await repo.add(s.value);
    expect(await repo.current(w.car.id)).toEqual(s.value);
    expect(await repo.current(w.moto.id)).toBeNull();
  });

  it('keeps original documents and derived extractions separately', async () => {
    const w = await world();
    const d = doc(w, w.car);
    await new DocumentRepository(w.db).add(d);
    const e = createExtraction(
      {
        documentId: d.id,
        vehicleId: w.car.id,
        kind: 'invoice',
        status: 'draft',
        producedBy: 'mock-ocr@1',
        payload: { total: 100 },
        uncertainFields: ['odometer'],
      },
      w.ids,
      T0,
    );
    await new ExtractionRepository(w.db).add(e);
    expect(await new DocumentRepository(w.db).get(w.car.id, d.id)).toEqual(d);
    expect(await new ExtractionRepository(w.db).listForDocument(w.car.id, d.id)).toEqual([e]);
  });
});

describe('service history (T047)', () => {
  it('stores events with ordered actions and document links atomically', async () => {
    const w = await world();
    const d = doc(w, w.car);
    await new DocumentRepository(w.db).add(d);
    const e = service(w, w.car, [d.id]);
    const repo = new ServiceRepository(w.db);
    await repo.add(e);
    expect(await repo.get(w.car.id, e.id)).toEqual(e);
    expect((await repo.list(w.car.id)).map((x) => x.id)).toEqual([e.id]);
  });

  it('refuses to link a document of another vehicle and leaves nothing behind', async () => {
    const w = await world();
    const motoDoc = doc(w, w.moto, 'moto');
    await new DocumentRepository(w.db).add(motoDoc);
    const e = service(w, w.car, [motoDoc.id]);
    await expect(new ServiceRepository(w.db).add(e)).rejects.toThrow(/does not belong/);
    expect(await new ServiceRepository(w.db).list(w.car.id)).toEqual([]);
    const orphanActions = await w.db.first<{ n: number }>(
      'SELECT COUNT(*) AS n FROM service_actions',
    );
    expect(orphanActions?.n).toBe(0);
  });
});

describe('alerts & garage recommendations (T048)', () => {
  it('persists alerts with explainable basis and status transitions', async () => {
    const w = await world();
    const a = createAlert(
      {
        vehicleId: w.car.id,
        kind: 'upcoming',
        basis: { scheduleId: w.ids.next(), intervalId: w.ids.next(), facts: { remainingKm: 5750 } },
      },
      w.ids,
      T0,
    );
    if (!a.ok) throw new Error('fixture');
    const repo = new AlertRepository(w.db);
    await repo.add(a.value);
    const handled = handleAlert(a.value, timestamp('2026-09-26T00:00:00.000Z'));
    if (!handled.ok) throw new Error('fixture');
    await repo.update(handled.value);
    expect(await repo.list(w.car.id, 'active')).toEqual([]);
    expect((await repo.get(w.car.id, a.value.id))?.basis.facts.remainingKm).toBe(5750);
    expect(await repo.ownerOf(a.value.id)).toBe(w.car.id);
  });

  it('stores garage recommendations separately per vehicle', async () => {
    const w = await world();
    const g = createGarageRecommendation(
      {
        vehicleId: w.car.id,
        text: 'רפידות',
        date: isoDate('2026-09-20'),
        garageName: null,
        sourceDocumentId: null,
      },
      w.ids,
      T0,
    );
    if (!g.ok) throw new Error('fixture');
    const repo = new GarageRecommendationRepository(w.db);
    await repo.add(g.value);
    expect(await repo.list(w.car.id)).toEqual([g.value]);
    expect(await repo.list(w.moto.id)).toEqual([]);
  });
});

describe('vehicle lifecycle persistence (T049)', () => {
  it('archive keeps all data and clears the active pointer; restore reactivates', async () => {
    const w = await world();
    await new ServiceRepository(w.db).add(service(w, w.car));
    const store = new ActiveVehicleStore(w.db);
    await store.set(w.car.id, T0);
    const r = await lifecycle.archive(w.db, w.car.id, timestamp('2026-09-26T00:00:00.000Z'));
    expect(r.ok).toBe(true);
    expect(await store.get()).toBe(w.moto.id);
    expect(await new ServiceRepository(w.db).list(w.car.id)).toHaveLength(1);
    expect((await new VehicleRepository(w.db).list()).map((v) => v.id)).toEqual([w.moto.id]);
    expect(await new VehicleRepository(w.db).list({ includeArchived: true })).toHaveLength(2);
    const back = await lifecycle.restore(w.db, w.car.id, timestamp('2026-09-27T00:00:00.000Z'));
    expect(back.ok && back.value.lifecycle).toBe('active');
  });

  it('permanent deletion previews counts and removes only that vehicle', async () => {
    const w = await world();
    const d = doc(w, w.car);
    await new DocumentRepository(w.db).add(d);
    await new ServiceRepository(w.db).add(service(w, w.car, [d.id]));
    await new ServiceRepository(w.db).add(service(w, w.moto));
    const repo = new VehicleRepository(w.db);
    expect(await repo.deletionPreview(w.car.id)).toEqual({
      serviceEvents: 1,
      documents: 1,
      odometerReadings: 0,
      alerts: 0,
      garageRecommendations: 0,
    });
    await repo.deletePermanently(w.car.id);
    expect(await repo.get(w.car.id)).toBeNull();
    for (const table of ['service_events', 'service_actions', 'documents']) {
      const n = await w.db.first<{ n: number }>(
        `SELECT COUNT(*) AS n FROM ${table} WHERE vehicle_id = ?`,
        [w.car.id],
      );
      expect({ table, n: n?.n }).toEqual({ table, n: 0 });
    }
    expect(await new ServiceRepository(w.db).list(w.moto.id)).toHaveLength(1);
  });
});

describe('M05 gate: restart, offline and isolation (T050)', () => {
  it('all local data and the active vehicle survive an app restart (no network involved)', async () => {
    const w = await world();
    await new ServiceRepository(w.db).add(service(w, w.car));
    await new ActiveVehicleStore(w.db).set(w.moto.id, T0);
    const bytes = w.db.export();
    await w.db.close();

    const reopened = await openTestDatabase(bytes);
    expect(await migrate(reopened, MIGRATIONS, now)).toEqual({
      from: MIGRATIONS.length,
      to: MIGRATIONS.length,
    });
    expect(await new ActiveVehicleStore(reopened).get()).toBe(w.moto.id);
    expect(await new ServiceRepository(reopened).list(w.car.id)).toHaveLength(1);
    expect((await new VehicleRepository(reopened).list()).map((v) => v.id)).toEqual([
      w.car.id,
      w.moto.id,
    ]);
  });

  it('zero cross-vehicle leakage: every scoped read through vehicle A excludes vehicle B', async () => {
    const w = await world();
    const motoDoc = doc(w, w.moto, 'moto-doc');
    await new DocumentRepository(w.db).add(motoDoc);
    const motoEvent = service(w, w.moto);
    await new ServiceRepository(w.db).add(motoEvent);
    const rec = createGarageRecommendation(
      {
        vehicleId: w.moto.id,
        text: 'שרשרת',
        date: isoDate('2026-09-20'),
        garageName: null,
        sourceDocumentId: null,
      },
      w.ids,
      T0,
    );
    if (!rec.ok) throw new Error('fixture');
    await new GarageRecommendationRepository(w.db).add(rec.value);

    expect(await new DocumentRepository(w.db).list(w.car.id)).toEqual([]);
    expect(await new DocumentRepository(w.db).get(w.car.id, motoDoc.id)).toBeNull();
    expect(await new ServiceRepository(w.db).list(w.car.id)).toEqual([]);
    expect(await new ServiceRepository(w.db).get(w.car.id, motoEvent.id)).toBeNull();
    expect(await new GarageRecommendationRepository(w.db).list(w.car.id)).toEqual([]);
    expect(await new DeferredItemRepository(w.db).listOpen(w.car.id)).toEqual([]);
    expect(await new AlertRepository(w.db).list(w.car.id)).toEqual([]);
  });
});
