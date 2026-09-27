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

/** Creates a confirmed user and returns a client signed in as that user (plus a way to sign in again). */
export async function userClient(
  tag: string,
): Promise<{ client: SupabaseClient; userId: string; signInAgain: () => Promise<SupabaseClient> }> {
  const email = `${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@autokeep.test`;
  const password = `pw-${Math.random().toString(36).slice(2)}-A1!`;
  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('createUser failed');
  const signInAgain = async () => {
    const c = anonClient();
    const r = await c.auth.signInWithPassword({ email, password });
    if (r.error) throw r.error;
    return c;
  };
  return { client: await signInAgain(), userId: data.user.id, signInAgain };
}

export const uuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });

/**
 * Runs SQL in the LOCAL database as the `authenticated` role with the given user's JWT claims
 * (exactly what PostgREST does per request), in one transaction that is rolled back unless
 * `commit` is set. Returns psql's output; a SQL error becomes { error }.
 */
export function sqlAsUser(
  userId: string,
  sql: string,
  commit = false,
): { output: string } | { error: string } {
  const { execFileSync } = require('child_process') as {
    execFileSync: (cmd: string, args: string[], opts: object) => string;
  };
  const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
  const script = [
    'begin;',
    `do $$ begin perform set_config('request.jwt.claims', '${claims}', true); end $$;`,
    'set local role authenticated;',
    sql,
    commit ? 'commit;' : 'rollback;',
  ].join('\n');
  try {
    const output = execFileSync(
      'docker',
      [
        'exec',
        '-i',
        'supabase_db_autokeep',
        'psql',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-tA',
        '-q',
      ],
      { encoding: 'utf8', input: script, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return { output: output.trim() };
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    return { error: String(err.stderr || err.message) };
  }
}
