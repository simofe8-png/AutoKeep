import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

import { readClientEnv } from '@/config/env';

import { backendUrlAllowed, fetchWithTimeout } from './backendUrl';
import { createChunkedStorage } from './secureSessionStorage';

let client: SupabaseClient | null = null;

/**
 * Supabase client for the app. Returns null when cloud config is absent — the app is fully usable
 * locally without an account (spec §16). Only the anon key is ever bundled; authorization is
 * enforced server-side by RLS (docs/cloud/SUPABASE.md).
 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const env = readClientEnv();
  if (!env.supabaseUrl || !env.supabaseAnonKey) return null;
  const allowLoopback = Constants.expoConfig?.extra?.allowLoopbackBackend === true;
  if (!backendUrlAllowed(env.supabaseUrl, { dev: __DEV__, allowLoopback })) return null;
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    global: { fetch: fetchWithTimeout(fetch) },
    auth: {
      storage: createChunkedStorage(SecureStore),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // Sign-in is a one-time email CODE verified in-app (no redirect), so PKCE adds nothing —
      // and Hermes has no WebCrypto for its challenge (device-verified warning).
      flowType: 'implicit',
    },
  });
  return client;
}
