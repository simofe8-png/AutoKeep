/**
 * TEST-ONLY in-memory account backend: OTP with a fixed valid code, an atomic/idempotent adoption
 * store (like the adopt_local_data RPC) and a sync transport, each with switchable faults.
 */
import type { AuthResult } from '@/cloud/auth';
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
