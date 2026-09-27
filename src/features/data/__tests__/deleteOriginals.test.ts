import { sequentialIds, T0 } from '@/domain/testing';
import { MemoryAccountBackend, VALID_CODE } from '@/features/account/testing';
import { populatedWorld } from '@/persistence/testing/world';
import { MemoryFileStore } from '@/providers/storage/types';

import { LocalStore, type Clock } from '../localStore';

/**
 * RC (device): a permanent deletion must also remove the vehicle's backed-up originals, and it must
 * do so BEFORE the deletion reaches the server (storage RLS needs the vehicle row). If removing the
 * originals fails, the deletion is not pushed; the next sync retries both.
 */

const clock: Clock = {
  now: () => '2026-09-27T09:00:00.000Z' as never,
  today: () => '2026-09-27' as never,
};

it('originals go first; a failed removal keeps the deletion queued', async () => {
  const w = await populatedWorld(sequentialIds(1), T0);
  const store = await LocalStore.open(w.db, sequentialIds(50_000), clock, new MemoryFileStore());
  await store.addDocument(
    w.car.id,
    {
      documentId: '00000000-0000-4000-8000-0000000d0c01',
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
  await backend.verifyCode('rc@autokeep.test', VALID_CODE);
  await store.connectAccount(backend);
  const prefix = `user:rc@autokeep.test/${w.car.id}/`;
  const carObjects = () => [...backend.objects.keys()].filter((k) => k.startsWith(prefix));
  expect(carObjects()).toHaveLength(1);

  const vehicleDeletes = () =>
    backend.pushed.filter((o) => o.table === 'vehicles' && o.op === 'delete');
  const remove = backend.originals.removeFolder;
  backend.originals.removeFolder = async () => {
    throw new Error('network');
  };
  await store.deleteVehicle(w.car.id);
  await store.sync(backend);
  expect(vehicleDeletes()).toHaveLength(0);
  expect(carObjects()).toHaveLength(1);
  expect((await store.backupStatus()).lastError).toBe('network');

  backend.originals.removeFolder = remove;
  await store.sync(backend);
  expect(carObjects()).toHaveLength(0);
  expect(vehicleDeletes()).toHaveLength(1);
  expect((await store.backupStatus()).lastError).toBeNull();
});
