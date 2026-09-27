import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds } from '@/domain/testing';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { MemoryFileStore } from '@/providers/storage/types';

import { LocalStore } from '../localStore';

/**
 * Found on the Galaxy A54 at 02:34 Israel time (RC, 2026-09-27): every save dated "today" failed,
 * because the domain compared it with the UTC date (still 2026-09-26). Between 00:00 and 03:00
 * local time, services, odometer readings and onboarding were all rejected as "in the future".
 */

// 02:30 in Israel (UTC+3) on 2026-09-27 is 23:30 UTC on 2026-09-26.
const clock = {
  now: () => '2026-09-26T23:30:00.000Z' as Timestamp,
  today: () => isoDate('2026-09-27') as IsoDate,
};
const CAR = '00000000-0000-4000-8000-00000000d001';

async function open() {
  const store = await LocalStore.open(
    await openTestDatabase(),
    sequentialIds(1),
    clock,
    new MemoryFileStore(),
  );
  // Onboarding records the first reading, dated local today.
  await store.addVehicle({
    id: CAR,
    kind: 'car',
    manufacturer: 'טויוטה',
    model: 'קורולה',
    year: 2019,
    registration: '12-345-67',
    odometerKm: 84250,
    odometerMeasuredAt: '2026-09-27',
    archived: false,
  });
  return store;
}

it('after local midnight, a service and a reading dated local today are saved', async () => {
  const store = await open();
  await store.updateOdometer(CAR, 84300, '2026-09-27');
  await store.addServiceEvent({
    id: '00000000-0000-4000-8000-00000000e001',
    vehicleId: CAR,
    date: '2026-09-27',
    odometerKm: 84300,
    origin: 'manual',
    verification: 'pending',
    sourceAuthority: 'user_report',
    actions: [
      { id: 'a', title: 'החלפת שמן', actionType: 'replacement', performed: true, unlisted: true },
    ],
    documentIds: [],
  });
  const snap = await store.snapshot();
  expect(snap.vehicles.find((v) => v.id === CAR)?.odometerKm).toBe(84300);
  expect(snap.bundles[CAR].history.map((h) => h.date)).toContain('2026-09-27');
});

it('the local tomorrow is still in the future', async () => {
  const store = await open();
  await expect(store.updateOdometer(CAR, 84400, '2026-09-28')).rejects.toThrow();
});
