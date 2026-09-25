import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { readClientEnv } from '@/config/env';

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
  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: createChunkedStorage(SecureStore),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return client;
}
