import type { ProfileId, Timestamp } from '@/domain';
import { SettingsRepository, type SqlDatabase } from '@/persistence';

import {
  ADOPTION_TABLES,
  buildAdoptionBundle,
  bundleSize,
  rowKey,
  type AdoptionBundle,
  type AdoptionTable,
} from './bundle';
import { writeShadow } from '@/sync/engine';
import { toLocalRow } from '@/sync/mapping';

/**
 * Local identity strategy (T067) and transactional local→account adoption (T069) with recovery
 * (T070).
 *
 * - Before any account, all data belongs to the device-local profile. Nothing leaves the device.
 * - Adoption uploads a snapshot in ONE server transaction (RPC adopt_local_data). It is marked
 *   complete locally only after every row is read back from the cloud. Local data is never
 *   deleted or modified by adoption, so a failure at any step loses nothing.
 * - State is persisted, so an adoption interrupted by a crash, restart, network loss or expired
 *   session resumes safely (the RPC is idempotent).
 */

export type AdoptionStatus = 'none' | 'pending' | 'adopted';

export interface AdoptionState {
  status: AdoptionStatus;
  accountUserId: string | null;
  attempts: number;
  lastError: AdoptionFailure | null;
  startedAt: Timestamp | null;
  completedAt: Timestamp | null;
  rowCount: number;
}

export type AdoptionFailure =
  'not_signed_in' | 'different_account' | 'network' | 'server_rejected' | 'verification_mismatch';

export const INITIAL_ADOPTION_STATE: AdoptionState = {
  status: 'none',
  accountUserId: null,
  attempts: 0,
  lastError: null,
  startedAt: null,
  completedAt: null,
  rowCount: 0,
};

const STATE_KEY = 'accountAdoption';

/** Cloud port (Supabase implementation in cloudAdoption.ts; fakes in tests). */
export interface AdoptionCloud {
  currentUserId(): Promise<string | null>;
  /** Inserts the bundle atomically; returns inserted counts. Throws AdoptionCloudError. */
  adopt(bundle: AdoptionBundle): Promise<Record<string, number>>;
  /** Keys (see rowKey) of rows that exist and are visible to the caller. */
  existingKeys(table: AdoptionTable, rows: AdoptionBundle[AdoptionTable]): Promise<Set<string>>;
}

export class AdoptionCloudError extends Error {
  constructor(
    readonly kind: 'network' | 'server_rejected' | 'not_signed_in',
    message: string,
  ) {
    super(message);
  }
}

export async function readAdoptionState(db: SqlDatabase): Promise<AdoptionState> {
  return (await new SettingsRepository(db).get<AdoptionState>(STATE_KEY)) ?? INITIAL_ADOPTION_STATE;
}

async function writeState(db: SqlDatabase, s: AdoptionState, now: Timestamp) {
  await new SettingsRepository(db).set(STATE_KEY, s, now);
}

export type AdoptionOutcome =
  | { ok: true; state: AdoptionState; inserted: Record<string, number> }
  | { ok: false; state: AdoptionState; failure: AdoptionFailure };

export async function adoptLocalData(
  db: SqlDatabase,
  cloud: AdoptionCloud,
  profileId: ProfileId,
  now: () => Timestamp,
): Promise<AdoptionOutcome> {
  const prior = await readAdoptionState(db);
  const userId = await cloud.currentUserId().catch(() => null);

  const fail = async (failure: AdoptionFailure, base: AdoptionState): Promise<AdoptionOutcome> => {
    const state: AdoptionState = { ...base, lastError: failure };
    await writeState(db, state, now());
    return { ok: false, state, failure };
  };

  if (!userId) return fail('not_signed_in', prior);
  // Never merge one device's data into two different accounts.
  if (prior.accountUserId && prior.accountUserId !== userId)
    return fail('different_account', prior);

  const pending: AdoptionState = {
    ...prior,
    status: prior.status === 'adopted' ? 'adopted' : 'pending',
    accountUserId: userId,
    attempts: prior.attempts + 1,
    lastError: null,
    startedAt: prior.startedAt ?? now(),
  };
  await writeState(db, pending, now());

  // High-water mark of the sync outbox at snapshot time (changes after it remain queued).
  const outboxMark =
    (await db.first<{ m: number | null }>('SELECT MAX(seq) AS m FROM sync_outbox'))?.m ?? 0;
  const bundle = await buildAdoptionBundle(db);

  let inserted: Record<string, number>;
  try {
    inserted = await cloud.adopt(bundle);
  } catch (e) {
    const kind = e instanceof AdoptionCloudError ? e.kind : 'network';
    return fail(kind === 'not_signed_in' ? 'not_signed_in' : kind, pending);
  }

  // Read-back verification: every local row must now exist in the caller's cloud data.
  try {
    for (const table of ADOPTION_TABLES) {
      const rows = bundle[table];
      if (rows.length === 0) continue;
      const present = await cloud.existingKeys(table, rows);
      if (rows.some((r) => !present.has(rowKey(table, r))))
        return fail('verification_mismatch', pending);
    }
  } catch {
    return fail('network', pending);
  }

  await db.transaction(async (tx) => {
    // Local bookkeeping only: suppress sync triggers (the account link is never replicated).
    await tx.run('UPDATE sync_control SET applying = 1 WHERE id = 1');
    await tx.run('UPDATE profiles SET account_user_id = ? WHERE id = ?', [userId, profileId]);
    // Everything up to the snapshot is now in the cloud; later changes stay queued for sync.
    await tx.run('DELETE FROM sync_outbox WHERE seq <= ?', [outboxMark]);
    for (const table of ADOPTION_TABLES) {
      for (const row of bundle[table]) await writeShadow(tx, table, toLocalRow(table, row));
    }
    await tx.run('UPDATE sync_control SET applying = 0 WHERE id = 1');
  });
  const done: AdoptionState = {
    ...pending,
    status: 'adopted',
    completedAt: now(),
    rowCount: bundleSize(bundle),
    lastError: null,
  };
  await writeState(db, done, now());
  return { ok: true, state: done, inserted };
}
