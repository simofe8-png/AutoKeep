import { timestamp, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { MIGRATIONS, VehicleRepository } from '@/persistence';
import { migrate } from '@/persistence/migrations/runner';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';

import {
  compareCursor,
  parkedCount,
  pendingCount,
  pullChanges,
  pushPending,
  syncOnce,
  SyncRejectedError,
  tsMicros,
  type Cursor,
  type SyncTransport,
} from '../engine';
import { MemoryServer, serverTs } from '../testing/memoryServer';

/**
 * P2A regression tests for every audited sync failure mode (docs/release/P2_PRODUCTION_BACKEND_PLAN.md
 * §4): late-committed rows (Y1), equal-timestamp pagination (Y2), a poison op (Y3), server
 * versions (A3), and deletion propagation to other devices.
 */

const now = () => timestamp('2026-09-27T10:00:00.000Z') as Timestamp;

async function emptyDevice(): Promise<TestDatabase> {
  const db = await openTestDatabase();
  await migrate(db, MIGRATIONS, now);
  return db;
}

async function cursorOf(db: TestDatabase, name: string): Promise<Cursor | null> {
  const r = await db.first<{ value_json: string }>(
    'SELECT value_json FROM settings WHERE key = ?',
    [`syncCursor:${name}`],
  );
  return r ? (JSON.parse(r.value_json) as Cursor) : null;
}

describe('keyset ordering', () => {
  it('is exact to the microsecond regardless of the textual format', () => {
    expect(tsMicros('2026-09-27T10:00:00.123456+00:00')).toBe(
      tsMicros('2026-09-27T10:00:00.123Z') + 456,
    );
    expect(
      compareCursor(
        { ts: '2026-09-27T10:00:00.123456+00:00', key: 'a' },
        { ts: '2026-09-27T10:00:00.123Z', key: 'z' },
      ),
    ).toBeGreaterThan(0);
  });
});

describe('Y1: a row committed after another device pulled past its (earlier) timestamp', () => {
  async function scenario(overlapMs?: number) {
    const a = await populatedWorld(sequentialIds(1), T0);
    const server = new MemoryServer();
    await pushPending(a.db, server.transport(), now);
    const b = await emptyDevice();
    await pullChanges(b, server.transport(), now, 500, overlapMs);
    const bCursor = (await cursorOf(b, 'odometer_readings'))!;

    // A long server transaction started 2 s before B's cursor but committed after B's pull:
    // its rows carry the transaction START time, i.e. below the cursor.
    const late = {
      ...server.all('odometer_readings')[0],
      id: '00000000-0000-4000-8000-00000000aaaa',
      value_km: 99999,
      server_updated_at: serverTs(Math.floor(tsMicros(bCursor.ts) / 1000) - 2000),
    };
    server.putRaw('odometer_readings', late);
    await pullChanges(b, server.transport(), now, 500, overlapMs);
    return b.first('SELECT id FROM odometer_readings WHERE id = ?', [late.id]);
  }

  it('is still pulled thanks to the overlap re-read', async () => {
    expect(await scenario()).not.toBeNull();
  });

  it('negative control: without the overlap (the previous behaviour) the row is lost forever', async () => {
    expect(await scenario(0)).toBeNull();
  });
});

describe('Y2: more than a page of rows with the same timestamp', () => {
  it('pages through all of them (stable composite keyset) and terminates', async () => {
    const a = await populatedWorld(sequentialIds(1), T0);
    const event = (await a.db.first<{ id: string; vehicle_id: string }>(
      'SELECT id, vehicle_id FROM service_events LIMIT 1',
    ))!;
    const hex = (n: number) => n.toString(16).padStart(12, '0');
    for (let i = 0; i < 1200; i++) {
      const id = `10000000-0000-4000-8000-${hex(i + 1)}`;
      await a.db.run(
        `INSERT INTO documents (id, vehicle_id, kind, title, origin, authority, storage_key, mime_type,
           size_bytes, sha256, page_count, verification_json, created_at, updated_at, version)
         VALUES (?, ?, 'invoice', 't', 'user_upload', 'garage_document', ?, 'application/pdf', 10, ?,
           NULL, NULL, ?, ?, 1)`,
        [id, event.vehicle_id, `k/${id}`, 'd'.repeat(64), T0, T0],
      );
      await a.db.run(
        'INSERT INTO service_event_documents (service_event_id, document_id) VALUES (?, ?)',
        [event.id, id],
      );
    }
    const server = new MemoryServer();
    await pushPending(a.db, server.transport(), now);
    // One adoption/sync transaction: every row carries the same timestamp.
    const same = serverTs(server.clockMs, 7);
    for (const t of ['documents', 'service_event_documents'] as const) {
      for (const r of server.all(t)) server.putRaw(t, { ...r, server_updated_at: same });
    }

    const b = await emptyDevice();
    await pullChanges(b, server.transport(), now, 500);
    const docs = await b.first<{ n: number }>('SELECT COUNT(*) AS n FROM documents');
    const links = await b.first<{ n: number }>('SELECT COUNT(*) AS n FROM service_event_documents');
    expect(docs?.n).toBe(server.all('documents').length);
    expect(links?.n).toBe(server.all('service_event_documents').length);
  });

  it('a transport that does not advance fails fast instead of looping forever', async () => {
    const b = await emptyDevice();
    const stuck: SyncTransport = {
      push: async () => [],
      pull: async (t) =>
        t === 'profiles'
          ? Array.from({ length: 2 }, () => ({
              id: '00000000-0000-4000-8000-000000000001',
              server_updated_at: '2026-09-27T10:00:00.000000+00:00',
              created_at: T0,
              updated_at: T0,
              version: 1,
            }))
          : [],
      pullTombstones: async () => [],
    };
    await expect(pullChanges(b, stuck, now, 2)).rejects.toThrow(/did not advance/);
  });
});

describe('Y3: one permanently invalid op', () => {
  it('is parked and reported; every other op is still delivered', async () => {
    const a = await populatedWorld(sequentialIds(1), T0);
    const server = new MemoryServer();
    server.invalid = (op) => (op.entity_id === a.moto.id ? 'check_violation' : null);
    const total = await pendingCount(a.db);

    const r = await pushPending(a.db, server.transport(), now);
    expect(r.invalid).toBe(1);
    expect(await parkedCount(a.db)).toBe(1);
    expect(await pendingCount(a.db)).toBe(0);
    expect(server.all('vehicles').map((v) => v.id)).toEqual([a.car.id]);
    expect(r.applied).toBe(total - 1);

    // Parked ops are not resent on every round…
    const calls = server.pushCalls;
    await pushPending(a.db, server.transport(), now);
    expect(server.pushCalls).toBe(calls);
    // …until the user changes the entity again (the new content may be valid).
    server.invalid = () => null;
    await a.db.run("UPDATE vehicles SET trim = 'fixed' WHERE id = ?", [a.moto.id]);
    expect(await parkedCount(a.db)).toBe(0);
    await pushPending(a.db, server.transport(), now);
    expect(server.all('vehicles')).toHaveLength(2);
  });

  it('a whole request refused by the server is isolated op by op', async () => {
    const a = await populatedWorld(sequentialIds(1), T0);
    const server = new MemoryServer();
    server.rejectBatch = (ops) => ops.some((o) => o.entity_id === a.moto.id);
    await pushPending(a.db, server.transport(), now);
    expect(await parkedCount(a.db)).toBe(1);
    expect(await pendingCount(a.db)).toBe(0);
    expect(server.all('vehicles').map((v) => v.id)).toEqual([a.car.id]);
  });

  it('a transient failure parks nothing, keeps every op and asks for a backed-off retry', async () => {
    const a = await populatedWorld(sequentialIds(1), T0);
    const server = new MemoryServer();
    server.offline = true;
    const before = await pendingCount(a.db);
    await a.db.run(
      `INSERT INTO settings (key, value_json, updated_at) VALUES ('accountAdoption', ?, ?)`,
      [JSON.stringify({ status: 'adopted' }), T0],
    );
    const r = await syncOnce(a.db, server.transport(), now);
    expect(r).toMatchObject({ ok: false, reason: 'network' });
    expect((r as { retryInMs: number }).retryInMs).toBeGreaterThan(0);
    expect(await parkedCount(a.db)).toBe(0);
    expect(await pendingCount(a.db)).toBe(before);
  });
});

describe('A3: the server decides versions', () => {
  it('the local row adopts the server version, so the next edit applies without a conflict', async () => {
    const a = await populatedWorld(sequentialIds(1), T0);
    const server = new MemoryServer();
    await pushPending(a.db, server.transport(), now);
    const repo = new VehicleRepository(a.db);

    for (const trim of ['one', 'two', 'three']) {
      await a.db.run('UPDATE vehicles SET trim = ?, version = version + 1 WHERE id = ?', [
        trim,
        a.car.id,
      ]);
      const r = await pushPending(a.db, server.transport(), now);
      expect(r.conflicts).toBe(0);
      const local = await a.db.first<{ version: number }>(
        'SELECT version FROM vehicles WHERE id = ?',
        [a.car.id],
      );
      const remote = server.all('vehicles').find((v) => v.id === a.car.id)!;
      expect(local?.version).toBe(remote.version);
      expect(remote.trim).toBe(trim);
    }
    expect((await repo.get(a.car.id))?.identity.trim).toBe('three');
  });
});

describe('deletion propagates to other devices', () => {
  it('rows are removed and the local originals are reported for removal', async () => {
    const a = await populatedWorld(sequentialIds(1), T0);
    const server = new MemoryServer();
    await pushPending(a.db, server.transport(), now);
    const b = await emptyDevice();
    await pullChanges(b, server.transport(), now);
    expect(await b.first('SELECT id FROM vehicles WHERE id = ?', [a.car.id])).not.toBeNull();
    const keys = (
      await b.all<{ storage_key: string }>(
        'SELECT storage_key FROM documents WHERE vehicle_id = ?',
        [a.car.id],
      )
    ).map((d) => d.storage_key);
    expect(keys.length).toBeGreaterThan(0);

    await new VehicleRepository(a.db).deletePermanently(a.car.id);
    await pushPending(a.db, server.transport(), now);
    const r = await pullChanges(b, server.transport(), now);

    expect(r.tombstones).toBe(1);
    expect(r.removedOriginals.sort()).toEqual(keys.sort());
    expect(await b.first('SELECT id FROM vehicles WHERE id = ?', [a.car.id])).toBeNull();
    expect(await b.first('SELECT id FROM documents WHERE vehicle_id = ?', [a.car.id])).toBeNull();
    expect(await b.first('SELECT id FROM vehicles WHERE id = ?', [a.moto.id])).not.toBeNull();
    // Re-reading the overlap later does not report the files again.
    expect((await pullChanges(b, server.transport(), now)).removedOriginals).toEqual([]);
  });
});

it('a pulled child whose vehicle is not on this device is skipped instead of failing the pull', async () => {
  const a = await populatedWorld(sequentialIds(1), T0);
  const server = new MemoryServer();
  await pushPending(a.db, server.transport(), now);
  const orphan = {
    ...server.all('odometer_readings')[0],
    id: '20000000-0000-4000-8000-000000000001',
    vehicle_id: '20000000-0000-4000-8000-0000000000ff',
    server_updated_at: serverTs(server.clockMs + 5),
  };
  server.putRaw('odometer_readings', orphan);
  const b = await emptyDevice();
  await expect(pullChanges(b, server.transport(), now)).resolves.toBeDefined();
  expect(await b.first('SELECT id FROM odometer_readings WHERE id = ?', [orphan.id])).toBeNull();
  expect(await b.first('SELECT id FROM vehicles WHERE id = ?', [a.car.id])).not.toBeNull();
});

it('SyncRejectedError is exported for transports', () => {
  expect(new SyncRejectedError('x')).toBeInstanceOf(Error);
});
