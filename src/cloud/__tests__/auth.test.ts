import type { SupabaseClient } from '@supabase/supabase-js';

import {
  changePassword,
  invitationToken,
  registerWithInvitation,
  signInWithUsername,
} from '../auth';
import { internalEmail, normalizeUsername, usernameProblem } from '../username';

describe('Private Beta usernames', () => {
  it('normalization is only trimming and case-folding', () => {
    expect(normalizeUsername('  Dana.K  ')).toBe('dana.k');
    expect(normalizeUsername('משה כהן')).toBe('משה כהן');
  });

  it('refuses only empty, over-long and invisible-character usernames', () => {
    expect(usernameProblem('   ')).toBe('empty');
    expect(usernameProblem('a'.repeat(33))).toBe('too_long');
    expect(usernameProblem('א'.repeat(32))).toBeNull();
    expect(usernameProblem('da​na')).toBe('invisible_characters');
    expect(usernameProblem('dana‮')).toBe('invisible_characters');
    expect(usernameProblem('x')).toBeNull();
    expect(usernameProblem('!@# 1')).toBeNull();
  });

  it('the internal address is derived identically to the server (value computed by Deno Web Crypto)', async () => {
    // Registered through the local `register` function with username " Smoke User ".
    expect(await internalEmail(' Smoke User ')).toBe(
      'ud38fa9f3296cdef8da06084946be0d6fb32784c1@users.autokeep.invalid',
    );
    expect(await internalEmail('smoke user')).toBe(await internalEmail('SMOKE USER'));
    expect(await internalEmail('smoke user')).not.toBe(await internalEmail('smoke  user'));
  });
});

describe('invitation links', () => {
  const token = 'Abc_-1234567890123456789012345678901234567';
  it('accepts the deep link, the link inside pasted text, or the bare token', () => {
    expect(invitationToken(`autokeep://invite?t=${token}`)).toBe(token);
    expect(invitationToken(`הזמנה: autokeep://invite?t=${token} `)).toBe(token);
    expect(invitationToken(`  ${token}\n`)).toBe(token);
  });
  it('rejects anything else', () => {
    expect(invitationToken('')).toBeNull();
    expect(invitationToken('short')).toBeNull();
    expect(invitationToken(`autokeep://invite?t=${token}<script>`)).toBeNull();
  });
});

type AuthError = { message: string; status?: number; code?: string };

function fakeClient(opts: {
  signIn?: AuthError | null;
  update?: AuthError | null;
  invoke?: { error: unknown };
}) {
  const calls: { signIn: unknown[]; invoke: unknown[] } = { signIn: [], invoke: [] };
  const sb = {
    auth: {
      signInWithPassword: async (creds: unknown) => {
        calls.signIn.push(creds);
        return { error: opts.signIn ?? null };
      },
      updateUser: async () => ({ error: opts.update ?? null }),
    },
    functions: {
      invoke: async (name: string, o: unknown) => {
        calls.invoke.push([name, o]);
        return { data: null, error: opts.invoke?.error ?? null };
      },
    },
  } as unknown as SupabaseClient;
  return { sb, calls };
}

const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  context: new Response(JSON.stringify(body), { status }),
});

describe('sign-in', () => {
  it('signs in with the internal address and the password exactly as typed', async () => {
    const { sb, calls } = fakeClient({});
    expect(await signInWithUsername(sb, ' Dana ', ' p w ')).toEqual({ ok: true });
    expect(calls.signIn).toEqual([{ email: await internalEmail('dana'), password: ' p w ' }]);
  });

  it('wrong username and wrong password read the same (no account enumeration)', async () => {
    const { sb } = fakeClient({ signIn: { message: 'Invalid login credentials', status: 400 } });
    expect(await signInWithUsername(sb, 'nobody', 'x')).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
  });

  it('rate limits and network failures keep their meaning', async () => {
    expect(
      await signInWithUsername(
        fakeClient({ signIn: { message: 'Request rate limit reached', status: 429 } }).sb,
        'a',
        'b',
      ),
    ).toMatchObject({ reason: 'rate_limited' });
    expect(
      await signInWithUsername(fakeClient({ signIn: { message: 'Failed to fetch' } }).sb, 'a', 'b'),
    ).toMatchObject({ reason: 'network' });
  });
});

describe('registration', () => {
  const token = 'Abc_-1234567890123456789012345678901234567';

  it('sends only the token, username and password, then signs in', async () => {
    const { sb, calls } = fakeClient({});
    expect(await registerWithInvitation(sb, `autokeep://invite?t=${token}`, 'Dana', '1')).toEqual({
      ok: true,
    });
    expect(calls.invoke).toEqual([
      [
        'register',
        { method: 'POST', body: { invitation: token, username: 'Dana', password: '1' } },
      ],
    ]);
    expect(calls.signIn).toHaveLength(1);
  });

  it.each([
    [409, 'username_taken'],
    [410, 'invitation_used'],
    [410, 'invitation_expired'],
    [404, 'invitation_invalid'],
    [400, 'password_too_short'],
    [400, 'password_too_long'],
  ])('maps the server refusal %s %s', async (status, error) => {
    const { sb, calls } = fakeClient({ invoke: { error: httpError(status, { error }) } });
    expect(await registerWithInvitation(sb, token, 'Dana', 'pw')).toEqual({
      ok: false,
      reason: error,
    });
    expect(calls.signIn).toHaveLength(0);
  });

  it('an unknown server answer or a network failure is not misreported', async () => {
    const unknown = fakeClient({ invoke: { error: httpError(500, { error: 'server' }) } }).sb;
    expect(await registerWithInvitation(unknown, token, 'Dana', 'pw')).toMatchObject({
      reason: 'unknown',
    });
    const offline = fakeClient({ invoke: { error: { name: 'FunctionsFetchError' } } }).sb;
    expect(await registerWithInvitation(offline, token, 'Dana', 'pw')).toMatchObject({
      reason: 'network',
    });
  });

  it('a malformed invitation never reaches the server', async () => {
    const { sb, calls } = fakeClient({});
    expect(await registerWithInvitation(sb, 'nope', 'Dana', 'pw')).toMatchObject({
      reason: 'invitation_invalid',
    });
    expect(calls.invoke).toHaveLength(0);
  });
});

describe('password change', () => {
  it('reports Supabase Auth constraints as such', async () => {
    const short = { message: 'Password should be at least 6 characters.', code: 'weak_password' };
    expect(await changePassword(fakeClient({ update: short }).sb, '1')).toMatchObject({
      reason: 'password_too_short',
    });
    const long = { message: 'Password cannot be longer than 72 characters', status: 400 };
    expect(await changePassword(fakeClient({ update: long }).sb, 'x')).toMatchObject({
      reason: 'password_too_long',
    });
    const same = {
      message: 'New password should be different from the old password.',
      code: 'same_password',
    };
    expect(await changePassword(fakeClient({ update: same }).sb, 'x')).toMatchObject({
      reason: 'same_password',
    });
    expect(await changePassword(fakeClient({}).sb, 'x')).toEqual({ ok: true });
  });
});
