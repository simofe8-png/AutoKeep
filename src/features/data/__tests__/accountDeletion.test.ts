import { sequentialIds, T0 } from '@/domain/testing';
import { MemoryAccountBackend, VALID_CODE } from '@/features/account/testing';
import { populatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

import { LocalStore, type Clock } from '../localStore';

/**
 * P2A account deletion (store level): the server deletes originals and the account first; only
 * after it confirmed is this device wiped. Failures change nothing locally; an interrupted wipe is
 * completed on the next start; retrying is safe; another account is never touched.
 */

const clock: Clock = {
  now: () => '2026-09-27T09:00:00.000Z' as never,
  today: () => '2026-09-27' as never,
};

async function signedInDevice(email = 'rc@autokeep.test') {
  const w = await populatedWorld(sequentialIds(1), T0);
  const files = new MemoryFileStore();
  const store = await LocalStore.open(w.db, sequentialIds(50_000), clock, files);
  await store.addDocument(
    w.car.id,
    {
      documentId: '00000000-0000-4000-8000-00000000d0c1',
      file: {
        uri: 'file:///cache/i.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 9,
        source: 'file',
      },
      title: 'חשבונית',
    },
    'invoice',
  );
  const backend = new MemoryAccountBackend();
  await backend.verifyCode(email, VALID_CODE);
  await store.connectAccount(backend);
  return { w, files, store, backend };
}

const count = async (db: { first: <T>(q: string) => Promise<T | null> }, table: string) =>
  (await db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;

it('success: the server copy goes first, then everything on this device; signed out', async () => {
  const { w, files, store, backend } = await signedInDevice();
  // Another account's backed-up original must survive.
  backend.objects.set('user:other@autokeep.test/v/d', new Uint8Array([1]));
  expect([...backend.objects.keys()].some((k) => k.startsWith('user:rc@'))).toBe(true);
  expect(files.files.size).toBe(1);

  const r = await store.deleteAccount(backend);

  expect(r).toEqual({ ok: true });
  expect(backend.deletedAccounts).toEqual(['rc@autokeep.test']);
  expect([...backend.objects.keys()]).toEqual(['user:other@autokeep.test/v/d']);
  for (const t of ['vehicles', 'documents', 'service_events', 'odometer_readings', 'alerts']) {
    expect(await count(w.db, t)).toBe(0);
  }
  for (const t of ['sync_outbox', 'sync_shadow', 'sync_conflicts', 'settings']) {
    expect(await count(w.db, t)).toBe(0);
  }
  expect(files.files.size).toBe(0);
  expect(await backend.currentEmail()).toBeNull();
  expect((await store.backupStatus()).adoption).toBe('none');
  // Nothing of the wipe was queued for sync.
  expect(await count(w.db, 'sync_outbox')).toBe(0);
});

it.each(['network', 'server'] as const)(
  'a %s failure changes nothing on this device and is reported',
  async (failure) => {
    const { w, files, store, backend } = await signedInDevice();
    backend.deleteFails = failure;
    const vehicles = await count(w.db, 'vehicles');

    const r = await store.deleteAccount(backend);

    expect(r).toEqual({ ok: false, reason: failure });
    expect(await count(w.db, 'vehicles')).toBe(vehicles);
    expect(files.files.size).toBe(1);
    expect(await backend.currentEmail()).toBe('rc@autokeep.test');
    expect((await store.backupStatus()).adoption).toBe('adopted');

    // Retrying is safe and completes the deletion.
    backend.deleteFails = null;
    expect(await store.deleteAccount(backend)).toEqual({ ok: true });
    expect(await count(w.db, 'vehicles')).toBe(0);
  },
);

it('a wipe interrupted after the server confirmed is completed on the next start', async () => {
  const { w, files, backend } = await signedInDevice();
  expect((await backend.deleteAccount()).ok).toBe(true); // server side done…
  await w.db.run(
    `INSERT INTO settings (key, value_json, updated_at) VALUES ('accountDeletion', ?, ?)`,
    [JSON.stringify({ status: 'local_pending' }), T0],
  ); // …the app was killed before wiping.

  await LocalStore.open(w.db, sequentialIds(60_000), clock, files);

  expect(await count(w.db, 'vehicles')).toBe(0);
  expect(await count(w.db, 'settings')).toBe(0);
  expect(files.files.size).toBe(0);
});

it('a signed-in device whose adoption did not complete retries it automatically', async () => {
  const w = await populatedWorld(sequentialIds(1), T0);
  const store = await LocalStore.open(w.db, sequentialIds(50_000), clock, new MemoryFileStore());
  const backend = new MemoryAccountBackend();
  await backend.verifyCode('rc@autokeep.test', VALID_CODE);
  backend.offline = true;
  expect(await store.backUp(backend)).toEqual({ ok: false, transient: true });
  expect((await store.backupStatus()).adoption).not.toBe('adopted');

  backend.offline = false;
  expect(await store.backUp(backend)).toEqual({ ok: true });
  expect((await store.backupStatus()).adoption).toBe('adopted');
});
