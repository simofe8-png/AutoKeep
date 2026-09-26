import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { he } from '@/i18n/he';
import { AlertRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

import { DomainError, LocalStore, type Clock } from '../localStore';

/** M13 integration: persisted records → engine → view-models, and writes through the domain. */

const clockAt = (day: string): Clock => ({
  now: () => `${day}T09:00:00.000Z` as Timestamp,
  today: () => isoDate(day) as IsoDate,
});

async function world(day = '2026-09-26') {
  const ids = sequentialIds(1);
  const w = await populatedWorld(ids, T0);
  const store = await LocalStore.open(w.db, sequentialIds(5000), clockAt(day));
  return { ...w, store };
}

describe('LocalStore snapshot (T103–T105)', () => {
  it('maps vehicles, the verified schedule, history, documents and provenance', async () => {
    const { store, car, moto } = await world();
    const snap = await store.snapshot();

    const carVm = snap.vehicles.find((v) => v.id === car.id)!;
    expect(carVm).toMatchObject({
      kind: 'car',
      manufacturer: 'טויוטה',
      registration: '12-345-67',
      odometerKm: 84250,
      odometerMeasuredAt: '2026-09-10',
      archived: false,
    });

    const b = snap.bundles[car.id];
    expect(b.schedule.status).toBe('verified');
    // Oil was done at 75,120 km but an open deferral (recorded at that service) makes it due now.
    expect(b.schedule.next).toMatchObject({
      dueAtKm: 84250,
      dueDate: '2025-12-10',
      remainingKm: 0,
      status: 'overdue',
    });
    expect(b.schedule.next!.title).toMatch(/טיפול 84,250/);
    expect(b.schedule.next!.intervalLabel).toMatch(/15,000.*12 חודשים.*המוקדם/);
    const oil = b.schedule.next!.items[0];
    expect(oil).toMatchObject({ title: 'שמן מנוע', verification: 'verified' });
    expect(oil.source?.locator).toBe('עמ׳ 412');

    expect(b.history).toHaveLength(1);
    expect(b.history[0]).toMatchObject({
      verification: 'verified',
      sourceAuthority: 'garage_document',
      garage: 'מוסך',
    });
    expect(b.documents[0]).toMatchObject({ kind: 'invoice', extraction: 'validated', pages: 1 });
    expect(b.garageRecommendations[0].text).toBe('רפידות');
    expect(b.deferred[0]).toMatchObject({ title: 'שמן מנוע', reason: 'נדחה' });

    // No schedule → professional schedule unavailable, with the reason; nothing invented.
    const m = snap.bundles[moto.id];
    expect(m.schedule).toEqual({
      status: 'pending',
      statusReason: he.data.reasonNoSource,
      upcoming: [],
    });
    expect(m.history[0].verification).toBe('pending');
  });

  it('data is vehicle-scoped: no record appears under another vehicle', async () => {
    const { store, car, moto } = await world();
    const snap = await store.snapshot();
    for (const id of [car.id, moto.id]) {
      const b = snap.bundles[id];
      for (const list of [b.history, b.documents, b.alerts, b.garageRecommendations, b.deferred])
        expect(list.every((r) => r.vehicleId === id)).toBe(true);
    }
  });
});

describe('alerts (explainable, persisted identity)', () => {
  it('persists each justified alert once and keeps handled status across restarts', async () => {
    const { store, car, db } = await world('2026-11-20');
    const first = await store.snapshot();
    const alerts = first.bundles[car.id].alerts;
    const kinds = alerts.map((a) => a.kind).sort();
    // The oil item is due only because it was deferred: one deferred alert, no duplicate
    // "overdue"; the 71-day-old reading impairs the distance calculation.
    expect(kinds).toEqual(['deferred', 'stale_odometer']);
    const deferred = alerts.find((a) => a.kind === 'deferred')!;
    expect(deferred.title).toBe(he.data.deferredTitle('שמן מנוע'));
    expect(deferred.reason).toBe('נדחה');
    const stale = alerts.find((a) => a.kind === 'stale_odometer')!;
    expect(stale.reason).toBe(he.data.staleReason(71));
    expect(stale.basis).toMatch(/84,250/);

    const count = async () => (await new AlertRepository(db).list(car.id)).length;
    const n = await count();
    const second = await store.snapshot();
    expect(await count()).toBe(n);
    expect(second.bundles[car.id].alerts.map((a) => a.id)).toEqual(alerts.map((a) => a.id));

    await store.setAlertHandled(car.id, stale.id);
    const reopened = await LocalStore.open(db, sequentialIds(9000), clockAt('2026-11-20'));
    const after = (await reopened.snapshot()).bundles[car.id].alerts;
    expect(after.find((a) => a.id === stale.id)?.handled).toBe(true);
  });

  it('an alert cannot be handled through another vehicle', async () => {
    const { store, car, moto } = await world('2026-11-20');
    const alert = (await store.snapshot()).bundles[car.id].alerts[0];
    await expect(store.setAlertHandled(moto.id, alert.id)).rejects.toThrow();
  });
});

describe('writes go through the domain (T106)', () => {
  it('rejects an odometer decrease and keeps the previous reading', async () => {
    const { store, car } = await world();
    await expect(store.updateOdometer(car.id, 1000, '2026-09-20')).rejects.toBeInstanceOf(
      DomainError,
    );
    expect((await store.snapshot()).vehicles.find((v) => v.id === car.id)?.odometerKm).toBe(84250);
  });

  it('a confirmed manual service is a user report and moves the next due point', async () => {
    const { store, car } = await world();
    const before = (await store.snapshot()).bundles[car.id];
    const oilId = before.schedule.next!.items[0].id;
    await store.addServiceEvent({
      id: '00000000-0000-4000-8000-00000000beef',
      vehicleId: car.id,
      date: '2026-09-20',
      odometerKm: 85000,
      origin: 'document', // claimed, but no original document is attached
      verification: 'verified',
      sourceAuthority: 'garage_document',
      actions: [
        {
          id: 'draft-oil',
          title: 'שמן מנוע',
          actionType: 'replacement',
          performed: true,
          maintenanceItemId: oilId,
          unlisted: false,
        },
      ],
      documentIds: [],
    });
    const snap = await store.snapshot();
    const b = snap.bundles[car.id];
    const saved = b.history.find((e) => e.id === '00000000-0000-4000-8000-00000000beef')!;
    // Without its original document the record cannot claim garage evidence.
    expect(saved).toMatchObject({
      origin: 'manual',
      verification: 'pending',
      sourceAuthority: 'user_report',
    });
    expect(b.schedule.next).toMatchObject({ dueAtKm: 100000, dueDate: '2027-09-20' });
    // The service odometer became the latest reading.
    expect(snap.vehicles.find((v) => v.id === car.id)?.odometerKm).toBe(85000);
  });

  it('rejects a service with no performed action', async () => {
    const { store, car } = await world();
    await expect(
      store.addServiceEvent({
        id: 'x',
        vehicleId: car.id,
        date: '2026-09-20',
        odometerKm: 85000,
        origin: 'manual',
        verification: 'pending',
        sourceAuthority: 'user_report',
        actions: [],
        documentIds: [],
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe('vehicle lifecycle and restart', () => {
  it('adds a vehicle with its onboarding reading, then archive / restore / delete', async () => {
    const db = await openTestDatabase();
    const store = await LocalStore.open(db, sequentialIds(1), clockAt('2026-09-26'));
    expect((await store.snapshot()).vehicles).toEqual([]);

    const id = await store.addVehicle(
      {
        id: '00000000-0000-4000-8000-0000000000c1',
        kind: 'scooter',
        manufacturer: 'ימאהה',
        model: 'XMAX 300',
        year: 2022,
        registration: '98-765-43',
        odometerKm: 9650,
        odometerMeasuredAt: '2026-09-26',
        archived: false,
      },
      { engine: '292 סמ״ק' },
    );
    expect(id).toBe('00000000-0000-4000-8000-0000000000c1');
    await store.setActiveVehicle(id);
    let snap = await store.snapshot();
    expect(snap.activeVehicleId).toBe(id);
    expect(snap.vehicles[0]).toMatchObject({ odometerKm: 9650, registration: '98-765-43' });
    expect(snap.bundles[id].schedule.status).toBe('pending');

    await store.archiveVehicle(id);
    snap = await store.snapshot();
    expect(snap.vehicles[0].archived).toBe(true);
    expect(snap.activeVehicleId).toBeNull();
    await store.restoreVehicle(id);
    expect((await store.snapshot()).vehicles[0].archived).toBe(false);

    // Restart: the data is on disk.
    const reopened = await LocalStore.open(
      await openTestDatabase(db.export()),
      sequentialIds(100),
      clockAt('2026-09-27'),
    );
    expect((await reopened.snapshot()).vehicles.map((v) => v.id)).toEqual([id]);

    await store.deleteVehicle(id);
    expect((await store.snapshot()).vehicles).toEqual([]);
  });

  it('rejects an invalid vehicle (domain validation)', async () => {
    const store = await LocalStore.open(
      await openTestDatabase(),
      sequentialIds(1),
      clockAt('2026-09-26'),
    );
    await expect(
      store.addVehicle({
        id: '00000000-0000-4000-8000-0000000000c2',
        kind: 'car',
        manufacturer: '',
        model: 'X',
        year: 2020,
        registration: 'abc',
        odometerKm: 0,
        odometerMeasuredAt: '2026-09-26',
        archived: false,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});

describe('service with its original document (T114/T118)', () => {
  const invoice = {
    documentId: '00000000-0000-4000-8000-00000000d0c1',
    file: {
      uri: 'file:///cache/invoice.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
      source: 'camera' as const,
    },
    title: 'חשבונית טיפול',
  };
  const serviceVm = (vehicleId: string, performed: boolean) => ({
    id: '00000000-0000-4000-8000-00000000e001',
    vehicleId,
    date: '2026-09-20',
    odometerKm: 85000,
    origin: 'document' as const,
    verification: 'verified' as const,
    sourceAuthority: 'garage_document' as const,
    actions: [
      {
        id: 'x',
        title: 'החלפת מצבר',
        actionType: 'replacement' as const,
        performed,
        unlisted: true,
      },
    ],
    documentIds: [invoice.documentId],
  });

  async function storeWithFiles() {
    const w = await populatedWorld(sequentialIds(1), T0);
    const files = new MemoryFileStore();
    const store = await LocalStore.open(w.db, sequentialIds(5000), clockAt('2026-09-26'), files);
    return { ...w, store, files };
  }

  it('stores the original, the document and the record together; evidence is the invoice', async () => {
    const { store, car, files } = await storeWithFiles();
    await store.addServiceEvent(serviceVm(car.id, true), invoice);
    const b = (await store.snapshot()).bundles[car.id];
    const doc = b.documents.find((d) => d.id === invoice.documentId)!;
    expect(doc).toMatchObject({
      kind: 'invoice',
      authority: 'garage_document',
      title: 'חשבונית טיפול',
    });
    const rec = b.history.find((e) => e.id === '00000000-0000-4000-8000-00000000e001')!;
    expect(rec).toMatchObject({
      origin: 'document',
      sourceAuthority: 'garage_document',
      verification: 'verified',
      documentIds: [invoice.documentId],
    });
    expect(files.files.size).toBe(1);
    const stored = [...files.files.values()][0];
    expect(stored.storageKey).toMatch(/^originals\//);
  });

  it('a rejected record leaves no document row and no orphaned file', async () => {
    const { store, car, files, db } = await storeWithFiles();
    await expect(store.addServiceEvent(serviceVm(car.id, false), invoice)).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(files.files.size).toBe(0);
    const docs = await db.all<{ id: string }>('SELECT id FROM documents WHERE id = ?', [
      invoice.documentId,
    ]);
    expect(docs).toEqual([]);
  });

  it('a storage failure stores nothing', async () => {
    const { store, car, files, db } = await storeWithFiles();
    files.failNext = true;
    await expect(store.addServiceEvent(serviceVm(car.id, true), invoice)).rejects.toThrow();
    const n = await db.first<{ n: number }>(
      "SELECT COUNT(*) AS n FROM service_events WHERE id = '00000000-0000-4000-8000-00000000e001'",
    );
    expect(n?.n).toBe(0);
  });
});
