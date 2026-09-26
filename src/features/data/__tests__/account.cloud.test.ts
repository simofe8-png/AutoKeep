import { isoDate, type IsoDate, type Timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { userClient } from '@/cloud/testing/localStack';
import { supabaseAccountBackend } from '@/features/account/backend';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

import { LocalStore, type Clock } from '../localStore';

/**
 * M19 against the LOCAL Supabase stack: the app's store adopts a device's data into a real
 * account (RLS-scoped), then syncs a later local change — the same code path the account screen
 * runs. Auth is signed in directly (the OTP step itself is covered by the account UI tests).
 */

const clock: Clock = {
  now: () => new Date().toISOString() as Timestamp,
  today: () => isoDate(new Date().toISOString().slice(0, 10)) as IsoDate,
};

describe('LocalStore account backup (local Supabase)', () => {
  it('adopts the device data into the account and syncs a later change', async () => {
    // Unique ids per run: the local stack keeps earlier runs' rows (owned by other test users),
    // and adoption rightly refuses ids that already belong to someone else.
    const base = Math.floor(Math.random() * 2 ** 40);
    const w = await populatedWorld(sequentialIds(base), T0);
    const store = await LocalStore.open(w.db, sequentialIds(base + 100_000), clock);
    const user = await userClient('m19');
    const backend = supabaseAccountBackend(user.client);

    await store.connectAccount(backend);
    let status = await store.backupStatus();
    expect(status).toMatchObject({ adoption: 'adopted', pending: 0, lastError: null });
    expect(status.lastSyncAt).not.toBeNull();

    const { data: vehicles } = await user.client.from('vehicles').select('id');
    expect(new Set(vehicles?.map((v) => v.id))).toEqual(new Set([w.car.id, w.moto.id]));

    // A later local change (through the domain) is queued, then pushed by the next sync.
    await store.updateOdometer(w.car.id, 99_000, clock.today());
    expect((await store.backupStatus()).pending).toBeGreaterThan(0);
    await store.sync(backend);
    status = await store.backupStatus();
    expect(status).toMatchObject({ pending: 0, lastError: null });

    const { data: readings } = await user.client
      .from('odometer_readings')
      .select('value_km')
      .eq('vehicle_id', w.car.id);
    expect(readings?.map((r) => r.value_km)).toContain(99_000);

    // Another account sees none of it (RLS).
    const other = await userClient('m19-other');
    const { data: foreign } = await other.client.from('vehicles').select('id');
    expect(foreign).toEqual([]);
  });

  it('document originals: backed up privately, restored and re-verified on a second device (T162)', async () => {
    const base = Math.floor(Math.random() * 2 ** 40);
    const w = await populatedWorld(sequentialIds(base), T0);
    const filesA = new MemoryFileStore();
    const storeA = await LocalStore.open(w.db, sequentialIds(base + 100_000), clock, filesA);
    const docId = `00000000-0000-4000-8000-${(base + 999).toString(16).padStart(12, '0')}`;
    await storeA.addDocument(
      w.car.id,
      {
        documentId: docId,
        file: {
          uri: 'file:///cache/manual.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 9,
          source: 'file',
        },
        title: 'ספר בעלים',
      },
      'owners_manual',
    );
    const user = await userClient('m22');
    const backendA = supabaseAccountBackend(user.client);
    await storeA.connectAccount(backendA);
    expect((await storeA.backupStatus()).pending).toBe(0);

    // Device B: empty, same account → rows arrive by sync, the original on demand.
    const dbB = await openTestDatabase();
    const filesB = new MemoryFileStore();
    const storeB = await LocalStore.open(dbB, sequentialIds(base + 200_000), clock, filesB);
    const backendB = supabaseAccountBackend(await user.signInAgain());
    await storeB.connectAccount(backendB);
    const restored = await storeB.original(w.car.id, docId, backendB);
    expect(restored?.integrity).toBe('intact');

    // Another user can neither read the object nor restore it.
    const other = await userClient('m22-other');
    const { data: foreign } = await other.client.storage
      .from('documents')
      .createSignedUrl(`${user.userId}/${w.car.id}/${docId}`, 60);
    expect(foreign?.signedUrl ?? null).toBeNull();
  });
});
