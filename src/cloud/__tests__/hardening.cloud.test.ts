import type { SupabaseClient } from '@supabase/supabase-js';

import { sqlAsUser, userClient, uuid } from '../testing/localStack';

/**
 * P2A database hardening against the real local stack: least privilege, server-authoritative
 * versions, per-op isolation in sync_push, owner-scoped op ledger, input caps and quotas.
 * SQL checks run as the `authenticated` role with a real user's JWT claims (as PostgREST does).
 */

const now = new Date().toISOString();
const meta = { created_at: now, updated_at: now, version: 1 };

let a: { client: SupabaseClient; userId: string };
let b: { client: SupabaseClient; userId: string };
let aProfile: string;
let aVehicle: string;

function vehicleRow(id: string, profileId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    profile_id: profileId,
    type: 'car',
    manufacturer: 'טויוטה',
    model: 'קורולה',
    year: 2019,
    registration: '1234567',
    lifecycle: 'active',
    ...meta,
    ...extra,
  };
}

async function push(sb: SupabaseClient, ops: unknown[]) {
  const r = await sb.rpc('sync_push', { p_ops: ops });
  if (r.error) throw r.error;
  return r.data as { op_id: string; status: string; version?: number; code?: string }[];
}

beforeAll(async () => {
  a = await userClient('p2a-a');
  b = await userClient('p2a-b');
  aProfile = uuid();
  expect((await a.client.from('profiles').insert({ id: aProfile, ...meta })).error).toBeNull();
  aVehicle = uuid();
  expect((await a.client.from('vehicles').insert(vehicleRow(aVehicle, aProfile))).error).toBeNull();
});

describe('least privilege (A1)', () => {
  it('TRUNCATE is denied, even on the caller’s own tables', () => {
    for (const t of ['vehicles', 'documents', 'sync_applied_ops', 'sync_tombstones']) {
      const r = sqlAsUser(a.userId, `truncate public.${t} cascade;`);
      expect(r).toHaveProperty('error');
      expect((r as { error: string }).error).toMatch(/permission denied/);
    }
  });

  it('child rows cannot be deleted or rewritten directly; history is append-only', () => {
    const del = sqlAsUser(a.userId, 'delete from public.odometer_readings;');
    expect((del as { error: string }).error).toMatch(/permission denied/);
    const upd = sqlAsUser(a.userId, "update public.service_events set notes = 'x';");
    expect((upd as { error: string }).error).toMatch(/permission denied/);
  });

  it('another user cannot read, change or delete the rows (RLS at the SQL level)', () => {
    const r = sqlAsUser(
      b.userId,
      `select count(*) from public.vehicles where id = '${aVehicle}';
       update public.vehicles set model = 'x' where id = '${aVehicle}';
       delete from public.vehicles where id = '${aVehicle}';`,
    );
    expect((r as { output: string }).output.split('\n')[0]).toBe('0');
    const still = sqlAsUser(
      a.userId,
      `select model from public.vehicles where id = '${aVehicle}';`,
    );
    expect((still as { output: string }).output).toBe('קורולה');
  });

  it('the operator storage report is not callable by users', async () => {
    const r = await a.client.rpc('storage_usage_report');
    expect(r.error).not.toBeNull();
  });
});

describe('server-authoritative versions (A3)', () => {
  it('an update moves the version by exactly one and keeps created_at, whatever the client sends', async () => {
    const [r] = await push(a.client, [
      {
        op_id: uuid(),
        table: 'vehicles',
        op: 'upsert',
        entity_id: aVehicle,
        base_version: 1,
        row: vehicleRow(aVehicle, aProfile, {
          model: 'קורולה GR',
          version: 999,
          created_at: '2000-01-01T00:00:00Z',
        }),
      },
    ]);
    expect(r).toMatchObject({ status: 'applied', version: 2 });
    const row = await a.client
      .from('vehicles')
      .select('model, version, created_at')
      .eq('id', aVehicle)
      .single();
    expect(row.data).toMatchObject({ model: 'קורולה GR', version: 2 });
    expect(new Date(row.data!.created_at).toISOString()).toBe(new Date(now).toISOString());
  });

  it('a stale base version is a conflict (the row is returned for merging), not an overwrite', async () => {
    const [r] = await push(a.client, [
      {
        op_id: uuid(),
        table: 'vehicles',
        op: 'upsert',
        entity_id: aVehicle,
        base_version: 1,
        row: vehicleRow(aVehicle, aProfile, { model: 'stale' }),
      },
    ]);
    expect(r.status).toBe('conflict');
  });
});

describe('sync_push isolation and caps (Y3, A4)', () => {
  it('one permanently invalid op is reported as invalid; the others in the batch still apply', async () => {
    const ok1 = uuid();
    const ok2 = uuid();
    const results = await push(a.client, [
      {
        op_id: uuid(),
        table: 'vehicles',
        op: 'upsert',
        entity_id: ok1,
        base_version: 0,
        row: vehicleRow(ok1, aProfile),
      },
      {
        op_id: uuid(),
        table: 'vehicles',
        op: 'upsert',
        entity_id: 'x',
        base_version: 0,
        row: vehicleRow(uuid(), aProfile, { year: 3000 }),
      },
      {
        op_id: 'not-a-uuid',
        table: 'vehicles',
        op: 'upsert',
        entity_id: 'x',
        base_version: 0,
        row: vehicleRow(uuid(), aProfile),
      },
      {
        op_id: uuid(),
        table: 'no_such_table',
        op: 'upsert',
        entity_id: 'x',
        base_version: 0,
        row: {},
      },
      {
        op_id: uuid(),
        table: 'vehicles',
        op: 'upsert',
        entity_id: ok2,
        base_version: 0,
        row: vehicleRow(ok2, aProfile),
      },
    ]);
    expect(results.map((r) => r.status)).toEqual([
      'applied',
      'invalid',
      'invalid',
      'invalid',
      'applied',
    ]);
    expect(results[1].code).toBe('23514');
    const rows = await a.client.from('vehicles').select('id').in('id', [ok1, ok2]);
    expect(rows.data).toHaveLength(2);
  });

  it('the op ledger is per owner: another user reusing an op_id is not treated as a duplicate', async () => {
    const opId = uuid();
    const aVeh = uuid();
    expect(
      (
        await push(a.client, [
          {
            op_id: opId,
            table: 'vehicles',
            op: 'upsert',
            entity_id: aVeh,
            base_version: 0,
            row: vehicleRow(aVeh, aProfile),
          },
        ])
      )[0].status,
    ).toBe('applied');
    const bProfile = uuid();
    const bVeh = uuid();
    const [p] = await push(b.client, [
      {
        op_id: uuid(),
        table: 'profiles',
        op: 'upsert',
        entity_id: bProfile,
        base_version: 0,
        row: { id: bProfile, ...meta },
      },
    ]);
    expect(p.status).toBe('applied');
    const [r] = await push(b.client, [
      {
        op_id: opId,
        table: 'vehicles',
        op: 'upsert',
        entity_id: bVeh,
        base_version: 0,
        row: vehicleRow(bVeh, bProfile),
      },
    ]);
    expect(r.status).toBe('applied');
  });

  it('an id held by another account is invalid, never a silent duplicate', async () => {
    const readingId = uuid();
    const row = {
      id: readingId,
      vehicle_id: aVehicle,
      value_km: 1000,
      measured_at: '2026-09-01',
      source: 'user',
      ...meta,
    };
    expect(
      (
        await push(a.client, [
          {
            op_id: uuid(),
            table: 'odometer_readings',
            op: 'upsert',
            entity_id: readingId,
            base_version: 0,
            row,
          },
        ])
      )[0].status,
    ).toBe('applied');
    const [r] = await push(b.client, [
      {
        op_id: uuid(),
        table: 'odometer_readings',
        op: 'upsert',
        entity_id: readingId,
        base_version: 0,
        row,
      },
    ]);
    expect(r.status).toBe('invalid');
  });

  it('rejects oversized batches and adoption bundles', async () => {
    const big = Array.from({ length: 201 }, () => ({ op_id: uuid(), table: 'vehicles' }));
    const r = await a.client.rpc('sync_push', { p_ops: big });
    expect(r.error?.message).toMatch(/at most 200/);
    const adopt = sqlAsUser(
      a.userId,
      `select public.adopt_local_data(jsonb_build_object('alerts',
         (select jsonb_agg(jsonb_build_object('id', gen_random_uuid())) from generate_series(1, 50001))));`,
    );
    expect((adopt as { error: string }).error).toMatch(/exceeds 50000 rows/);
  });
});

describe('document limits and quotas (S2)', () => {
  const doc = (id: string, mime: string, size: number) => ({
    id,
    vehicle_id: aVehicle,
    kind: 'invoice',
    title: 'חשבונית',
    origin: 'user_upload',
    authority: 'garage_document',
    storage_key: `originals/${id}`,
    mime_type: mime,
    size_bytes: size,
    sha256: 'b'.repeat(64),
    ...meta,
  });

  it('images are limited to 15 MB, PDFs to 50 MB', async () => {
    const img = await a.client
      .from('documents')
      .insert(doc(uuid(), 'image/jpeg', 16 * 1024 * 1024));
    expect(img.error).not.toBeNull();
    const pdf = await a.client
      .from('documents')
      .insert(doc(uuid(), 'application/pdf', 40 * 1024 * 1024));
    expect(pdf.error).toBeNull();
    const huge = await a.client
      .from('documents')
      .insert(doc(uuid(), 'application/pdf', 51 * 1024 * 1024));
    expect(huge.error).not.toBeNull();
  });

  it('an account holds at most 500 documents and 1 GiB of originals', () => {
    const fill = (count: number, size: number) => `
      insert into public.documents (id, vehicle_id, kind, title, origin, authority, storage_key,
        mime_type, size_bytes, sha256, created_at, updated_at, version)
      select gen_random_uuid(), '${aVehicle}', 'invoice', 't', 'user_upload', 'garage_document',
             'k', 'application/pdf', ${size}, repeat('c', 64), now(), now(), 1
        from generate_series(1, ${count});`;
    const count = sqlAsUser(a.userId, fill(500, 1));
    expect((count as { error: string }).error).toMatch(/document quota reached/);
    const bytes = sqlAsUser(a.userId, fill(30, 40 * 1024 * 1024));
    expect((bytes as { error: string }).error).toMatch(/storage quota reached/);
  });
});
