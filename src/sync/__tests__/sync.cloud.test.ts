import type { SupabaseClient } from '@supabase/supabase-js';

import { adoptLocalData } from '@/account/adoption';
import { supabaseAdoptionCloud } from '@/account/cloudAdoption';
import {
  confirmServiceDraft,
  handleAlert,
  snoozeAlert,
  isoDate,
  timestamp,
  touch,
  type Id,
  type IdGenerator,
  type Timestamp,
  type Vehicle,
  type VehicleId,
} from '@/domain';
import { T0 } from '@/domain/testing';
import { userClient } from '@/cloud/testing/localStack';
import {
  AlertRepository,
  lifecycle,
  migrate,
  MIGRATIONS,
  ProfileRepository,
  ServiceRepository,
  VehicleRepository,
} from '@/persistence';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';

import { pendingCount, syncOnce, type SyncTransport } from '../engine';
import { toCloudRow } from '../mapping';
import { supabaseSyncTransport } from '../supabaseTransport';

const ids: IdGenerator = { next: <T extends string>() => globalThis.crypto.randomUUID() as Id<T> };
let tick = Date.parse('2026-09-26T10:00:00.000Z');
/** Strictly increasing clock so "later edit" is unambiguous. */
const clock = (): Timestamp => timestamp(new Date((tick += 1000)).toISOString());

interface Device {
  db: TestDatabase;
  sb: SupabaseClient;
  transport: SyncTransport;
}

async function emptyDevice(sb: SupabaseClient): Promise<Device> {
  const db = await openTestDatabase();
  await migrate(db, MIGRATIONS, () => T0);
  await new ProfileRepository(db).getOrCreate(ids, T0);
  return { db, sb, transport: supabaseSyncTransport(sb) };
}

async function joinAccount(d: Device) {
  const profile = await new ProfileRepository(d.db).getOrCreate(ids, T0);
  const r = await adoptLocalData(d.db, supabaseAdoptionCloud(d.sb), profile.id, clock);
  if (!r.ok) throw new Error(`adoption failed: ${r.failure}`);
}

async function sync(d: Device) {
  const r = await syncOnce(d.db, d.transport, clock);
  if (!r.ok) throw new Error(`sync failed: ${r.reason} ${r.message ?? ''}`);
  return r;
}

async function vehicle(d: Device, id: VehicleId): Promise<Vehicle> {
  const v = await new VehicleRepository(d.db).get(id);
  if (!v) throw new Error('vehicle missing on device');
  return v;
}

async function serviceCount(d: Device, id: VehicleId) {
  return (await new ServiceRepository(d.db).list(id)).length;
}

async function setup() {
  const user = await userClient('sync');
  const world = await populatedWorld(ids, T0);
  const a: Device = {
    db: world.db,
    sb: user.client,
    transport: supabaseSyncTransport(user.client),
  };
  await joinAccount(a);
  const b = await emptyDevice(await user.signInAgain());
  await joinAccount(b);
  await sync(b); // new device restores the account's data
  return { a, b, car: world.car.id, moto: world.moto.id };
}

describe('M09 sync against the local Supabase stack', () => {
  it('color and engine code: account backup, restore on a new device, and later edits sync', async () => {
    const user = await userClient('identity');
    const world = await populatedWorld(ids, T0);
    const repo = new VehicleRepository(world.db);
    const car = (await repo.get(world.car.id))!;
    await repo.update({
      ...car,
      identity: { ...car.identity, color: 'לבן', engineCode: 'CGGB' },
      ...touch(car, clock()),
    });
    const a: Device = {
      db: world.db,
      sb: user.client,
      transport: supabaseSyncTransport(user.client),
    };
    await joinAccount(a); // backup: adoption uploads the local vehicle as it is
    const b = await emptyDevice(await user.signInAgain());
    await joinAccount(b);
    await sync(b); // restore on another device
    expect((await vehicle(b, world.car.id)).identity).toMatchObject({
      color: 'לבן',
      engineCode: 'CGGB',
    });
    // Unknown stays unknown on the other vehicle.
    expect((await vehicle(b, world.moto.id)).identity.engineCode).toBeUndefined();

    const onB = await vehicle(b, world.car.id);
    await new VehicleRepository(b.db).update({
      ...onB,
      identity: { ...onB.identity, color: 'אפור' },
      ...touch(onB, clock()),
    });
    await sync(b);
    await sync(a);
    expect((await vehicle(a, world.car.id)).identity).toMatchObject({
      color: 'אפור',
      engineCode: 'CGGB',
    });
  });

  it('a second device restores all account data (inbound sync, T074)', async () => {
    const { a, b, car, moto } = await setup();
    expect(
      (await new VehicleRepository(b.db).list({ includeArchived: true })).map((v) => v.id).sort(),
    ).toEqual([car, moto].sort());
    expect(await serviceCount(b, car)).toBe(await serviceCount(a, car));
    expect(await new ServiceRepository(b.db).list(car)).toEqual(
      await new ServiceRepository(a.db).list(car),
    );
  });

  it('offline changes on two devices converge without loss or false conflicts (T077/T078)', async () => {
    const { a, b, car, moto } = await setup();

    // Device A (offline): records a new service and archives the CAR (same entity B edits).
    const ev = confirmServiceDraft(
      {
        vehicleId: car,
        origin: 'manual',
        date: '2026-09-20',
        odometerKm: 84250,
        garageName: '',
        notes: 'A',
        actions: [
          {
            title: 'שמן',
            actionType: 'replacement',
            performed: true,
            maintenanceItemId: null,
            unlisted: false,
          },
        ],
        documentIds: [],
        extractionId: null,
      },
      { confirmedBy: 'user', confirmedAt: clock() },
      ids,
    );
    if (!ev.ok) throw new Error('fixture');
    await new ServiceRepository(a.db).add(ev.value);
    await lifecycle.archive(a.db, car, clock());

    // Device B (offline): records its own service for the same car and edits the trim.
    const evB = confirmServiceDraft(
      {
        vehicleId: car,
        origin: 'manual',
        date: '2026-09-21',
        odometerKm: 84300,
        garageName: '',
        notes: 'B',
        actions: [
          {
            title: 'צמיגים',
            actionType: 'other',
            performed: true,
            maintenanceItemId: null,
            unlisted: true,
          },
        ],
        documentIds: [],
        extractionId: null,
      },
      { confirmedBy: 'user', confirmedAt: clock() },
      ids,
    );
    if (!evB.ok) throw new Error('fixture');
    await new ServiceRepository(b.db).add(evB.value);
    const bCar = await vehicle(b, car);
    await new VehicleRepository(b.db).update({
      ...bCar,
      identity: { ...bCar.identity, trim: 'Sun' },
      ...touch(bCar, clock()),
    });

    // Back online, in any order.
    await sync(a);
    await sync(b);
    await sync(a);

    for (const d of [a, b]) {
      expect(await serviceCount(d, car)).toBe(3); // both independent services kept
      expect((await vehicle(d, car)).identity.trim).toBe('Sun');
      expect((await vehicle(d, car)).lifecycle).toBe('archived'); // A's field
      expect((await vehicle(d, moto)).lifecycle).toBe('active');
      expect(await pendingCount(d.db)).toBe(0);
      expect(await d.db.all('SELECT * FROM sync_conflicts')).toEqual([]);
    }
  });

  it('same field edited on both devices: later edit wins everywhere and is recorded (T076)', async () => {
    const { a, b, car } = await setup();
    const aCar = await vehicle(a, car);
    await new VehicleRepository(a.db).update({
      ...aCar,
      identity: { ...aCar.identity, engine: '1.8' },
      ...touch(aCar, clock()),
    });
    const bCar = await vehicle(b, car);
    await new VehicleRepository(b.db).update({
      ...bCar,
      identity: { ...bCar.identity, engine: '2.0' },
      ...touch(bCar, clock()),
    });

    await sync(a); // A's edit reaches the server first
    await sync(b); // B conflicts, merges (B is later), pushes
    await sync(a);

    expect((await vehicle(a, car)).identity.engine).toBe('2.0');
    expect((await vehicle(b, car)).identity.engine).toBe('2.0');
    const conflicts = await b.db.all<{ field: string; kept: string }>(
      'SELECT field, kept FROM sync_conflicts',
    );
    expect(conflicts).toEqual([{ field: 'engine', kept: 'local' }]);
  });

  it('a handled alert stays handled even if another device snoozed it (T076)', async () => {
    const { a, b, car } = await setup();
    const [alertA] = await new AlertRepository(a.db).list(car);
    const handled = handleAlert(alertA, clock());
    if (!handled.ok) throw new Error('fixture');
    await new AlertRepository(a.db).update(handled.value);
    const [alertB] = await new AlertRepository(b.db).list(car);
    const snoozed = snoozeAlert(alertB, isoDate('2026-12-01'), clock());
    if (!snoozed.ok) throw new Error('fixture');
    await new AlertRepository(b.db).update(snoozed.value);

    await sync(a);
    await sync(b);
    await sync(a);
    for (const d of [a, b])
      expect((await new AlertRepository(d.db).list(car))[0].status).toBe('handled');
  });

  it('retries are idempotent and a network failure loses nothing (T075)', async () => {
    const { a, car } = await setup();
    const aCar = await vehicle(a, car);
    await new VehicleRepository(a.db).update({
      ...aCar,
      identity: { ...aCar.identity, fuel: 'היברידי' },
      ...touch(aCar, clock()),
    });

    const offline: SyncTransport = {
      push: async () => {
        throw new Error('network down');
      },
      pull: async () => {
        throw new Error('network down');
      },
      pullTombstones: async () => [],
    };
    const failed = await syncOnce(a.db, offline, clock);
    expect(failed).toMatchObject({ ok: false, reason: 'network' });
    expect(failed.ok === false && failed.retryInMs).toBeGreaterThan(0);
    expect(await pendingCount(a.db)).toBe(1);

    // A response lost after the server applied the op: re-sending the same op is a no-op.
    const [op] = await a.db.all<{ op_id: string; base_version: number }>(
      'SELECT op_id, base_version FROM sync_outbox',
    );
    const row = toCloudRow(
      'vehicles',
      (await a.db.first('SELECT * FROM vehicles WHERE id = ?', [car]))!,
    );
    const first = await a.transport.push([
      {
        op_id: op.op_id,
        table: 'vehicles',
        op: 'upsert',
        entity_id: car,
        base_version: op.base_version,
        row,
      },
    ]);
    const again = await a.transport.push([
      {
        op_id: op.op_id,
        table: 'vehicles',
        op: 'upsert',
        entity_id: car,
        base_version: op.base_version,
        row,
      },
    ]);
    expect(first[0].status).toBe('applied');
    expect(again[0].status).toBe('duplicate');

    await sync(a);
    expect(await pendingCount(a.db)).toBe(0);
  });

  it('permanent deletion on one device removes the vehicle on the other (tombstone)', async () => {
    const { a, b, moto } = await setup();
    await new VehicleRepository(a.db).deletePermanently(moto);
    await sync(a);
    await sync(b);
    expect(await new VehicleRepository(b.db).get(moto)).toBeNull();
    expect(
      await b.db.first('SELECT COUNT(*) AS n FROM service_events WHERE vehicle_id = ?', [moto]),
    ).toEqual({ n: 0 });
  });
});
