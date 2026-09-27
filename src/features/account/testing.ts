/**
 * TEST-ONLY in-memory account backend: OTP with a fixed valid code, an atomic/idempotent adoption
 * store (like the adopt_local_data RPC) and a sync transport, each with switchable faults.
 */
import type { AuthResult, DeleteAccountResult } from '@/cloud/auth';
import { ADOPTION_TABLES, rowKey, type AdoptionBundle } from '@/account/bundle';
import { AdoptionCloudError } from '@/account/adoption';
import { SyncNetworkError, type PushOp, type PushResult } from '@/sync/engine';

import type { AccountBackend } from './backend';

export const VALID_CODE = '123456';

export class MemoryAccountBackend implements AccountBackend {
  email: string | null = null;
  requested: string[] = [];
  offline = false;
  readonly stored = new Map<string, Set<string>>();
  readonly pushed: PushOp[] = [];
  readonly objects = new Map<string, Uint8Array>();

  originals = {
    upload: async (path: string, bytes: Uint8Array) => {
      if (this.offline) throw new Error('offline');
      // Mirrors storage RLS: only under the signed-in user's own folder.
      if (!this.email || !path.startsWith(`user:${this.email}/`)) throw new Error('forbidden');
      this.objects.set(path, bytes);
    },
    download: async (path: string) => {
      if (this.offline || !this.email || !path.startsWith(`user:${this.email}/`)) return null;
      return this.objects.get(path) ?? null;
    },
    removeFolder: async (prefix: string) => {
      if (this.offline) throw new Error('offline');
      if (!this.email || !prefix.startsWith(`user:${this.email}/`)) throw new Error('forbidden');
      for (const k of [...this.objects.keys()])
        if (k.startsWith(`${prefix}/`)) this.objects.delete(k);
    },
  };

  async requestCode(email: string): Promise<AuthResult> {
    if (this.offline) return { ok: false, reason: 'network' };
    this.requested.push(email.trim().toLowerCase());
    return { ok: true };
  }

  async verifyCode(email: string, code: string): Promise<AuthResult> {
    if (this.offline) return { ok: false, reason: 'network' };
    if (code.trim() !== VALID_CODE) return { ok: false, reason: 'invalid_code' };
    this.email = email.trim().toLowerCase();
    return { ok: true };
  }

  async currentEmail() {
    return this.email;
  }

  async signOut() {
    this.email = null;
    this.emit();
  }

  /** Fault injection for account deletion: 'network' | 'server' | null. */
  deleteFails: 'network' | 'server' | null = null;
  deletedAccounts: string[] = [];
  active = true;
  private listeners = new Set<(email: string | null) => void>();

  private emit() {
    for (const l of this.listeners) l(this.email);
  }

  async deleteAccount(): Promise<DeleteAccountResult> {
    if (this.offline || this.deleteFails === 'network') return { ok: false, reason: 'network' };
    if (!this.email) return { ok: false, reason: 'not_signed_in' };
    if (this.deleteFails === 'server') return { ok: false, reason: 'server' };
    // Mirrors the function: originals first, then the account (and its rows).
    const prefix = `user:${this.email}/`;
    for (const k of [...this.objects.keys()]) if (k.startsWith(prefix)) this.objects.delete(k);
    this.stored.clear();
    this.deletedAccounts.push(this.email);
    this.email = null;
    this.emit();
    return { ok: true };
  }

  onSessionChange(listener: (email: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setActive(active: boolean) {
    this.active = active;
  }

  /** Test hook: the session ended elsewhere (e.g. refresh failed, signed out on the server). */
  expireSession() {
    this.email = null;
    this.emit();
  }

  adoption = {
    currentUserId: async () => (this.email ? `user:${this.email}` : null),
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
