/**
 * TEST-ONLY in-memory account backend: invitation registration and Username + Password sign-in
 * (mirroring the `register` function and Supabase Auth rules), an atomic/idempotent adoption
 * store (like the adopt_local_data RPC) and a sync transport, each with switchable faults.
 */
import { invitationToken, type AuthResult, type DeleteAccountResult } from '@/cloud/auth';
import { normalizeUsername, usernameProblem } from '@/cloud/username';
import { ADOPTION_TABLES, rowKey, type AdoptionBundle } from '@/account/bundle';
import { AdoptionCloudError } from '@/account/adoption';
import { SyncNetworkError, type PushOp, type PushResult } from '@/sync/engine';

import type { AccountBackend } from './backend';

/** An unused test invitation token (url-safe, like a real one). */
export const VALID_INVITATION = 'test-invitation-0000000000000000000000000000';
export const TEST_PASSWORD = 'pass12';
/** Supabase Auth's floor (a provider constraint, not an AutoKeep rule). */
const AUTH_MIN_PASSWORD = 6;

type InvitationState = 'unused' | 'used' | 'expired' | 'revoked';

export class MemoryAccountBackend implements AccountBackend {
  /** Signed-in username (display form), or null. */
  username: string | null = null;
  offline = false;
  readonly accounts = new Map<string, { username: string; password: string }>();
  readonly invitations = new Map<string, InvitationState>([[VALID_INVITATION, 'unused']]);
  readonly stored = new Map<string, Set<string>>();
  readonly pushed: PushOp[] = [];
  readonly objects = new Map<string, Uint8Array>();

  /** Test setup: an existing account. */
  addAccount(username: string, password = TEST_PASSWORD) {
    this.accounts.set(normalizeUsername(username), { username: username.trim(), password });
  }

  /** Test setup: an existing account, signed in on this device. */
  async signInAs(username: string) {
    this.addAccount(username);
    return this.signIn(username, TEST_PASSWORD);
  }

  /** Storage/user key of the signed-in account (mirrors `<user id>/...` paths). */
  private get key(): string | null {
    return this.username === null ? null : `user:${normalizeUsername(this.username)}`;
  }

  originals = {
    upload: async (path: string, bytes: Uint8Array) => {
      if (this.offline) throw new Error('offline');
      // Mirrors storage RLS: only under the signed-in user's own folder.
      if (!this.key || !path.startsWith(`${this.key}/`)) throw new Error('forbidden');
      this.objects.set(path, bytes);
    },
    download: async (path: string) => {
      if (this.offline || !this.key || !path.startsWith(`${this.key}/`)) return null;
      return this.objects.get(path) ?? null;
    },
    removeFolder: async (prefix: string) => {
      if (this.offline) throw new Error('offline');
      if (!this.key || !prefix.startsWith(`${this.key}/`)) throw new Error('forbidden');
      for (const k of [...this.objects.keys()])
        if (k.startsWith(`${prefix}/`)) this.objects.delete(k);
    },
  };

  async signIn(username: string, password: string): Promise<AuthResult> {
    if (this.offline) return { ok: false, reason: 'network' };
    const account = this.accounts.get(normalizeUsername(username));
    if (!account || account.password !== password) {
      return { ok: false, reason: 'invalid_credentials' };
    }
    this.username = account.username;
    return { ok: true };
  }

  async register(invitation: string, username: string, password: string): Promise<AuthResult> {
    if (this.offline) return { ok: false, reason: 'network' };
    const token = invitationToken(invitation);
    const state = token ? this.invitations.get(token) : undefined;
    if (!token || !state || state === 'revoked') return { ok: false, reason: 'invitation_invalid' };
    if (state === 'used') return { ok: false, reason: 'invitation_used' };
    if (state === 'expired') return { ok: false, reason: 'invitation_expired' };
    if (usernameProblem(username)) return { ok: false, reason: 'invalid_username' };
    if (this.accounts.has(normalizeUsername(username))) {
      return { ok: false, reason: 'username_taken' };
    }
    if ([...password].length < AUTH_MIN_PASSWORD) {
      return { ok: false, reason: 'password_too_short' };
    }
    this.addAccount(username, password);
    this.invitations.set(token, 'used');
    return this.signIn(username, password);
  }

  async changePassword(password: string): Promise<AuthResult> {
    if (this.offline) return { ok: false, reason: 'network' };
    const account = this.username ? this.accounts.get(normalizeUsername(this.username)) : null;
    if (!account) return { ok: false, reason: 'unknown' };
    if ([...password].length < AUTH_MIN_PASSWORD) {
      return { ok: false, reason: 'password_too_short' };
    }
    if (password === account.password) return { ok: false, reason: 'same_password' };
    account.password = password;
    return { ok: true };
  }

  async currentUsername() {
    return this.username;
  }

  async signOut() {
    this.username = null;
    this.emit();
  }

  /** Fault injection for account deletion: 'network' | 'server' | null. */
  deleteFails: 'network' | 'server' | null = null;
  deletedAccounts: string[] = [];
  active = true;
  private listeners = new Set<(username: string | null) => void>();

  private emit() {
    for (const l of this.listeners) l(this.username);
  }

  async deleteAccount(): Promise<DeleteAccountResult> {
    if (this.offline || this.deleteFails === 'network') return { ok: false, reason: 'network' };
    if (this.username === null || !this.key) return { ok: false, reason: 'not_signed_in' };
    if (this.deleteFails === 'server') return { ok: false, reason: 'server' };
    // Mirrors the function: originals first, then the account (and its rows).
    const prefix = `${this.key}/`;
    for (const k of [...this.objects.keys()]) if (k.startsWith(prefix)) this.objects.delete(k);
    this.stored.clear();
    this.accounts.delete(normalizeUsername(this.username));
    this.deletedAccounts.push(this.username);
    this.username = null;
    this.emit();
    return { ok: true };
  }

  onSessionChange(listener: (username: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setActive(active: boolean) {
    this.active = active;
  }

  /** Test hook: the session ended elsewhere (e.g. refresh failed, signed out on the server). */
  expireSession() {
    this.username = null;
    this.emit();
  }

  adoption = {
    currentUserId: async () => this.key,
    adopt: async (bundle: AdoptionBundle) => {
      if (this.offline) throw new AdoptionCloudError('network', 'offline');
      const counts: Record<string, number> = {};
      for (const t of ADOPTION_TABLES) {
        const set = this.stored.get(t) ?? new Set<string>();
        const before = set.size;
        for (const r of bundle[t]) set.add(rowKey(t, r));
        this.stored.set(t, set);
        counts[t] = set.size - before;
      }
      return counts;
    },
    existingKeys: async (t: (typeof ADOPTION_TABLES)[number]) =>
      this.stored.get(t) ?? new Set<string>(),
  };

  transport = {
    push: async (ops: PushOp[]): Promise<PushResult[]> => {
      if (this.offline) throw new SyncNetworkError('offline');
      this.pushed.push(...ops);
      return ops.map((o) => ({ op_id: o.op_id, status: 'applied' as const }));
    },
    pull: async () => {
      if (this.offline) throw new SyncNetworkError('offline');
      return [];
    },
    pullTombstones: async () => [],
  };
}
