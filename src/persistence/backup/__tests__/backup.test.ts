import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { LocalStore } from '@/features/data/localStore';
import { MIGRATIONS } from '@/persistence';
import { migrate } from '@/persistence/migrations/runner';
import { openTestDatabase, type TestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld, type PopulatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

import { referencedFileKeys, sweepOrphanFiles } from '../../files';
import { decodeBase64, encodeBase64 } from '../base64';
import { restoreBackup, validateBackup, type RestoreFailure } from '../backup';
import { nodeBackupCrypto as crypto } from '../testing';

/**
 * Local-first backup (ADR-0023): one versioned, checksummed file with every table and stored
 * original; restore validates everything first and replaces the data atomically. An invalid file
 * never changes the device.
 */

const clock = {
  now: () => '2026-10-11T09:00:00.000Z' as Timestamp,
  today: () => isoDate('2026-10-11') as IsoDate,
};
const now = clock.now();

/** A device with vehicles, history, a document original and the owner's vehicle photo. */
async function populatedDevice() {
  const world = await populatedWorld(sequentialIds(1), T0);
  const files = new MemoryFileStore();
  const store = await LocalStore.open(world.db, sequentialIds(5000), clock, files);
  await store.addDocument(
    world.car.id,
    {
      documentId: '00000000-0000-4000-8000-0000000000d1',
      file: {
        uri: 'file:///c/licence.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1,
        source: 'file',
      },
      title: 'רישיון רכב',
    },
    'registration',
  );
  await store.setVehiclePhoto(world.car.id, {
    uri: 'file:///c/car.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1,
    source: 'camera',
  });
  await store.setVehicleDates(world.car.id, { testUntil: '2027-01-01' as IsoDate });
  return { world, files, store };
}

async function emptyDevice(): Promise<TestDatabase> {
  const db = await openTestDatabase();
  await migrate(db, MIGRATIONS, () => now);
  return db;
}

/** Every user table's rows, for comparing two devices. */
async function dump(db: TestDatabase) {
  const tables = await db.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name",
  );
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables) {
    out[name] = await db.all(`SELECT * FROM ${name} ORDER BY rowid`);
  }
  return out;
}

const fileMap = (f: MemoryFileStore) =>
  Object.fromEntries([...f.files].map(([k, v]) => [k, encodeBase64(v.bytes)]));

let device: { world: PopulatedWorld; files: MemoryFileStore; store: LocalStore };
beforeEach(async () => {
  device = await populatedDevice();
});

describe('export → restore on a clean device', () => {
  it('reproduces every table and every stored original exactly', async () => {
    const { text, manifest } = await device.store.createBackup(crypto);
    // The world's seeded invoice has no stored file: reported, not invented.
    expect(manifest.missingFiles).toEqual(['local/invoice.pdf']);
    expect(manifest.fileCount).toBe(2);

    const target = await emptyDevice();
    const targetFiles = new MemoryFileStore();
    const r = await restoreBackup(target, targetFiles, text, crypto, now);
    expect(r).toMatchObject({ ok: true, files: 2, missingFiles: 1 });

    const before = await dump(device.world.db);
    const after = await dump(target);
    // The restore records when the backup was made; everything else is identical.
    const settings = (rows: unknown[]) =>
      (rows as { key: string }[]).filter((s) => s.key !== 'lastBackupAt');
    expect(settings(after.settings)).toEqual(settings(before.settings));
    expect({ ...after, settings: [] }).toEqual({ ...before, settings: [] });
    expect(fileMap(targetFiles)).toEqual(fileMap(device.files));

    // The restored device opens and shows the same vehicles and files.
    const reopened = await LocalStore.open(target, sequentialIds(9000), clock, targetFiles);
    const snap = await reopened.snapshot();
    expect(snap.vehicles.map((v) => v.id).sort()).toEqual(
      (await device.store.snapshot()).vehicles.map((v) => v.id).sort(),
    );
    expect(Object.keys(snap.vehiclePhotos)).toEqual([device.world.car.id]);
    expect(snap.backup.lastBackupAt).toBe(now);
  });

  it('replaces existing data: records and files not in the backup are gone', async () => {
    const { text } = await device.store.createBackup(crypto);
    const other = await populatedDevice();
    const extra = await other.store.addVehicle({
      id: '00000000-0000-4000-8000-0000000000aa',
      kind: 'car',
      manufacturer: 'מאזדה',
      model: '3',
      year: 2015,
      registration: '1234567',
      odometerKm: 0,
      odometerMeasuredAt: '2026-10-11',
    } as never);
    const otherKeys = [...other.files.files.keys()];

    const r = await restoreBackup(other.world.db, other.files, text, crypto, now);
    expect(r.ok).toBe(true);
    const ids = await other.world.db.all<{ id: string }>('SELECT id FROM vehicles');
    expect(ids.map((v) => v.id)).not.toContain(extra);
    for (const k of otherKeys) expect(other.files.files.has(k)).toBe(false);
    const referenced = await referencedFileKeys(other.world.db);
    for (const k of other.files.files.keys()) expect(referenced).toContain(k);
  });
});

describe('integrity: an invalid file is rejected and changes nothing', () => {
  async function expectRejected(text: string, reason: RestoreFailure) {
    const before = await dump(device.world.db);
    const filesBefore = fileMap(device.files);
    const r = await restoreBackup(device.world.db, device.files, text, crypto, now);
    expect(r).toEqual({ ok: false, reason });
    expect(await dump(device.world.db)).toEqual(before);
    expect(fileMap(device.files)).toEqual(filesBefore);
  }
  const mutate = async (fn: (b: Record<string, any>) => void) => {
    const { text } = await device.store.createBackup(crypto);
    const b = JSON.parse(text);
    fn(b);
    return JSON.stringify(b);
  };

  it('not a backup / truncated', async () => {
    const { text } = await device.store.createBackup(crypto);
    await expectRejected(text.slice(0, text.length / 2), 'not_backup');
    await expectRejected('{"hello":1}', 'not_backup');
  });

  it('a changed record (checksum mismatch)', async () => {
    await expectRejected(
      await mutate((b) => {
        const v = b.tables.vehicles;
        v.rows[0][v.columns.indexOf('model')] = 'מזויף';
      }),
      'corrupted',
    );
  });

  it('a changed original file', async () => {
    await expectRejected(
      await mutate((b) => {
        b.files[0].data = encodeBase64(new TextEncoder().encode('tampered'));
      }),
      'corrupted',
    );
  });

  it('a removed file or row count that disagrees with the manifest', async () => {
    await expectRejected(await mutate((b) => b.files.pop()), 'corrupted');
    await expectRejected(await mutate((b) => b.tables.vehicles.rows.pop()), 'corrupted');
  });

  it('a file key that escapes app storage', async () => {
    await expectRejected(await mutate((b) => (b.files[0].key = '../../etc/x')), 'corrupted');
  });

  it('an unsupported format, a newer app, an unknown table', async () => {
    await expectRejected(await mutate((b) => (b.formatVersion = 2)), 'unsupported_version');
    await expectRejected(
      await mutate((b) => (b.schemaVersion = MIGRATIONS.length + 1)),
      'newer_app',
    );
    await expectRejected(
      await mutate((b) => (b.tables.cloud_secrets = { columns: ['x'], rows: [] })),
      'incompatible',
    );
  });

  it('a commit that fails rolls back: previous data and files intact, new files removed', async () => {
    // A consistent, correctly checksummed backup whose data breaks a foreign key at commit.
    const src = await populatedDevice();
    await src.world.db.exec('PRAGMA foreign_keys = OFF');
    await src.world.db.run(
      `INSERT INTO odometer_readings (id, vehicle_id, value_km, measured_at, source, created_at, updated_at, version)
       VALUES ('orphan', 'no-such-vehicle', 1, '2026-01-01', 'user', ?, ?, 1)`,
      [T0, T0],
    );
    const { text } = await src.store.createBackup(crypto);
    expect((await validateBackup(device.world.db, text, crypto)).ok).toBe(true);
    await expectRejected(text, 'write_failed');
  });
});

describe('file ownership', () => {
  it('every stored file belongs to a record; deleting a vehicle leaves no orphan', async () => {
    const referenced = await referencedFileKeys(device.world.db);
    for (const k of device.files.files.keys()) expect(referenced).toContain(k);
    await device.store.deleteVehicle(device.world.car.id);
    expect(device.files.files.size).toBe(0);
  });

  it('the sweep removes only unreferenced files', async () => {
    const lost = await device.files.importBytes(new Uint8Array([1, 2, 3]), 'image/jpeg');
    const removed = await sweepOrphanFiles(device.world.db, device.files);
    expect(removed).toEqual([lost.storageKey]);
    expect(device.files.files.size).toBe(2);
  });
});

it('base64 round-trips any bytes and rejects non-base64', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 255, 12289]) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37 + n) % 256);
    expect(decodeBase64(encodeBase64(bytes))).toEqual(bytes);
  }
  expect(decodeBase64('abc')).toBeNull();
  expect(decodeBase64('ab!d')).toBeNull();
});
