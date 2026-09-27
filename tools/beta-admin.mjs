#!/usr/bin/env node
// AutoKeep Private Beta administration (OPERATOR ONLY: runs on the owner's computer with the
// service-role key, which never enters the app, the repository or any log).
//
// (Add --disable-warning=MODULE_TYPELESS_PACKAGE_JSON after `node` to silence a harmless notice.)
//   node tools/beta-admin.mjs --target staging invite create [--days 7] [--note "text"]
//   node tools/beta-admin.mjs --target staging invite list
//   node tools/beta-admin.mjs --target staging invite revoke <invitation id>
//   node tools/beta-admin.mjs --target staging invite delete <invitation id>   (unused only)
//   node tools/beta-admin.mjs --target staging user list
//   node tools/beta-admin.mjs --target staging user set-password <username>   (new password on stdin)
//
// Targets: `local` (the local Docker stack, `supabase status`) or `staging` (credentials from
// ~/.autokeep/staging.env or AUTOKEEP_STAGING_ENV). There is deliberately no `production` target.
//
// Invitations: a 256-bit random token is shown ONCE, inside the link; only its SHA-256 is stored.
// Password reset: the administrator SETS a new password through Supabase Auth. Existing passwords
// are never readable (Supabase stores only bcrypt hashes).

import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeUsername } from '../supabase/functions/_shared/username.ts';

export const INVITE_SCHEME = 'autokeep://invite?t=';

export function target(name) {
  if (name === 'local') {
    const out = execSync('npx supabase status -o json', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const s = JSON.parse(out.slice(out.indexOf('{')));
    return { url: s.API_URL, serviceKey: s.SERVICE_ROLE_KEY };
  }
  if (name === 'staging') {
    const file = process.env.AUTOKEEP_STAGING_ENV ?? `${homedir()}/.autokeep/staging.env`;
    const vars = {};
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const i = line.indexOf('=');
      if (i > 0) vars[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return {
      url: vars.AUTOKEEP_STAGING_API_URL,
      serviceKey: vars.AUTOKEEP_STAGING_SERVICE_ROLE_KEY,
    };
  }
  throw new Error(`unknown target "${name}" (local | staging)`);
}

export function adminFor({ url, serviceKey }) {
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

export async function createInvitation(admin, { days = 7, note = null } = {}) {
  if (!(days > 0 && days <= 90)) throw new Error('days must be between 1 and 90');
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('beta_invitations')
    .insert({ token_hash: sha256Hex(token), expires_at: expiresAt, note })
    .select('id, expires_at')
    .single();
  if (error) throw new Error(`create: ${error.message}`);
  return { id: data.id, expiresAt: data.expires_at, token, link: `${INVITE_SCHEME}${token}` };
}

export function invitationStatus(row, now = new Date()) {
  if (row.consumed_at) return 'used';
  if (row.revoked_at) return 'revoked';
  if (new Date(row.expires_at) <= now) return 'expired';
  return 'unused';
}

export async function listInvitations(admin) {
  const { data, error } = await admin
    .from('beta_invitations')
    .select('id, note, created_at, expires_at, revoked_at, consumed_at, username')
    .order('created_at', { ascending: true });
  if (error) throw new Error(`list: ${error.message}`);
  return data.map((r) => ({ ...r, status: invitationStatus(r) }));
}

/** Revokes an invitation that has not been used. Returns false if there is none such. */
export async function revokeInvitation(admin, id) {
  const { data, error } = await admin
    .from('beta_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('consumed_at', null)
    .is('revoked_at', null)
    .select('id');
  if (error) throw new Error(`revoke: ${error.message}`);
  return data.length === 1;
}

/** Deletes an UNUSED invitation record (cleanup). Used ones go with their account. */
export async function deleteInvitation(admin, id) {
  const { data, error } = await admin
    .from('beta_invitations')
    .delete()
    .eq('id', id)
    .is('consumed_at', null)
    .select('id');
  if (error) throw new Error(`delete: ${error.message}`);
  return data.length === 1;
}

/** The Auth user id registered with this username (via its consumed invitation), or null. */
export async function userIdOf(admin, username) {
  const { data, error } = await admin
    .from('beta_invitations')
    .select('consumed_by, username')
    .not('consumed_by', 'is', null);
  if (error) throw new Error(`lookup: ${error.message}`);
  const wanted = normalizeUsername(username);
  return data.find((r) => normalizeUsername(r.username ?? '') === wanted)?.consumed_by ?? null;
}

export async function listUsers(admin) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 200) break;
  }
  return users.map((u) => ({
    username: u.app_metadata?.username ?? null,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
  }));
}

/**
 * Administrator-assisted reset: SETS a new password (Supabase Auth hashes it). The existing
 * password is never read. Other signed-in devices keep their sessions until they expire or sign
 * out; that is Supabase's behaviour for an admin password update.
 */
export async function setPassword(admin, username, password) {
  const id = await userIdOf(admin, username);
  if (!id) return { ok: false, reason: 'no_such_user' };
  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

async function readStdinLine() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks)
    .toString('utf8')
    .replace(/\r?\n$/, '');
}

async function main(argv) {
  const t = argv.indexOf('--target');
  if (t < 0) throw new Error('--target local|staging is required');
  const admin = adminFor(target(argv[t + 1]));
  const args = argv.filter((_, i) => i !== t && i !== t + 1);
  const opt = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const [group, command, arg] = args;
  if (group === 'invite' && command === 'create') {
    const r = await createInvitation(admin, {
      days: opt('--days') ? Number(opt('--days')) : 7,
      note: opt('--note') ?? null,
    });
    console.log(`invitation ${r.id} (expires ${r.expiresAt})`);
    console.log('Send this link to the tester (shown only now; it is not stored):');
    console.log(r.link);
    return;
  }
  if (group === 'invite' && command === 'list') {
    console.table(await listInvitations(admin));
    return;
  }
  if (group === 'invite' && command === 'revoke' && arg) {
    console.log(
      (await revokeInvitation(admin, arg))
        ? 'revoked'
        : 'not revoked (unknown, used or already revoked)',
    );
    return;
  }
  if (group === 'invite' && command === 'delete' && arg) {
    console.log((await deleteInvitation(admin, arg)) ? 'deleted' : 'not deleted (unknown or used)');
    return;
  }
  if (group === 'user' && command === 'list') {
    console.table(await listUsers(admin));
    return;
  }
  if (group === 'user' && command === 'set-password' && arg) {
    if (process.stdin.isTTY) console.error('Type the new password, then Enter and Ctrl+Z/Ctrl+D:');
    const r = await setPassword(admin, arg, await readStdinLine());
    console.log(r.ok ? 'password set' : `not set: ${r.reason}`);
    return;
  }
  throw new Error('unknown command (see the header of tools/beta-admin.mjs)');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
