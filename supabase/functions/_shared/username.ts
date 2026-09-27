// Private Beta usernames: the ONE definition shared by the app (src/cloud/username.ts re-exports
// it) and the `register` Edge Function. Pure TypeScript, no platform APIs: the SHA-256 digest is
// computed by the caller (Web Crypto in Deno, expo-crypto on the device).
//
// Supabase Auth has no username sign-in, so every account gets a SYNTHETIC, internal-only e-mail
// derived from the normalized username. It is never shown to or typed by the user, and nothing is
// ever sent to it (the `.invalid` top-level domain is reserved and can never receive mail,
// RFC 2606). Because the address is a function of the username, the Auth server's own unique
// e-mail constraint makes usernames unique, and signing in needs no username lookup endpoint.

export const USERNAME_MAX_LENGTH = 32;

/** Only what reliable lookup needs: outer whitespace trimmed, case-insensitive. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

// Control, zero-width and bidirectional-override characters are invisible, so two usernames that
// look identical could differ. They are refused rather than silently removed.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;

export type UsernameProblem = 'empty' | 'too_long' | 'invisible_characters';

export function usernameProblem(input: string): UsernameProblem | null {
  const n = normalizeUsername(input);
  if (n.length === 0) return 'empty';
  if ([...n].length > USERNAME_MAX_LENGTH) return 'too_long';
  if (INVISIBLE.test(n)) return 'invisible_characters';
  return null;
}

/** What is hashed: a versioned, namespaced form of the normalized username. */
export function usernameDigestInput(input: string): string {
  return `autokeep-beta-username:v1:${normalizeUsername(input)}`;
}

/** Internal Auth address from the lowercase hex SHA-256 of usernameDigestInput(). */
export function internalEmailFromDigest(sha256Hex: string): string {
  if (!/^[0-9a-f]{64}$/.test(sha256Hex)) throw new Error('expected a sha256 hex digest');
  return `u${sha256Hex.slice(0, 40)}@users.autokeep.invalid`;
}
