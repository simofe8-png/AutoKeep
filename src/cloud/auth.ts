import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Passwordless email sign-in with a one-time code (proven provider; no custom password crypto).
 * Account creation is optional and offered only once data worth protecting exists (M08).
 */
export type AuthResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'invalid_email' | 'invalid_code' | 'network' | 'rate_limited' | 'unknown';
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
  return error ? mapError(error.message, error.status) : { ok: true };
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

export async function signOut(sb: SupabaseClient): Promise<void> {
  await sb.auth.signOut();
}
