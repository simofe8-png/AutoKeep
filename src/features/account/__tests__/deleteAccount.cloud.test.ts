import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { adminClient, localStatus, userClient } from '@/cloud/testing/localStack';
import { LocalStore, type Clock } from '@/features/data/localStore';
import { populatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

import { supabaseAccountBackend } from '../backend';

/**
 * P2A account deletion against the LOCAL stack, through the real Edge Function
 * (supabase/functions/delete-account): every row and every stored original of the user is gone,
 * the auth user is gone, another user is untouched, a retry is idempotent, and nobody but the
 * signed-in user can trigger it.
 */

const clock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
  today: () => isoDate(new Date().toISOString().slice(0, 10)) as IsoDate,
};
const TABLES = [
  'profiles',
  'vehicles',
  'odometer_readings',
  'documents',
  'extractions',
  'schedules',
  'service_events',
  'service_actions',
  'service_event_documents',
  'garage_recommendations',
  'deferred_items',
  'alerts',
  'sync_applied_ops',
  'sync_tombstones',
];

async function backedUpUser(tag: string) {
  const base = Math.floor(Math.random() * 2 ** 40);
  const w = await populatedWorld(sequentialIds(base), T0);
  const files = new MemoryFileStore();
  const store = await LocalStore.open(w.db, sequentialIds(base + 100_000), clock, files);
  await store.addDocument(
    w.car.id,
    {
      documentId: `00000000-0000-4000-8000-${(base + 999).toString(16).padStart(12, '0')}`,
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
  const user = await userClient(tag);
  const backend = supabaseAccountBackend(user.client);
  await store.connectAccount(backend);
  expect((await store.backupStatus()).pending).toBe(0);
  return { w, files, store, user, backend };
}

async function rowsOf(userId: string): Promise<number> {
  const admin = adminClient();
  let total = 0;
  for (const t of TABLES) {
    const { count, error } = await admin
      .from(t)
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId);
    if (error) throw error;
    total += count ?? 0;
  }
  return total;
}

async function objectsOf(userId: string): Promise<number> {
  const admin = adminClient();
  const { data: folders } = await admin.storage.from('documents').list(userId);
  let n = 0;
  for (const f of folders ?? []) {
    const { data } = await admin.storage.from('documents').list(`${userId}/${f.name}`);
    n += data?.length ?? 0;
  }
  return n;
}

it('deletes every row, every original and the account itself; another user is untouched', async () => {
  const a = await backedUpUser('del-a');
  const b = await backedUpUser('del-b');
  expect(await rowsOf(a.user.userId)).toBeGreaterThan(10);
  expect(await objectsOf(a.user.userId)).toBe(1);
  const bRows = await rowsOf(b.user.userId);
  const token = (await a.user.client.auth.getSession()).data.session!.access_token;

  const r = await a.store.deleteAccount(a.backend);

  expect(r).toEqual({ ok: true });
  expect(await rowsOf(a.user.userId)).toBe(0);
  expect(await objectsOf(a.user.userId)).toBe(0);
  const gone = await adminClient().auth.admin.getUserById(a.user.userId);
  expect(gone.data.user).toBeNull();
  // Device wiped, signed out.
  expect(await a.w.db.first('SELECT id FROM vehicles LIMIT 1')).toBeNull();
  expect(a.files.files.size).toBe(0);
  expect(await a.backend.currentUsername()).toBeNull();
  // Isolation: the other account keeps everything.
  expect(await rowsOf(b.user.userId)).toBe(bRows);
  expect(await objectsOf(b.user.userId)).toBe(1);

  // Idempotent: a retry after a lost response (same, still-valid token) reports success.
  const s = localStatus();
  const again = await fetch(`${s.API_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, apikey: s.ANON_KEY },
  });
  expect(again.status).toBe(200);
  expect(await again.json()).toEqual({ status: 'deleted' });
}, 120000);

it('cannot be triggered without a signed-in user (anon key or no token)', async () => {
  const s = localStatus();
  const anon = await fetch(`${s.API_URL}/functions/v1/delete-account`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${s.ANON_KEY}`, apikey: s.ANON_KEY },
  });
  expect(anon.status).toBe(401);
  const none = await fetch(`${s.API_URL}/functions/v1/delete-account`, { method: 'POST' });
  expect(none.status).toBe(401);
});
