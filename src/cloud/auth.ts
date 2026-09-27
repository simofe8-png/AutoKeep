import type { SupabaseClient } from '@supabase/supabase-js';

import { internalEmail, usernameProblem } from './username';

/**
 * Private Beta authentication: invitation → Username + Password registration → Username +
 * Password sign-in. Supabase Auth checks and stores passwords (no custom password crypto, no
 * AutoKeep password policy). The internal e-mail Supabase needs is derived from the username and
 * never shown (see supabase/functions/_shared/username.ts).
 */
export type AuthFailure =
  | 'invalid_username'
  | 'invalid_credentials'
  | 'username_taken'
  | 'invitation_invalid'
  | 'invitation_used'
  | 'invitation_expired'
  | 'invitation_busy'
  | 'password_too_short'
  | 'password_too_long'
  | 'same_password'
  | 'network'
  | 'rate_limited'
  | 'unknown';

export type AuthResult = { ok: true } | { ok: false; reason: AuthFailure };

const fail = (reason: AuthFailure): AuthResult => ({ ok: false, reason });

function isNetwork(message: string, status?: number): boolean {
  return status === 0 || /network|fetch|timed? ?out|abort/i.test(message);
}

/** Supabase Auth's own password constraints (6 characters minimum, 72 bytes maximum). */
function passwordFailure(code: string, message: string): AuthFailure | null {
  if (/longer than/i.test(message)) return 'password_too_long';
  if (code === 'same_password' || /different from the old/i.test(message)) return 'same_password';
  if (code === 'weak_password' || /at least|too short/i.test(message)) return 'password_too_short';
  return null;
}

export async function signInWithUsername(
  sb: SupabaseClient,
  username: string,
  password: string,
): Promise<AuthResult> {
  // An impossible username cannot belong to an account; it reads like any wrong credential.
  if (usernameProblem(username)) return fail('invalid_credentials');
  if (password === '') return fail('invalid_credentials');
  const { error } = await sb.auth.signInWithPassword({
    email: await internalEmail(username),
    password,
  });
  if (!error) return { ok: true };
  if (error.status === 429 || /rate limit/i.test(error.message)) return fail('rate_limited');
  if (isNetwork(error.message, error.status)) return fail('network');
  if (error.status === 400 || /invalid login credentials/i.test(error.message)) {
    return fail('invalid_credentials');
  }
  return fail('unknown');
}

const FUNCTION_FAILURES: readonly AuthFailure[] = [
  'invalid_username',
  'username_taken',
  'invitation_invalid',
  'invitation_used',
  'invitation_expired',
  'invitation_busy',
  'password_too_short',
  'password_too_long',
];

/** The invitation token from a pasted/opened invitation link, or the bare token itself. */
export function invitationToken(input: string): string | null {
  const text = input.trim();
  const fromLink = /[?&]t=([A-Za-z0-9_-]{32,128})(?:[&#]|$)/.exec(text);
  if (fromLink) return fromLink[1];
  return /^[A-Za-z0-9_-]{32,128}$/.test(text) ? text : null;
}

/** Creates the account with an invitation (server-side), then signs in with the new credentials. */
export async function registerWithInvitation(
  sb: SupabaseClient,
  invitation: string,
  username: string,
  password: string,
): Promise<AuthResult> {
  const token = invitationToken(invitation);
  if (!token) return fail('invitation_invalid');
  if (usernameProblem(username)) return fail('invalid_username');
  const { error } = await sb.functions.invoke('register', {
    method: 'POST',
    body: { invitation: token, username, password },
  });
  if (error) {
    const name = (error as { name?: string }).name ?? '';
    if (name === 'FunctionsFetchError') return fail('network');
    const response = (error as { context?: Response }).context;
    const code = await response
      ?.clone()
      .json()
      .then((b: { error?: string }) => b.error)
      .catch(() => undefined);
    const known = FUNCTION_FAILURES.find((f) => f === code);
    return fail(known ?? 'unknown');
  }
  return signInWithUsername(sb, username, password);
}

/** Changes the signed-in user's password (Supabase Auth; no e-mail step). */
export async function changePassword(sb: SupabaseClient, password: string): Promise<AuthResult> {
  const { error } = await sb.auth.updateUser({ password });
  if (!error) return { ok: true };
  if (isNetwork(error.message, error.status)) return fail('network');
  if (error.status === 429) return fail('rate_limited');
  return fail(passwordFailure(error.code ?? '', error.message) ?? 'unknown');
}

/** The account's username (set by the server at registration; not user-editable). */
export function usernameOf(user: { app_metadata?: Record<string, unknown> } | null | undefined) {
  const u = user?.app_metadata?.username;
  return typeof u === 'string' && u !== '' ? u : null;
}

/**
 * Signs out THIS device only (P2A). The Supabase default scope is 'global', which would revoke the
 * user's sessions on every other device as well. The local data stays on the device (by design).
 */
export async function signOut(sb: SupabaseClient): Promise<void> {
  await sb.auth.signOut({ scope: 'local' });
}

export type DeleteAccountResult =
  { ok: true } | { ok: false; reason: 'network' | 'not_signed_in' | 'server' };

/** Calls the server-side account deletion (supabase/functions/delete-account). */
export async function deleteAccount(sb: SupabaseClient): Promise<DeleteAccountResult> {
  const { data, error } = await sb.functions.invoke<{ status?: string }>('delete-account', {
    method: 'POST',
  });
  if (!error) return data?.status === 'deleted' ? { ok: true } : { ok: false, reason: 'server' };
  const name = (error as { name?: string }).name ?? '';
  const status = (error as { context?: { status?: number } }).context?.status;
  if (name === 'FunctionsFetchError') return { ok: false, reason: 'network' };
  if (status === 401) return { ok: false, reason: 'not_signed_in' };
  return { ok: false, reason: 'server' };
}
