import type { SupabaseClient } from '@supabase/supabase-js';

import { adminClient, anonClient, userClient, uuid } from '../testing/localStack';

/**
 * Prepared migrations 20260930000001 (owner-scoped claim FK, M-SOURCE review) and 20260930000003
 * (source registry, policy versions, document versions, review state) — NOT applied to staging.
 * Verified on the LOCAL stack only. SYNTHETIC rows, removed afterwards.
 */
const onStaging = process.env.AUTOKEEP_TEST_TARGET === 'staging';
const d = onStaging ? describe.skip : describe;
const now = new Date().toISOString();
const meta = { created_at: now, updated_at: now, version: 1 };
const DIMS = [
  'discoveryAllowed',
  'automatedFetchAllowed',
  'automatedExtractionAllowed',
  'documentCachingAllowed',
  'structuredFactsStorageAllowed',
  'documentRedistributionAllowed',
];
const unknownPolicy = Object.fromEntries(DIMS.map((k) => [k, { value: 'UNKNOWN', basis: [] }]));

d('source registry tables (local stack)', () => {
  const admin = adminClient();
  const sid = `global-synthetic-${uuid().slice(0, 8)}`;
  let user: { client: SupabaseClient; userId: string };

  beforeAll(async () => {
    user = await userClient('msource-reader');
    const s = await admin.from('maintenance_source_systems').insert({
      source_system_id: sid,
      manufacturers: ['synthmoto'],
      market: 'GLOBAL',
      origin: 'global',
      source_type: 'B_DIGITAL_MANUAL',
      authority_class: 'manufacturer_library',
      status: 'proposed',
      record: { note: 'synthetic' },
    });
    if (s.error) throw s.error;
  });

  afterAll(async () => {
    await admin.from('maintenance_knowledge_catalog').delete().like('id', 'synthetic-%');
    await admin.from('maintenance_document_versions').delete().eq('source_system_id', sid);
    // Policy versions are append-only (trigger): the synthetic system keeps its audit rows.
  });

  it('policy versions: six valid dimensions required; history is append-only', async () => {
    const v1 = await admin.from('maintenance_source_policy_versions').insert({
      source_system_id: sid,
      version: 1,
      reviewed_at: '2026-09-30',
      dimensions: unknownPolicy,
    });
    expect(v1.error).toBeNull();
    const missing = await admin.from('maintenance_source_policy_versions').insert({
      source_system_id: sid,
      version: 2,
      reviewed_at: '2026-09-30',
      dimensions: { discoveryAllowed: { value: 'ALLOWED' } },
    });
    expect(missing.error?.message).toMatch(/six_dimensions/);
    const bad = await admin.from('maintenance_source_policy_versions').insert({
      source_system_id: sid,
      version: 2,
      reviewed_at: '2026-09-30',
      dimensions: { ...unknownPolicy, discoveryAllowed: { value: 'MAYBE' } },
    });
    expect(bad.error?.message).toMatch(/six_dimensions/);
    const rewrite = await admin
      .from('maintenance_source_policy_versions')
      .update({ reviewed_at: '2026-10-01' })
      .eq('source_system_id', sid);
    expect(rewrite.error?.message).toMatch(/append-only/);
    const erase = await admin
      .from('maintenance_source_policy_versions')
      .delete()
      .eq('source_system_id', sid);
    expect(erase.error?.message).toMatch(/append-only/);
  });

  it('document versions: unique per document and hash; catalog links a version; review needs role + date', async () => {
    const dv = await admin
      .from('maintenance_document_versions')
      .insert({
        source_system_id: sid,
        document_key: `${sid}|https://synthetic.example/m.pdf`,
        url: 'https://synthetic.example/m.pdf',
        sha256: 'a'.repeat(64),
        version: 1,
        first_seen_at: '2026-09-30',
        last_seen_at: '2026-09-30',
      })
      .select('id')
      .single();
    expect(dv.error).toBeNull();
    const dup = await admin.from('maintenance_document_versions').insert({
      source_system_id: sid,
      document_key: `${sid}|https://synthetic.example/m.pdf`,
      url: 'https://synthetic.example/m.pdf',
      sha256: 'a'.repeat(64),
      version: 2,
      first_seen_at: '2026-09-30',
      last_seen_at: '2026-09-30',
    });
    expect(dup.error).not.toBeNull();
    const row = {
      id: 'synthetic-catalog-1',
      scope_key: '{"makes":["synthmoto"]}',
      task: 'engine_oil',
      action: 'replacement',
      requirement: {},
      source_url: 'https://synthetic.example/m.pdf',
      source_host: 'synthetic.example',
      source_sha256: 'a'.repeat(64),
      source: {},
      verified_at: '2026-09-30',
      document_version_id: dv.data!.id,
      source_system_id: sid,
    };
    expect(
      (
        await admin
          .from('maintenance_knowledge_catalog')
          .insert({ ...row, review_decision: 'APPROVE' })
      ).error?.message,
    ).toMatch(/review_complete/);
    expect(
      (
        await admin.from('maintenance_knowledge_catalog').insert({
          ...row,
          review_decision: 'APPROVE',
          reviewed_by_role: 'owner',
          reviewed_at: '2026-09-30',
        })
      ).error,
    ).not.toBeNull();
    expect(
      (
        await admin.from('maintenance_knowledge_catalog').insert({
          ...row,
          review_decision: 'APPROVE',
          reviewed_by_role: 'curator',
          reviewed_at: '2026-09-30',
        })
      ).error,
    ).toBeNull();
  });

  it('signed-in users read, never write; anon has no access', async () => {
    for (const t of [
      'maintenance_source_systems',
      'maintenance_source_policy_versions',
      'maintenance_document_versions',
    ]) {
      expect((await user.client.from(t).select('*').limit(1)).error).toBeNull();
      expect((await anonClient().from(t).select('*')).data ?? []).toEqual([]);
    }
    const w = await user.client.from('maintenance_source_systems').insert({
      source_system_id: 'global-x',
      manufacturers: ['x'],
      market: 'GLOBAL',
      origin: 'global',
      source_type: 'B_DIGITAL_MANUAL',
      authority_class: 'manufacturer',
      status: 'approved',
      record: {},
    });
    expect(w.error).not.toBeNull();
  });

  it('an Israeli system must be official for IL, and a global one cannot claim IL', async () => {
    const bad = await admin.from('maintenance_source_systems').insert({
      source_system_id: `global-bad-${uuid().slice(0, 6)}`,
      manufacturers: ['x'],
      market: 'IL',
      origin: 'global',
      source_type: 'B_DIGITAL_MANUAL',
      authority_class: 'manufacturer',
      status: 'proposed',
      record: {},
    });
    expect(bad.error?.message).toMatch(/israeli_market/);
  });
});

d('owner-scoped claim documents (20260930000001 review fix)', () => {
  it('a claim cannot cite another owner’s document', async () => {
    const a = await userClient('msource-alice');
    const b = await userClient('msource-bob');
    const seed = async (sb: SupabaseClient) => {
      const profileId = uuid();
      expect((await sb.from('profiles').insert({ id: profileId, ...meta })).error).toBeNull();
      const vehicleId = uuid();
      expect(
        (
          await sb.from('vehicles').insert({
            id: vehicleId,
            profile_id: profileId,
            type: 'car',
            manufacturer: 'SYNTHETIC',
            model: 'X',
            year: 2020,
            registration: '7654321',
            lifecycle: 'active',
            ...meta,
          })
        ).error,
      ).toBeNull();
      return vehicleId;
    };
    const va = await seed(a.client);
    const vb = await seed(b.client);
    const docA = uuid();
    expect(
      (
        await a.client.from('knowledge_documents').insert({
          id: docA,
          vehicle_id: va,
          origin: 'user_upload',
          title: 'A',
          authority: 'vehicle_document',
          sha256: 'b'.repeat(64),
          authenticity: 'unconfirmed',
          rights: 'none',
          excerpt_policy: 'none',
          created_at: now,
          updated_at: now,
        })
      ).error,
    ).toBeNull();
    const steal = await b.client.from('maintenance_claims').insert({
      id: uuid(),
      vehicle_id: vb,
      knowledge_document_id: docA,
      task: 'engine_oil',
      action: 'replacement',
      interval: {},
      locator: {},
      extraction: {},
      status: 'candidate',
      created_at: now,
      updated_at: now,
    });
    expect(steal.error).not.toBeNull();
  });
});
