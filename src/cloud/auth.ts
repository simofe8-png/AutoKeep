import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Passwordless email sign-in with a one-time code (proven provider; no custom password crypto).
 * Account creation is optional and offered only once data worth protecting exists (M08).
 */
export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'invalid_email'
        | 'email_rejected'
        | 'invalid_code'
        | 'network'
        | 'rate_limited'
        | 'unknown';
    };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function mapError(message: string, status?: number): AuthResult {
  if (status === 429 || /rate limit/i.test(message)) return { ok: false, reason: 'rate_limited' };
  if (/network|fetch/i.test(message)) return { ok: false, reason: 'network' };
  if (/token|otp|expired|invalid/i.test(message)) return { ok: false, reason: 'invalid_code' };
  return { ok: false, reason: 'unknown' };
}

export async function requestEmailCode(sb: SupabaseClient, email: string): Promise<AuthResult> {
  const normalized = email.trim().toLowerCase();
  if (!EMAIL.test(normalized)) return { ok: false, reason: 'invalid_email' };
  const { error } = await sb.auth.signInWithOtp({
    email: normalized,
    options: { shouldCreateUser: true },
  });
  return error ? mapRequestError(error.message, error.status) : { ok: true };
}

/**
 * Sending a code has no code yet: a refusal of the ADDRESS by the auth server (e.g. "Email address
 * … is invalid", which is also what a restricted sender answers) must never read as "wrong code".
 */
export function mapRequestError(message: string, status?: number): AuthResult {
  if (status === 429 || /rate limit/i.test(message)) return { ok: false, reason: 'rate_limited' };
  if (/network|fetch/i.test(message)) return { ok: false, reason: 'network' };
  if (/email/i.test(message) && /invalid|not authorized|not allowed/i.test(message)) {
    return { ok: false, reason: 'email_rejected' };
  }
  return { ok: false, reason: 'unknown' };
}

export async function verifyEmailCode(
  sb: SupabaseClient,
  email: string,
  code: string,
): Promise<AuthResult> {
  if (!/^\d{6,10}$/.test(code.trim())) return { ok: false, reason: 'invalid_code' };
  const { error } = await sb.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.trim(),
    type: 'email',
  });
  return error ? mapError(error.message, error.status) : { ok: true };
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
