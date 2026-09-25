import { timestamp } from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';
import { ProfileRepository, ServiceRepository } from '@/persistence';
import { openTestDatabase } from '@/persistence/testing/sqljsDatabase';
import { populatedWorld } from '@/persistence/testing/world';

import {
  adoptLocalData,
  AdoptionCloudError,
  readAdoptionState,
  type AdoptionCloud,
} from '../adoption';
import {
  ADOPTION_TABLES,
  buildAdoptionBundle,
  bundleSize,
  rowKey,
  type AdoptionBundle,
} from '../bundle';
import { accountOfferDecision, OFFER_SNOOZE_DAYS } from '../offer';

/** In-memory cloud double that behaves like the RPC (atomic, idempotent) with switchable faults. */
function fakeCloud(
  opts: { user?: string | null; fail?: 'network' | 'server_rejected' | 'drop_rows' } = {},
) {
  const stored = new Map<string, Set<string>>();
  let fault = opts.fail;
  const cloud: AdoptionCloud & { setFault(f?: typeof fault): void; stored: typeof stored } = {
    stored,
    setFault: (f) => {
      fault = f;
    },
    currentUserId: async () => (opts.user === undefined ? 'user-a' : opts.user),
    adopt: async (bundle: AdoptionBundle) => {
      if (fault === 'network') throw new AdoptionCloudError('network', 'offline');
      if (fault === 'server_rejected')
        throw new AdoptionCloudError('server_rejected', 'constraint');
      const counts: Record<string, number> = {};
      for (const t of ADOPTION_TABLES) {
        const set = stored.get(t) ?? new Set<string>();
        const before = set.size;
        // A faulty server "loses" rows of one table to exercise read-back verification.
        if (!(fault === 'drop_rows' && t === 'service_actions')) {
          for (const r of bundle[t]) set.add(rowKey(t, r));
        }
        stored.set(t, set);
        counts[t] = set.size - before;
      }
      return counts;
    },
    existingKeys: async (t) => stored.get(t) ?? new Set(),
  };
  return cloud;
}

const clock = () => T0;

describe('local identity (T067)', () => {
  it('all local data belongs to the device profile; nothing marked as account data before adoption', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    const profile = await new ProfileRepository(w.db).getOrCreate(sequentialIds(999), T0);
    expect(profile.id).toBe(w.profile.id);
    expect(profile.accountUserId).toBeNull();
    expect((await readAdoptionState(w.db)).status).toBe('none');
  });

  it('builds a complete cloud-shaped bundle without device-only settings', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    const b = await buildAdoptionBundle(w.db);
    expect(b.vehicles).toHaveLength(2);
    expect(b.service_actions.every((a) => typeof a.performed === 'boolean')).toBe(true);
    expect(b.vehicles[0]).toHaveProperty('profile_id');
    expect(b.alerts[0].basis).toEqual(expect.objectContaining({ facts: { remainingKm: 5750 } }));
    expect(Object.keys(b)).not.toContain('settings');
    expect(bundleSize(b)).toBeGreaterThan(15);
  });
});

describe('transactional adoption with recovery (T069/T070)', () => {
  it('adopts, verifies by read-back, then links the profile to the account', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    const cloud = fakeCloud();
    const r = await adoptLocalData(w.db, cloud, w.profile.id, clock);
    expect(r.ok).toBe(true);
    expect(r.state).toMatchObject({ status: 'adopted', accountUserId: 'user-a', attempts: 1 });
    expect(
      (await new ProfileRepository(w.db).getOrCreate(sequentialIds(999), T0)).accountUserId,
    ).toBe('user-a');
  });

  it('not signed in: nothing is sent and local data is untouched', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    const cloud = fakeCloud({ user: null });
    const r = await adoptLocalData(w.db, cloud, w.profile.id, clock);
    expect(r).toMatchObject({ ok: false, failure: 'not_signed_in' });
    expect(cloud.stored.size).toBe(0);
  });

  it('network failure keeps "pending" and loses nothing; a later retry completes (idempotent)', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    const before = await buildAdoptionBundle(w.db);
    const cloud = fakeCloud({ fail: 'network' });
    const first = await adoptLocalData(w.db, cloud, w.profile.id, clock);
    expect(first).toMatchObject({ ok: false, failure: 'network', state: { status: 'pending' } });
    // Restart: state survives, local data is byte-for-byte the same.
    const reopened = await openTestDatabase(w.db.export());
    expect((await readAdoptionState(reopened)).status).toBe('pending');
    expect(await buildAdoptionBundle(reopened)).toEqual(before);

    cloud.setFault(undefined);
    const retry = await adoptLocalData(reopened, cloud, w.profile.id, () =>
      timestamp('2026-09-26T00:00:00.000Z'),
    );
    expect(retry.ok && retry.state.attempts).toBe(2);
    // Retrying again uploads nothing new.
    const again = await adoptLocalData(reopened, cloud, w.profile.id, clock);
    expect(again.ok && Object.values(again.inserted).every((n) => n === 0)).toBe(true);
  });

  it('a server that silently drops rows is caught by read-back verification', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    const r = await adoptLocalData(w.db, fakeCloud({ fail: 'drop_rows' }), w.profile.id, clock);
    expect(r).toMatchObject({
      ok: false,
      failure: 'verification_mismatch',
      state: { status: 'pending' },
    });
    expect(
      (await new ProfileRepository(w.db).getOrCreate(sequentialIds(999), T0)).accountUserId,
    ).toBeNull();
  });

  it('refuses to merge this device into a different account than the one it started with', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    await adoptLocalData(w.db, fakeCloud({ user: 'user-a' }), w.profile.id, clock);
    const other = fakeCloud({ user: 'user-b' });
    const r = await adoptLocalData(w.db, other, w.profile.id, clock);
    expect(r).toMatchObject({ ok: false, failure: 'different_account' });
    expect(other.stored.size).toBe(0);
  });

  it('adoption never deletes or rewrites local history', async () => {
    const w = await populatedWorld(sequentialIds(), T0);
    const history = await new ServiceRepository(w.db).list(w.car.id);
    await adoptLocalData(w.db, fakeCloud(), w.profile.id, clock);
    expect(await new ServiceRepository(w.db).list(w.car.id)).toEqual(history);
  });
});

describe('delayed account offer (T068)', () => {
  const base = {
    vehicleCount: 1,
    serviceEventCount: 0,
    documentCount: 0,
    hasAccount: false,
    dismissedAt: null,
    now: T0,
  };

  it('is not offered on first use or with a vehicle alone', () => {
    expect(accountOfferDecision({ ...base, vehicleCount: 0 })).toMatchObject({
      show: false,
      reason: 'no_valuable_data',
    });
    expect(accountOfferDecision(base)).toMatchObject({ show: false, reason: 'no_valuable_data' });
  });

  it('is offered once history or documents exist, and respects "not now"', () => {
    expect(accountOfferDecision({ ...base, serviceEventCount: 1 })).toEqual({ show: true });
    const snoozed = accountOfferDecision({ ...base, documentCount: 1, dismissedAt: T0 });
    expect(snoozed).toMatchObject({ show: false, reason: 'snoozed' });
    const later = timestamp(
      `2026-10-${String(9 + OFFER_SNOOZE_DAYS).padStart(2, '0')}T00:00:00.000Z`,
    );
    expect(
      accountOfferDecision({ ...base, documentCount: 1, dismissedAt: T0, now: later }),
    ).toEqual({ show: true });
    expect(accountOfferDecision({ ...base, serviceEventCount: 3, hasAccount: true })).toMatchObject(
      { reason: 'has_account' },
    );
  });
});
