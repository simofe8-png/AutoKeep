import * as Crypto from 'expo-crypto';

import {
  internalEmailFromDigest,
  usernameDigestInput,
} from '../../supabase/functions/_shared/username';

// One definition for the app and the `register` function (the rules must match exactly).
export {
  normalizeUsername,
  usernameProblem,
  USERNAME_MAX_LENGTH,
  type UsernameProblem,
} from '../../supabase/functions/_shared/username';

/** The internal-only Supabase Auth address of a username (never shown to the user). */
export async function internalEmail(username: string): Promise<string> {
  const hex = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    usernameDigestInput(username),
    { encoding: Crypto.CryptoEncoding.HEX },
  );
  return internalEmailFromDigest(hex.toLowerCase());
}
