// Private Beta: invitation-only registration with Username + Password.
//
//   1. claim the invitation (single use, time-limited, revocable; only its hash is stored);
//   2. create the Supabase Auth identity: internal synthetic e-mail derived from the username,
//      the tester's own password (Supabase Auth hashes and checks it; this function never stores,
//      logs or returns it), username in app_metadata (not user-editable);
//   3. mark the invitation consumed by that identity. If that fails (revoked or claim lost in the
//      meantime) the new identity is deleted again: no account without a consumed invitation.
//
// Public endpoint (verify_jwt = false): the invitation token IS the authorization, and it only
// authorizes creating one account. The service-role key stays inside the function. The client
// signs in afterwards with the normal Supabase password sign-in.

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  internalEmailFromDigest,
  usernameDigestInput,
  usernameProblem,
} from '../_shared/username.ts';

type Failure =
  | 'bad_request'
  | 'invalid_username'
  | 'invitation_invalid'
  | 'invitation_used'
  | 'invitation_expired'
  | 'invitation_busy'
  | 'username_taken'
  | 'password_too_short'
  | 'password_too_long'
  | 'server';

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fail = (status: number, error: Failure) => json(status, { error });

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Maps a createUser refusal. Only codes/messages are inspected; nothing is logged verbatim. */
function createFailure(error: { code?: string; message?: string }): [number, Failure] {
  const code = error.code ?? '';
  const message = error.message ?? '';
  if (code === 'email_exists' || /already (been )?registered|already exists/i.test(message)) {
    return [409, 'username_taken'];
  }
  if (/longer than/i.test(message)) return [400, 'password_too_long'];
  if (code === 'weak_password' || /at least|too short|weak/i.test(message)) {
    return [400, 'password_too_short'];
  }
  return [500, 'server'];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'bad_request');
  let body: { invitation?: unknown; username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'bad_request');
  }
  const { invitation, username, password } = body;
  if (
    typeof invitation !== 'string' ||
    typeof username !== 'string' ||
    typeof password !== 'string'
  ) {
    return fail(400, 'bad_request');
  }
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(invitation)) return fail(404, 'invitation_invalid');
  if (usernameProblem(username)) return fail(400, 'invalid_username');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const claimed = await admin.rpc('claim_invitation', {
    p_token_hash: await sha256Hex(invitation),
  });
  if (claimed.error) {
    console.error('claim failed:', claimed.error.code);
    return fail(500, 'server');
  }
  const { outcome, claim } = (claimed.data as { outcome: string; claim: string | null }[])[0];
  if (outcome === 'used') return fail(410, 'invitation_used');
  if (outcome === 'expired') return fail(410, 'invitation_expired');
  if (outcome === 'busy') return fail(409, 'invitation_busy');
  if (outcome !== 'ok' || !claim) return fail(404, 'invitation_invalid');

  const release = () => admin.rpc('release_invitation', { p_claim: claim });
  const display = username.trim();
  const created = await admin.auth.admin.createUser({
    email: internalEmailFromDigest(await sha256Hex(usernameDigestInput(username))),
    password,
    email_confirm: true,
    app_metadata: { username: display },
  });
  if (created.error || !created.data.user) {
    await release();
    const [status, failure] = created.error
      ? createFailure(created.error)
      : [500, 'server' as const];
    if (failure === 'server')
      console.error('createUser failed:', created.error?.code, created.error?.status);
    return fail(status, failure);
  }

  const userId = created.data.user.id;
  const done = await admin.rpc('complete_invitation', {
    p_claim: claim,
    p_user: userId,
    p_username: display,
  });
  if (done.error || done.data !== true) {
    // Never leave an identity without a consumed invitation behind.
    await admin.auth.admin.deleteUser(userId);
    await release();
    if (done.error) console.error('complete failed:', done.error.code);
    return done.error ? fail(500, 'server') : fail(404, 'invitation_invalid');
  }
  return json(200, { status: 'registered' });
});
