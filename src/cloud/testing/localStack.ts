/**
 * TEST-ONLY helpers for the local Supabase stack. Keys are read at runtime from
 * `supabase status` (well-known local-dev keys) and never committed.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare const require: (id: string) => unknown;

interface LocalStatus {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

let status: LocalStatus | null = null;

export function localStatus(): LocalStatus {
  if (status) return status;
  const { execSync } = require('child_process') as {
    execSync: (cmd: string, opts: object) => string;
  };
  const out = execSync('npx supabase status -o json', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  status = JSON.parse(out.slice(out.indexOf('{'))) as LocalStatus;
  return status;
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false } } as const;

export function anonClient(): SupabaseClient {
  const s = localStatus();
  return createClient(s.API_URL, s.ANON_KEY, noPersist);
}

/** Service-role client: TEST SETUP ONLY (creating users). The app never has this key. */
export function adminClient(): SupabaseClient {
  const s = localStatus();
  return createClient(s.API_URL, s.SERVICE_ROLE_KEY, noPersist);
}

/** Creates a confirmed user and returns a client signed in as that user. */
export async function userClient(tag: string): Promise<{ client: SupabaseClient; userId: string }> {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@autokeep.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-A1!`;
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  const client = anonClient();
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { client, userId: data.user.id };
}

export const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
