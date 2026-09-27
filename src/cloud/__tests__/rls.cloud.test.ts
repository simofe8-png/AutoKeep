import type { SupabaseClient } from '@supabase/supabase-js';

import { anonClient, userClient, uuid } from '../testing/localStack';

/**
 * M07 T061/T062/T063/T064 — authorization tests against the real local stack (Postgres + RLS +
 * PostgREST + Storage). Two real users; every cross-user attempt must be denied.
 */

const now = new Date().toISOString();
const meta = { created_at: now, updated_at: now, version: 1 };

async function seedVehicle(sb: SupabaseClient, registration = '1234567') {
  const profileId = uuid();
  const p = await sb.from('profiles').insert({ id: profileId, ...meta });
  if (p.error) throw p.error;
  const vehicleId = uuid();
  const v = await sb.from('vehicles').insert({
    id: vehicleId,
    profile_id: profileId,
    type: 'car',
    manufacturer: 'טויוטה',
    model: 'קורולה',
    year: 2019,
    registration,
    lifecycle: 'active',
    ...meta,
  });
  if (v.error) throw v.error;
  return vehicleId;
}

let a: { client: SupabaseClient; userId: string };
let b: { client: SupabaseClient; userId: string };
let aVehicle: string;

beforeAll(async () => {
  a = await userClient('alice');
  b = await userClient('bob');
  aVehicle = await seedVehicle(a.client);
});

describe('anonymous access', () => {
  it('cannot read or write any table', async () => {
    const anon = anonClient();
    const read = await anon.from('vehicles').select('*');
    expect(read.data ?? []).toEqual([]);
    const write = await anon.from('vehicles').insert({ id: uuid(), type: 'car' });
    expect(write.error).not.toBeNull();
  });
});

describe('row ownership (BOLA / IDOR)', () => {
  it('a user sees only their own vehicles', async () => {
    const mine = await a.client.from('vehicles').select('id');
    expect(mine.data?.map((r) => r.id)).toEqual([aVehicle]);
    const theirs = await b.client.from('vehicles').select('id').eq('id', aVehicle);
    expect(theirs.data).toEqual([]);
  });

  it("cannot update or delete another user's vehicle by id", async () => {
    const upd = await b.client
      .from('vehicles')
      .update({ model: 'hacked' })
      .eq('id', aVehicle)
      .select();
    expect(upd.data ?? []).toEqual([]);
    const del = await b.client.from('vehicles').delete().eq('id', aVehicle).select();
    expect(del.data ?? []).toEqual([]);
    const still = await a.client.from('vehicles').select('model').eq('id', aVehicle).single();
    expect(still.data?.model).toBe('קורולה');
  });

  it("cannot attach records to another user's vehicle (client-supplied vehicle_id)", async () => {
    const r = await b.client.from('service_events').insert({
      id: uuid(),
      vehicle_id: aVehicle,
      date: '2026-09-20',
      odometer_km: 1000,
      origin: 'manual',
      authority: 'user_report',
      verification: { state: 'unverified' },
      confirmed_at: now,
      ...meta,
    });
    expect(r.error).not.toBeNull();
    const count = await a.client.from('service_events').select('id').eq('vehicle_id', aVehicle);
    expect(count.data).toEqual([]);
  });

  it('cannot forge owner_id on insert', async () => {
    const r = await b.client.from('profiles').insert({ id: uuid(), owner_id: a.userId, ...meta });
    expect(r.error).not.toBeNull();
  });

  it('owner_id is immutable even for the owner', async () => {
    const r = await a.client
      .from('vehicles')
      .update({ owner_id: b.userId })
      .eq('id', aVehicle)
      .select();
    expect(r.error).not.toBeNull();
  });

  it('a vehicle deletion pushed by another user is rejected and leaves no tombstone', async () => {
    const r = await b.client.rpc('sync_push', {
      p_ops: [
        { op_id: uuid(), table: 'vehicles', op: 'delete', entity_id: aVehicle, base_version: 1 },
      ],
    });
    expect(r.data?.[0]?.status).toBe('rejected');
    const still = await a.client.from('vehicles').select('id').eq('id', aVehicle);
    expect(still.data).toHaveLength(1);
    const stones = await b.client.from('sync_tombstones').select('entity_id');
    expect(stones.data ?? []).toEqual([]);
  });

  it('the removed bypass deletion RPCs no longer exist', async () => {
    const del = await a.client.rpc('delete_vehicle_permanently', { p_vehicle_id: aVehicle });
    expect(del.error).not.toBeNull();
    const still = await a.client.from('vehicles').select('id').eq('id', aVehicle);
    expect(still.data).toHaveLength(1);
  });
});

describe('private document storage (T062)', () => {
  const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // "%PDF-1.4"

  /** P2A: an object may only be stored for a document row the caller owns (synced first). */
  async function seedDocument(sb: SupabaseClient, vehicleId: string): Promise<string> {
    const id = uuid();
    const r = await sb.from('documents').insert({
      id,
      vehicle_id: vehicleId,
      kind: 'invoice',
      title: 'חשבונית',
      origin: 'user_upload',
      authority: 'garage_document',
      storage_key: `originals/${id}.pdf`,
      mime_type: 'application/pdf',
      size_bytes: pdf.length,
      sha256: 'a'.repeat(64),
      ...meta,
    });
    if (r.error) throw r.error;
    return id;
  }

  it('owner can upload under their own vehicle path and get a short-lived signed URL', async () => {
    const path = `${a.userId}/${aVehicle}/${await seedDocument(a.client, aVehicle)}`;
    const up = await a.client.storage
      .from('documents')
      .upload(path, pdf, { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    const signed = await a.client.storage.from('documents').createSignedUrl(path, 60);
    expect(signed.data?.signedUrl).toMatch(/token=/);
    // The bucket is private: the public URL does not serve the object.
    const publicUrl = a.client.storage.from('documents').getPublicUrl(path).data.publicUrl;
    const res = await fetch(publicUrl);
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('another user cannot read, sign, list or overwrite it', async () => {
    const path = `${a.userId}/${aVehicle}/${await seedDocument(a.client, aVehicle)}`;
    const up = await a.client.storage
      .from('documents')
      .upload(path, pdf, { contentType: 'application/pdf' });
    expect(up.error).toBeNull();
    const dl = await b.client.storage.from('documents').download(path);
    expect(dl.error).not.toBeNull();
    const signed = await b.client.storage.from('documents').createSignedUrl(path, 60);
    expect(signed.error).not.toBeNull();
    const list = await b.client.storage.from('documents').list(`${a.userId}/${aVehicle}`);
    expect(list.data ?? []).toEqual([]);
    const overwrite = await b.client.storage
      .from('documents')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    expect(overwrite.error).not.toBeNull();
  });

  it("cannot upload into another user's folder or a vehicle they do not own", async () => {
    const intoA = await b.client.storage
      .from('documents')
      .upload(`${a.userId}/${aVehicle}/${uuid()}`, pdf, { contentType: 'application/pdf' });
    expect(intoA.error).not.toBeNull();
    const ownFolderForeignVehicle = await b.client.storage
      .from('documents')
      .upload(`${b.userId}/${aVehicle}/${uuid()}`, pdf, { contentType: 'application/pdf' });
    expect(ownFolderForeignVehicle.error).not.toBeNull();
  });

  it('without an owned document row, nothing can be stored (no free-form uploads)', async () => {
    const r = await a.client.storage
      .from('documents')
      .upload(`${a.userId}/${aVehicle}/${uuid()}`, pdf, { contentType: 'application/pdf' });
    expect(r.error).not.toBeNull();
    const deeper = await a.client.storage
      .from('documents')
      .upload(`${a.userId}/${aVehicle}/x/${await seedDocument(a.client, aVehicle)}`, pdf, {
        contentType: 'application/pdf',
      });
    expect(deeper.error).not.toBeNull();
  });

  it('a stored original is never overwritten, not even by its owner', async () => {
    const path = `${a.userId}/${aVehicle}/${await seedDocument(a.client, aVehicle)}`;
    expect(
      (
        await a.client.storage
          .from('documents')
          .upload(path, pdf, { contentType: 'application/pdf' })
      ).error,
    ).toBeNull();
    const again = await a.client.storage
      .from('documents')
      .upload(path, new Uint8Array([1, 2, 3]), { contentType: 'application/pdf', upsert: true });
    expect(again.error).not.toBeNull();
  });

  it('rejects disallowed content types', async () => {
    const r = await a.client.storage
      .from('documents')
      .upload(
        `${a.userId}/${aVehicle}/${await seedDocument(a.client, aVehicle)}`,
        new Uint8Array([60, 104, 116, 109, 108, 62]),
        {
          contentType: 'text/html',
        },
      );
    expect(r.error).not.toBeNull();
  });
});
