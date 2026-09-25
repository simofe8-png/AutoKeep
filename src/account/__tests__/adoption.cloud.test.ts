import type { Id, IdGenerator } from '@/domain';
import { T0 } from '@/domain/testing';
import { populatedWorld } from '@/persistence/testing/world';
import { userClient } from '@/cloud/testing/localStack';

import { adoptLocalData, readAdoptionState } from '../adoption';
import { ADOPTION_TABLES, buildAdoptionBundle } from '../bundle';
import { supabaseAdoptionCloud } from '../cloudAdoption';

/** Fresh random ids per run: the local cloud DB persists between test runs. */
const randomIds: IdGenerator = {
  next: <Tag extends string>() => globalThis.crypto.randomUUID() as Id<Tag>,
};
const clock = () => T0;

describe('M08 no-data-loss adoption against the local Supabase stack (T071)', () => {
  it('uploads every local row intact, links the profile, and is idempotent', async () => {
    const w = await populatedWorld(randomIds, T0);
    const user = await userClient('adopt');
    const cloud = supabaseAdoptionCloud(user.client);

    const r = await adoptLocalData(w.db, cloud, w.profile.id, clock);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const bundle = await buildAdoptionBundle(w.db);
    for (const t of ADOPTION_TABLES)
      expect({ t, n: r.inserted[t] }).toEqual({ t, n: bundle[t].length });

    // Field-level comparison for representative tables.
    const { data: vehicles } = await user.client.from('vehicles').select('*').order('created_at');
    expect(vehicles?.map((v) => [v.id, v.registration, v.vin, v.owner_id])).toEqual(
      bundle.vehicles.map((v) => [v.id, v.registration, v.vin, user.userId]),
    );
    const { data: actions } = await user.client
      .from('service_actions')
      .select('id, performed, action_type, unlisted');
    expect(
      new Set(actions?.map((a) => `${a.id}:${a.performed}:${a.action_type}:${a.unlisted}`)),
    ).toEqual(
      new Set(
        bundle.service_actions.map((a) => `${a.id}:${a.performed}:${a.action_type}:${a.unlisted}`),
      ),
    );
    const { data: alerts } = await user.client.from('alerts').select('basis');
    expect(alerts?.[0].basis).toEqual(bundle.alerts[0].basis);

    const again = await adoptLocalData(w.db, cloud, w.profile.id, clock);
    expect(again.ok && Object.values(again.inserted).every((n) => n === 0)).toBe(true);
    expect((await readAdoptionState(w.db)).status).toBe('adopted');
  });

  it('is all-or-nothing: one invalid row rolls back the entire bundle', async () => {
    const w = await populatedWorld(randomIds, T0);
    // Corrupt one service event locally (odometer beyond the cloud CHECK constraint).
    await w.db.run('UPDATE service_events SET odometer_km = 9999999 WHERE vehicle_id = ?', [
      w.moto.id,
    ]);
    const user = await userClient('atomic');
    const r = await adoptLocalData(w.db, supabaseAdoptionCloud(user.client), w.profile.id, clock);
    expect(r).toMatchObject({
      ok: false,
      failure: 'server_rejected',
      state: { status: 'pending' },
    });
    for (const t of ['profiles', 'vehicles', 'service_events', 'documents'] as const) {
      const { data } = await user.client.from(t).select('*');
      expect({ t, rows: data?.length }).toEqual({ t, rows: 0 });
    }
  });

  it('adopted data is invisible to other users', async () => {
    const w = await populatedWorld(randomIds, T0);
    const owner = await userClient('owner');
    await adoptLocalData(w.db, supabaseAdoptionCloud(owner.client), w.profile.id, clock);
    const stranger = await userClient('stranger');
    for (const t of ADOPTION_TABLES) {
      const { data } = await stranger.client.from(t).select('*');
      expect({ t, rows: data?.length ?? 0 }).toEqual({ t, rows: 0 });
    }
  });

  it('a hostile id collision cannot hijack or silently drop data: adoption stays pending', async () => {
    const w = await populatedWorld(randomIds, T0);
    const bundle = await buildAdoptionBundle(w.db);
    const attacker = await userClient('attacker');
    // Attacker pre-inserts a profile row with the victim's profile id.
    await attacker.client.from('profiles').insert({ ...bundle.profiles[0] });
    const victim = await userClient('victim');
    const r = await adoptLocalData(w.db, supabaseAdoptionCloud(victim.client), w.profile.id, clock);
    expect(r.ok).toBe(false);
    expect(r.state.status).toBe('pending');
    // Nothing of the victim leaked to the attacker.
    const { data } = await attacker.client.from('vehicles').select('*');
    expect(data).toEqual([]);
  });
});
