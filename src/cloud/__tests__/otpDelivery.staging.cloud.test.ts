import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { adminClient, localStatus, stagingTarget } from '../testing/localStack';

/**
 * P2C pre-gate: the app's REAL 6-digit e-mail-code flow on hosted staging with custom SMTP
 * (dedicated Gmail account, no custom domain), delivered to ARBITRARY external inboxes that are
 * not members of the Supabase organization (disposable mail.tm inboxes; test data only).
 * Runs only with AUTOKEEP_TEST_TARGET=staging and AUTOKEEP_SMTP_VALIDATION=1.
 * Expiry is checked separately (AUTOKEEP_SMTP_EXPIRY=1) because it waits OTP expiry + 1 min.
 */

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process!.env;
const run = stagingTarget() && env.AUTOKEEP_SMTP_VALIDATION === '1' ? describe : describe.skip;
const MAILTM = 'https://api.mail.tm';
const MIN = 60_000;

interface Inbox {
  address: string;
  token: string;
  id: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function mailtm<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const r = await fetch(`${MAILTM}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok && r.status !== 204) throw new Error(`mail.tm ${path}: ${r.status}`);
  return (r.status === 204 ? null : await r.json()) as T;
}

async function newInbox(tag: string): Promise<Inbox> {
  const domains = await mailtm<{ 'hydra:member': { domain: string }[] }>('/domains');
  const address = `ak-${tag}-${Date.now()}@${domains['hydra:member'][0].domain}`;
  const password = `pw-${Math.random().toString(36).slice(2)}A1!`;
  const acc = await mailtm<{ id: string }>('/accounts', {
    method: 'POST',
    body: JSON.stringify({ address, password }),
  });
  const { token } = await mailtm<{ token: string }>('/token', {
    method: 'POST',
    body: JSON.stringify({ address, password }),
  });
  return { address, token, id: acc.id };
}

/** Waits for a NEW message and returns its 6-digit code (and subject), or throws on timeout. */
async function nextCode(
  inbox: Inbox,
  seen: Set<string>,
  timeoutMs = 3 * MIN,
): Promise<{ code: string; subject: string; ms: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const list = await mailtm<{ 'hydra:member': { id: string; subject: string }[] }>(
      '/messages',
      {},
      inbox.token,
    );
    for (const m of list['hydra:member']) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const full = await mailtm<{ text?: string; html?: string[] }>(
        `/messages/${m.id}`,
        {},
        inbox.token,
      );
      const body = `${full.text ?? ''} ${(full.html ?? []).join(' ')}`;
      const code = /\b(\d{6})\b/.exec(body)?.[1];
      if (!code) throw new Error(`message without a 6-digit code: ${m.subject}`);
      return { code, subject: m.subject, ms: Date.now() - start };
    }
    await sleep(3000);
  }
  throw new Error(`no e-mail within ${timeoutMs / 1000}s`);
}

function device(): SupabaseClient {
  const s = localStatus();
  return createClient(s.API_URL, s.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const request = (sb: SupabaseClient, email: string) =>
  sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });

async function cleanup(inboxes: Inbox[]) {
  const admin = adminClient();
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const i of inboxes) {
    const u = data.users.find((x) => x.email === i.address);
    if (u) await admin.auth.admin.deleteUser(u.id);
    await mailtm(`/accounts/${i.id}`, { method: 'DELETE' }, i.token).catch(() => undefined);
  }
}

run('zero-domain e-mail codes through Gmail SMTP (P2C pre-gate)', () => {
  const inboxes: Inbox[] = [];
  afterAll(() => cleanup(inboxes));

  it(
    'two arbitrary external addresses receive a 6-digit code that works once',
    async () => {
      for (const tag of ['a', 'b']) {
        const inbox = await newInbox(tag);
        inboxes.push(inbox);
        const seen = new Set<string>();
        const sent = await request(device(), inbox.address);
        expect(sent.error).toBeNull();
        const { code, subject, ms } = await nextCode(inbox, seen);
        // eslint-disable-next-line no-console
        console.log(`DELIVERED ${tag}: ${ms} ms, subject="${subject}"`);
        expect(code).toMatch(/^\d{6}$/);

        const wrong = await device().auth.verifyOtp({
          email: inbox.address,
          token: code === '000000' ? '111111' : '000000',
          type: 'email',
        });
        expect(wrong.error).not.toBeNull();

        const sb = device();
        const ok = await sb.auth.verifyOtp({ email: inbox.address, token: code, type: 'email' });
        expect(ok.error).toBeNull();
        expect(ok.data.session?.user.email).toBe(inbox.address);

        const reused = await device().auth.verifyOtp({
          email: inbox.address,
          token: code,
          type: 'email',
        });
        expect(reused.error).not.toBeNull();

        // Session refresh and device-local sign-out on the real hosted session.
        const refreshed = await sb.auth.refreshSession();
        expect(refreshed.error).toBeNull();
        await sb.auth.signOut({ scope: 'local' });
        expect((await sb.auth.getSession()).data.session).toBeNull();
      }
    },
    10 * MIN,
  );

  it(
    'resend: blocked inside the 60 s window, then a new code replaces the old one',
    async () => {
      const inbox = inboxes[0];
      const seen = new Set<string>();
      // Drain what was already delivered.
      const old = await mailtm<{ 'hydra:member': { id: string }[] }>('/messages', {}, inbox.token);
      old['hydra:member'].forEach((m) => seen.add(m.id));

      await sleep(61_000);
      expect((await request(device(), inbox.address)).error).toBeNull();
      const first = await nextCode(inbox, seen);
      const tooSoon = await request(device(), inbox.address);
      expect(tooSoon.error).not.toBeNull(); // rate limited (per-address window)
      // eslint-disable-next-line no-console
      console.log('RESEND TOO SOON:', tooSoon.error?.status, tooSoon.error?.message);

      await sleep(61_000);
      expect((await request(device(), inbox.address)).error).toBeNull();
      const second = await nextCode(inbox, seen);
      const stale = await device().auth.verifyOtp({
        email: inbox.address,
        token: first.code,
        type: 'email',
      });
      if (first.code !== second.code) expect(stale.error).not.toBeNull();
      const fresh = await device().auth.verifyOtp({
        email: inbox.address,
        token: second.code,
        type: 'email',
      });
      expect(fresh.error).toBeNull();
    },
    10 * MIN,
  );

  (env.AUTOKEEP_SMTP_EXPIRY === '1' ? it : it.skip)(
    'an unused code expires after the configured OTP expiry (900 s)',
    async () => {
      const inbox = inboxes[1];
      const seen = new Set<string>();
      const old = await mailtm<{ 'hydra:member': { id: string }[] }>('/messages', {}, inbox.token);
      old['hydra:member'].forEach((m) => seen.add(m.id));
      await sleep(61_000);
      expect((await request(device(), inbox.address)).error).toBeNull();
      const { code } = await nextCode(inbox, seen);
      await sleep(16 * MIN);
      const expired = await device().auth.verifyOtp({
        email: inbox.address,
        token: code,
        type: 'email',
      });
      expect(expired.error).not.toBeNull();
    },
    25 * MIN,
  );
});
