// P2A: user-initiated account deletion (docs/release/P2_PRODUCTION_BACKEND_PLAN.md §B1).
//
// Order matters and failures never report success:
//   1. authenticate the caller (a real user token; the anon key is refused);
//   2. remove EVERY stored original under `<uid>/` and verify that nothing is left;
//   3. only then delete the auth user. Every table row cascades from auth.users
//      (profiles, vehicles and all vehicle-scoped rows, the sync ledger and tombstones).
// Idempotent: a retry after a lost response (the user is already gone, the token is still a
// valid, gateway-verified JWT) finishes the storage cleanup and reports success.
//
// Runs with the platform-provided SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The service-role key
// never leaves the function; the app only ever holds the user's own token.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'documents';
const PAGE = 100;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Claims of a JWT the gateway has already verified (verify_jwt = true). */
function claims(jwt: string): { sub?: string; role?: string } {
  try {
    const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '=')));
  } catch {
    return {};
  }
}

/** Every object path under `<uid>/` (vehicle folders one level down). */
async function listAll(admin: SupabaseClient, uid: string): Promise<string[]> {
  const paths: string[] = [];
  const folders: string[] = [uid];
  while (folders.length) {
    const folder = folders.pop()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(folder, { limit: PAGE, offset });
      if (error) throw new Error(`list: ${error.message}`);
      for (const entry of data ?? []) {
        const path = `${folder}/${entry.name}`;
        // Folders are listed without an id; files have one.
        if (entry.id === null) folders.push(path);
        else paths.push(path);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return paths;
}

async function removeAll(admin: SupabaseClient, uid: string): Promise<void> {
  for (let round = 0; round < 20; round++) {
    const paths = await listAll(admin, uid);
    if (paths.length === 0) return;
    for (let i = 0; i < paths.length; i += PAGE) {
      const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + PAGE));
      if (error) throw new Error(`remove: ${error.message}`);
    }
  }
  throw new Error('storage cleanup did not converge');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const c = claims(jwt);
  if (!jwt || c.role !== 'authenticated' || !c.sub) {
    return json(401, { error: 'not_signed_in' });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // The token must belong to an existing user, or to one this function already deleted.
  const { data: user, error: userError } = await admin.auth.admin.getUserById(c.sub);
  let alreadyDeleted = false;
  if (userError || !user?.user) {
    const status = (userError as { status?: number } | null)?.status;
    // Only a definite "no such user" is the idempotent retry; anything else is an outage.
    if (status === 404 || /not.?found/i.test(userError?.message ?? '')) alreadyDeleted = true;
    else return json(502, { error: 'auth_unavailable' });
  }

  try {
    await removeAll(admin, c.sub);
  } catch (e) {
    // Nothing is deleted from the account while any original may remain.
    return json(502, { error: 'storage_cleanup_failed', detail: String(e).slice(0, 200) });
  }

  if (!alreadyDeleted) {
    const { error } = await admin.auth.admin.deleteUser(c.sub);
    if (error && !/not.?found/i.test(error.message)) {
      return json(502, { error: 'delete_user_failed' });
    }
  }

  // Verify: no data row and no object may remain for this user.
  const { count, error: countError } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', c.sub);
  const left = await listAll(admin, c.sub).catch(() => ['?']);
  if (countError || (count ?? 0) > 0 || left.length > 0) {
    return json(502, { error: 'verification_failed' });
  }
  return json(200, { status: 'deleted' });
});
