/**
 * TEST-ONLY helpers for the Supabase backend under test. By default the LOCAL stack (keys read at
 * runtime from `supabase status`: well-known local-dev keys). With AUTOKEEP_TEST_TARGET=staging
 * the same suites run against the hosted technical-staging project (P2B); its URL, keys and DB
 * URL are read from a file OUTSIDE the repository (AUTOKEEP_STAGING_ENV, default
 * ~/.autokeep/staging.env). Nothing secret is ever committed or embedded in the app.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

declare const require: (id: string) => unknown;

interface LocalStatus {
  API_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}

let status: LocalStatus | null = null;

interface StagingEnv extends LocalStatus {
  DB_URL: string;
}

let staging: StagingEnv | null = null;

/** Hosted staging target (P2B), or null when testing against the local stack. */
export function stagingTarget(): StagingEnv | null {
  const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
    ?.env;
  if (env?.AUTOKEEP_TEST_TARGET !== 'staging') return null;
  if (staging) return staging;
  const fs = require('fs') as { readFileSync: (p: string, e: string) => string };
  const os = require('os') as { homedir: () => string };
  const file = env.AUTOKEEP_STAGING_ENV ?? `${os.homedir()}/.autokeep/staging.env`;
  const vars: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('=');
    if (i > 0) vars[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  staging = {
    API_URL: vars.AUTOKEEP_STAGING_API_URL,
    ANON_KEY: vars.AUTOKEEP_STAGING_ANON_KEY,
    SERVICE_ROLE_KEY: vars.AUTOKEEP_STAGING_SERVICE_ROLE_KEY,
    DB_URL: vars.AUTOKEEP_STAGING_DB_URL,
  };
  return staging;
}

export function localStatus(): LocalStatus {
  const hosted = stagingTarget();
  if (hosted) return hosted;
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
    // The local Postgres container's psql is the client; for staging it connects to the hosted
    // database (session pooler) instead of the local one.
    const hosted = stagingTarget();
    const target = hosted ? [hosted.DB_URL] : ['-U', 'postgres', '-d', 'postgres'];
    const output = execFileSync(
      'docker',
      [
        'exec',
        '-i',
        'supabase_db_autokeep',
        'psql',
        ...target,
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
