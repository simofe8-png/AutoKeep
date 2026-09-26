import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

import { LocalStore, type Clock, type Snapshot } from '../localStore';

/**
 * T137 zero-cross-vehicle-leakage gate. A seeded random sequence of real operations across a car,
 * a motorcycle and a scooter; after every step each vehicle's view contains only its own records,
 * and every per-vehicle table row belongs to an existing vehicle.
 */

const clock: Clock = {
  now: () => '2026-09-26T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-26') as IsoDate,
};

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

const VEHICLES = [
  ['00000000-0000-4000-8000-0000000000c1', 'car', 'טויוטה', 'קורולה', '12-345-67'],
  ['00000000-0000-4000-8000-0000000000c2', 'motorcycle', 'הונדה', 'CB500F', '123-45-678'],
  ['00000000-0000-4000-8000-0000000000c3', 'scooter', 'ימאהה', 'XMAX 300', '98-765-43'],
] as const;

function assertIsolated(snap: Snapshot) {
  for (const v of snap.vehicles) {
    const b = snap.bundles[v.id];
    for (const list of [b.history, b.documents, b.alerts, b.garageRecommendations, b.deferred]) {
      for (const r of list) expect(r.vehicleId).toBe(v.id);
    }
  }
}

describe('zero cross-vehicle leakage (T137)', () => {
  it.each([1, 7, 42])('random operation sequence (seed %i) never mixes vehicles', async (seed) => {
    const db = await openTestDatabase();
    const files = new MemoryFileStore();
    const store = await LocalStore.open(db, sequentialIds(1), clock, files);
    for (const [id, kind, manufacturer, model, registration] of VEHICLES) {
      await store.addVehicle({
        id,
        kind,
        manufacturer,
        model,
        year: 2021,
        registration,
        odometerKm: 10000,
        odometerMeasuredAt: '2026-01-01',
        archived: false,
      });
    }
    const rand = rng(seed);
    const pick = () => VEHICLES[Math.floor(rand() * VEHICLES.length)][0];
    const km: Record<string, number> = Object.fromEntries(VEHICLES.map(([id]) => [id, 10000]));
    let n = 0;
    for (let step = 0; step < 40; step++) {
      const vid = pick();
      const op = Math.floor(rand() * 4);
      n += 1;
      const uid = (x: number) => `00000000-0000-4000-9000-${String(x).padStart(12, '0')}`;
      if (op === 0) {
        km[vid] += 500;
        await store.updateOdometer(vid, km[vid], '2026-09-26');
      } else if (op === 1) {
        await store.addServiceEvent({
          id: uid(n),
          vehicleId: vid,
          date: '2026-09-20',
          odometerKm: km[vid],
          origin: 'manual',
          verification: 'pending',
          sourceAuthority: 'user_report',
          actions: [
            {
              id: 'a',
              title: `שירות ${n}`,
              actionType: 'other',
              performed: true,
              unlisted: true,
            },
          ],
          documentIds: [],
        });
      } else if (op === 2) {
        await store.addGarageRecommendation({
          id: uid(n),
          vehicleId: vid,
          text: `הערה ${n}`,
          date: '2026-09-20',
        });
      } else {
        await store.addDocument(
          vid,
          {
            documentId: uid(n),
            file: {
              uri: `file:///cache/${n}.pdf`,
              mimeType: 'application/pdf',
              sizeBytes: 10,
              source: 'file',
            },
            title: `מסמך ${n}`,
          },
          'other',
        );
      }
      assertIsolated(await store.snapshot());
    }

    // Every per-vehicle row belongs to an existing vehicle; each vehicle's odometer is its own.
    for (const table of [
      'odometer_readings',
      'service_events',
      'documents',
      'garage_recommendations',
      'alerts',
      'deferred_items',
    ]) {
      const orphans = await db.all(
        `SELECT id FROM ${table} WHERE vehicle_id NOT IN (SELECT id FROM vehicles)`,
      );
      expect(orphans).toEqual([]);
    }
    const snap = await store.snapshot();
    for (const [id] of VEHICLES) {
      expect(snap.vehicles.find((v) => v.id === id)?.odometerKm).toBe(km[id]);
    }

    // Reads that name the wrong vehicle get nothing (no id-guessing across vehicles).
    const [car, moto] = [VEHICLES[0][0], VEHICLES[1][0]];
    const carDoc = snap.bundles[car].documents[0];
    if (carDoc) expect(await store.original(moto, carDoc.id)).toBeNull();
  });
});
