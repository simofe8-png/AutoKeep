import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  changePassword,
  deleteAccount,
  registerWithInvitation,
  signInWithUsername,
  signOut,
  usernameOf,
} from '../auth';
import { internalEmail } from '../username';
import { adminClient, localStatus, stagingTarget } from '../testing/localStack';

/**
 * Private Beta authentication against the REAL backend (local stack, or hosted staging with
 * AUTOKEEP_TEST_TARGET=staging): administrator invitations (the actual CLI), invitation-only
 * Username + Password registration through the `register` function, sign-in, password change,
 * administrator reset, account deletion and the server-side boundaries. Disposable test data only;
 * everything created here is removed in afterAll.
 */

// Plain Node suite (no @types/node in this project): the few Node APIs used, typed locally.
declare const require: (id: string) => unknown;
declare const process: { execPath: string };
const { execFileSync } = require('child_process') as {
  execFileSync: (file: string, args: string[], opts: object) => string;
};
const { createHash, randomBytes } = require('crypto') as {
  createHash: (a: string) => { update: (d: string) => { digest: (e: string) => string } };
  randomBytes: (n: number) => { toString: (e: string) => string };
};

const RUN = `ct${Date.now().toString(36)}`;
const target = stagingTarget() ? 'staging' : 'local';
const created: string[] = []; // usernames
const invitationIds: string[] = [];

function device(): SupabaseClient {
  const s = localStatus();
  return createClient(s.API_URL, s.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function cli(...args: string[]): string {
  return execFileSync(
    process.execPath,
    [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
      'tools/beta-admin.mjs',
      '--target',
      target,
      ...args,
    ],
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], input: '' },
  );
}

/** A real invitation made by the administrator CLI: { id, link }. */
function invite(): { id: string; link: string } {
  const out = cli('invite', 'create', '--days', '1', '--note', `cloud-test ${RUN}`);
  const id = /invitation ([0-9a-f-]{36})/.exec(out)![1];
  const link = /(autokeep:\/\/invite\?t=[A-Za-z0-9_-]+)/.exec(out)![1];
  invitationIds.push(id);
  return { id, link };
}

async function register(link: string, username: string, password: string) {
  const sb = device();
  const r = await registerWithInvitation(sb, link, username, password);
  if (r.ok) created.push(username);
  return { r, sb };
}

async function statusOf(id: string) {
  const { data } = await adminClient()
    .from('beta_invitations')
    .select('consumed_at, revoked_at, expires_at, username, consumed_by')
    .eq('id', id)
    .maybeSingle();
  return data;
}

async function usersNamed(username: string) {
  const email = await internalEmail(username);
  const users = [];
  for (let page = 1; ; page++) {
    const { data } = await adminClient().auth.admin.listUsers({ page, perPage: 200 });
    users.push(...data.users.filter((u) => u.email === email));
    if (data.users.length < 200) break;
  }
  return users;
}

afterAll(async () => {
  const admin = adminClient();
  for (const u of created)
    for (const user of await usersNamed(u)) await admin.auth.admin.deleteUser(user.id);
  if (invitationIds.length) await admin.from('beta_invitations').delete().in('id', invitationIds);
  await admin.from('beta_invitations').delete().like('note', `%${RUN}%`);
}, 120000);

describe('invitations', () => {
  it('a valid invitation registers exactly one account and is consumed atomically with it', async () => {
    const { id, link } = invite();
    expect((await statusOf(id))?.consumed_at).toBeNull();
    const username = `${RUN}-Dana`;
    const { r, sb } = await register(link, `  ${username} `, 'aaaaaa');
    expect(r).toEqual({ ok: true });

    const s = await statusOf(id);
    const [user] = await usersNamed(username);
    expect(s?.consumed_at).not.toBeNull();
    expect(s?.consumed_by).toBe(user.id);
    expect(s?.username).toBe(username);
    // The identity: internal address only, username in server-controlled metadata.
    expect(user.email).toMatch(/^u[0-9a-f]{40}@users\.autokeep\.invalid$/);
    expect(usernameOf(user)).toBe(username);
    const session = (await sb.auth.getSession()).data.session!;
    expect(usernameOf(session.user)).toBe(username);

    // Consumed: cannot be used again, and nothing new is created.
    const again = await register(link, `${RUN}-other`, 'aaaaaa');
    expect(again.r).toEqual({ ok: false, reason: 'invitation_used' });
    expect(await usersNamed(`${RUN}-other`)).toHaveLength(0);
  });

  it('expired, revoked and random invitations are refused without creating anything', async () => {
    // Expired: created by the administrator, then past its expiry.
    const expired = invite();
    await adminClient()
      .from('beta_invitations')
      .update({
        created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
        expires_at: new Date(Date.now() - 60000).toISOString(),
      })
      .eq('id', expired.id);
    expect((await register(expired.link, `${RUN}-exp`, 'aaaaaa')).r).toEqual({
      ok: false,
      reason: 'invitation_expired',
    });

    const revoked = invite();
    expect(cli('invite', 'revoke', revoked.id)).toMatch(/^revoked/);
    expect((await register(revoked.link, `${RUN}-rev`, 'aaaaaa')).r).toEqual({
      ok: false,
      reason: 'invitation_invalid',
    });
    // A used invitation cannot be revoked (it is not "unused").
    expect(cli('invite', 'revoke', revoked.id)).toMatch(/not revoked/);

    const random = randomBytes(32).toString('base64url');
    expect((await register(`autokeep://invite?t=${random}`, `${RUN}-rnd`, 'aaaaaa')).r).toEqual({
      ok: false,
      reason: 'invitation_invalid',
    });
    for (const u of ['exp', 'rev', 'rnd']) expect(await usersNamed(`${RUN}-${u}`)).toHaveLength(0);

    const list = cli('invite', 'list');
    expect(list).toContain(expired.id);
    expect(list).toMatch(new RegExp(`${revoked.id}.*revoked`));
  });

  it('concurrent registrations with one invitation create exactly one account', async () => {
    const { id, link } = invite();
    const names = [1, 2, 3, 4, 5].map((i) => `${RUN}-race${i}`);
    const results = await Promise.all(names.map((n) => register(link, n, 'aaaaaa')));
    const ok = results.filter((x) => x.r.ok);
    expect(ok).toHaveLength(1);
    for (const x of results.filter((y) => !y.r.ok)) {
      expect(['invitation_busy', 'invitation_used']).toContain((x.r as { reason: string }).reason);
    }
    let accounts = 0;
    for (const n of names) accounts += (await usersNamed(n)).length;
    expect(accounts).toBe(1);
    expect((await statusOf(id))?.consumed_at).not.toBeNull();
  });

  it('clients cannot read invitations, claim them, or sign up without one', async () => {
    const anon = device();
    const read = await anon.from('beta_invitations').select('id');
    expect(read.error ?? (read.data?.length === 0 ? null : 'rows visible')).not.toBeNull();
    const claim = await anon.rpc('claim_invitation', { p_token_hash: 'a'.repeat(64) });
    expect(claim.error).not.toBeNull();

    const { link } = invite();
    const { sb } = await register(link, `${RUN}-reader`, 'aaaaaa');
    const asUser = await sb.from('beta_invitations').select('id');
    expect(asUser.error ?? (asUser.data?.length === 0 ? null : 'rows visible')).not.toBeNull();
    expect(
      (
        await sb.rpc('complete_invitation', {
          p_claim: randomUUIDish(),
          p_user: randomUUIDish(),
          p_username: 'x',
        })
      ).error,
    ).not.toBeNull();

    const open = await anon.auth.signUp({
      email: await internalEmail(`${RUN}-open`),
      password: 'aaaaaa',
    });
    expect(open.error).not.toBeNull();
    expect(await usersNamed(`${RUN}-open`)).toHaveLength(0);
  });
});

function randomUUIDish() {
  const h = createHash('sha256').update(String(Math.random())).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

describe('registration', () => {
  it('duplicate usernames (any case, outer spaces) are refused and do not consume the invitation', async () => {
    const first = invite();
    expect((await register(first.link, `${RUN}-Taken`, 'aaaaaa')).r.ok).toBe(true);
    const second = invite();
    expect((await register(second.link, `  ${RUN}-TAKEN `, 'bbbbbb')).r).toEqual({
      ok: false,
      reason: 'username_taken',
    });
    expect((await statusOf(second.id))?.consumed_at).toBeNull();
    // The invitation is still usable with another username.
    expect((await register(second.link, `${RUN}-free`, 'bbbbbb')).r.ok).toBe(true);
  });

  it('Supabase password floor: 5 characters refused (invitation kept), any 6 accepted; 72-byte cap', async () => {
    const { id, link } = invite();
    expect((await register(link, `${RUN}-short`, '12345')).r).toEqual({
      ok: false,
      reason: 'password_too_short',
    });
    expect((await statusOf(id))?.consumed_at).toBeNull();
    expect(await usersNamed(`${RUN}-short`)).toHaveLength(0);
    expect((await register(link, `${RUN}-long`, 'a'.repeat(73))).r).toEqual({
      ok: false,
      reason: 'password_too_long',
    });
    // No character classes, no strength rules: six identical characters are fine.
    expect((await register(link, `${RUN}-short`, '111111')).r).toEqual({ ok: true });
  });
});

describe('sign-in, sessions, password change and reset', () => {
  const username = `${RUN}-login`;

  it('Username + Password; wrong username and wrong password read the same', async () => {
    const { link } = invite();
    expect((await register(link, username, 'first-pw')).r.ok).toBe(true);

    const a = device();
    expect(await signInWithUsername(a, username.toUpperCase(), 'first-pw')).toEqual({ ok: true });
    expect(await signInWithUsername(device(), username, 'wrong-pw')).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
    expect(await signInWithUsername(device(), `${username}-nobody`, 'first-pw')).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });

    // Refresh, and device-local sign-out leaves another device signed in.
    const b = device();
    expect((await signInWithUsername(b, username, 'first-pw')).ok).toBe(true);
    const before = (await a.auth.getSession()).data.session!.access_token;
    const refreshed = await a.auth.refreshSession();
    expect(refreshed.error).toBeNull();
    expect(refreshed.data.session!.access_token).not.toBe(before);
    await signOut(a);
    expect((await a.auth.getSession()).data.session).toBeNull();
    expect((await b.auth.getUser()).data.user).not.toBeNull();
  });

  it('the user changes the password without any e-mail step', async () => {
    const sb = device();
    expect((await signInWithUsername(sb, username, 'first-pw')).ok).toBe(true);
    expect(await changePassword(sb, '12345')).toEqual({ ok: false, reason: 'password_too_short' });
    expect(await changePassword(sb, 'first-pw')).toEqual({ ok: false, reason: 'same_password' });
    expect(await changePassword(sb, 'second-pw')).toEqual({ ok: true });
    expect((await signInWithUsername(device(), username, 'first-pw')).ok).toBe(false);
    expect((await signInWithUsername(device(), username, 'second-pw')).ok).toBe(true);
  });

  it('the administrator sets a new password (never reads the old one)', async () => {
    const out = execFileSync(
      process.execPath,
      [
        '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
        'tools/beta-admin.mjs',
        '--target',
        target,
        'user',
        'set-password',
        `  ${username.toUpperCase()} `,
      ],
      { encoding: 'utf8', input: 'admin-set-pw\n' },
    );
    expect(out).toMatch(/password set/);
    expect(out).not.toContain('admin-set-pw');
    expect((await signInWithUsername(device(), username, 'second-pw')).ok).toBe(false);
    expect((await signInWithUsername(device(), username, 'admin-set-pw')).ok).toBe(true);
    // Only a bcrypt hash exists server-side; the admin API never returns a password.
    const [user] = await usersNamed(username);
    expect(JSON.stringify(user)).not.toContain('admin-set-pw');
  });
});

describe('account deletion', () => {
  it('removes the identity and its username mapping; the username becomes free again', async () => {
    const username = `${RUN}-bye`;
    const first = invite();
    const { sb } = await register(first.link, username, 'aaaaaa');
    expect(await deleteAccount(sb)).toEqual({ ok: true });
    expect(await usersNamed(username)).toHaveLength(0);
    expect(await statusOf(first.id)).toBeNull(); // the consumed invitation went with the account
    expect(await signInWithUsername(device(), username, 'aaaaaa')).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
    const second = invite();
    expect((await register(second.link, username, 'bbbbbb')).r.ok).toBe(true);
  });
});
