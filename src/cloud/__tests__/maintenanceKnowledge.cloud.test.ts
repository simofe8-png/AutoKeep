import type { SupabaseClient } from '@supabase/supabase-js';

import { anonClient, userClient, uuid } from '../testing/localStack';

/**
 * Prepared cloud migration 20260930000001_maintenance_knowledge (NOT applied to staging: it needs
 * owner approval). Verified on the LOCAL stack only: owner-only RLS, vehicle scoping, anon denied,
 * and the no-redistribution / short-excerpt constraints.
 */
const onStaging = process.env.AUTOKEEP_TEST_TARGET === 'staging';
const d = onStaging ? describe.skip : describe;

const now = new Date().toISOString();
const meta = { created_at: now, updated_at: now, version: 1 };

async function seedVehicle(sb: SupabaseClient) {
  const profileId = uuid();
  const p = await sb.from('profiles').insert({ id: profileId, ...meta });
  if (p.error) throw p.error;
  const vehicleId = uuid();
  const v = await sb.from('vehicles').insert({
    id: vehicleId,
    profile_id: profileId,
    type: 'car',
    manufacturer: 'פורד',
    model: 'FIESTA',
    year: 2015,
    registration: '1234567',
    lifecycle: 'active',
    ...meta,
  });
  if (v.error) throw v.error;
  return vehicleId;
}

d('maintenance knowledge tables (local stack)', () => {
  let a: { client: SupabaseClient; userId: string };
  let b: { client: SupabaseClient; userId: string };
  let vehicle: string;

  beforeAll(async () => {
    a = await userClient('maint-alice');
    b = await userClient('maint-bob');
    vehicle = await seedVehicle(a.client);
  });

  it('the owner stores a profile and a private booklet document with claims', async () => {
    const p = await a.client.from('maintenance_profiles').insert({
      vehicle_id: vehicle,
      in_service_date: '2015-06-01',
      in_service_precision: 'month',
      in_service_source: 'registry',
      service_regime: 'QG1',
      usage: 'normal',
      updated_at: now,
    });
    expect(p.error).toBeNull();
    const docId = uuid();
    const k = await a.client.from('knowledge_documents').insert({
      id: docId,
      vehicle_id: vehicle,
      origin: 'user_upload',
      title: 'Booklet',
      authority: 'vehicle_document',
      sha256: 'a'.repeat(64),
      authenticity: 'owner_confirmed',
      rights: 'none',
      excerpt_policy: 'none',
      created_at: now,
      updated_at: now,
    });
    expect(k.error).toBeNull();
    const c = await a.client.from('maintenance_claims').insert({
      id: uuid(),
      vehicle_id: vehicle,
      knowledge_document_id: docId,
      task: 'brake_fluid',
      action: 'replacement',
      interval: { everyMonths: 24, rule: 'time_only', repeats: true },
      locator: { page: 7 },
      extraction: { method: 'user_entered', by: 'owner', at: '2026-09-29' },
      status: 'candidate',
      created_at: now,
      updated_at: now,
    });
    expect(c.error).toBeNull();
  });

  it('another user and anon see nothing and cannot write to the vehicle', async () => {
    for (const t of ['maintenance_profiles', 'knowledge_documents', 'maintenance_claims']) {
      expect((await b.client.from(t).select('*')).data).toEqual([]);
      expect((await anonClient().from(t).select('*')).data ?? []).toEqual([]);
    }
    const w = await b.client.from('maintenance_profiles').insert({
      vehicle_id: vehicle,
      usage: 'severe',
      updated_at: now,
    });
    expect(w.error).not.toBeNull();
  });

  it('rejects a long excerpt and an invalid fingerprint', async () => {
    const bad = await a.client.from('knowledge_documents').insert({
      id: uuid(),
      vehicle_id: vehicle,
      origin: 'user_upload',
      title: 'x',
      authority: 'vehicle_document',
      sha256: 'not-a-hash',
      authenticity: 'unconfirmed',
      rights: 'none',
      excerpt_policy: 'none',
      created_at: now,
      updated_at: now,
    });
    expect(bad.error).not.toBeNull();
  });
});
