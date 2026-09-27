import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdoptionCloud } from '@/account/adoption';
import { supabaseAdoptionCloud } from '@/account/cloudAdoption';
import {
  deleteAccount,
  requestEmailCode,
  signOut,
  verifyEmailCode,
  type AuthResult,
  type DeleteAccountResult,
} from '@/cloud/auth';
import type { SyncTransport } from '@/sync/engine';
import { supabaseSyncTransport } from '@/sync/supabaseTransport';

/**
 * Account backend port (M19): passwordless sign-in, adoption of local data and sync transport.
 * Provider-independent; the Supabase implementation exists only when cloud config is present —
 * without it the app stays fully usable locally and says that cloud backup is unavailable.
 */
export interface AccountBackend {
  requestCode(email: string): Promise<AuthResult>;
  verifyCode(email: string, code: string): Promise<AuthResult>;
  /** Signed-in account email, or null. */
  currentEmail(): Promise<string | null>;
  /** Signs out this device only; the account and other devices are unaffected. */
  signOut(): Promise<void>;
  /**
   * Permanently deletes the account on the server: every backed-up original first, then the
   * account itself (all rows cascade). Never reports success unless all of it is gone.
   */
  deleteAccount(): Promise<DeleteAccountResult>;
  /** Session changes (signed out, refresh failed, account deleted). Returns an unsubscribe. */
  onSessionChange(listener: (email: string | null) => void): () => void;
  /** Token auto-refresh runs only while the app is in the foreground (React Native guidance). */
  setActive(active: boolean): void;
  adoption: AdoptionCloud;
  transport: SyncTransport;
  /**
   * Document originals in the account's PRIVATE bucket (path `<user>/<vehicle>/<document>`,
   * enforced by storage RLS). Downloads use short-lived signed URLs only.
   */
  originals: {
    upload(path: string, bytes: Uint8Array, mimeType: string): Promise<void>;
    download(path: string): Promise<Uint8Array | null>;
    /**
     * Removes every original under `<user>/<vehicle>` (permanent vehicle deletion). Storage RLS
     * only allows this while the vehicle row still exists, so it runs BEFORE the deletion is pushed.
     */
    removeFolder(prefix: string): Promise<void>;
  };
}

/** Private-bucket path of a document original (first two folders are checked by storage RLS). */
export function originalPath(userId: string, vehicleId: string, documentId: string): string {
  return `${userId}/${vehicleId}/${documentId}`;
}

export function supabaseAccountBackend(sb: SupabaseClient): AccountBackend {
  return {
    requestCode: (email) => requestEmailCode(sb, email),
    verifyCode: (email, code) => verifyEmailCode(sb, email, code),
    currentEmail: async () => (await sb.auth.getSession()).data.session?.user.email ?? null,
    signOut: () => signOut(sb),
    deleteAccount: () => deleteAccount(sb),
    onSessionChange(listener) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        listener(session?.user.email ?? null);
      });
      return () => data.subscription.unsubscribe();
    },
    setActive(active) {
      if (active) void sb.auth.startAutoRefresh();
      else void sb.auth.stopAutoRefresh();
    },
    adoption: supabaseAdoptionCloud(sb),
    transport: supabaseSyncTransport(sb),
    originals: {
      async upload(path, bytes, mimeType) {
        // Insert-only (P2A): an original is stored once and never overwritten. A retry after a
        // lost response finds it already stored, which is success.
        const { error } = await sb.storage
          .from('documents')
          .upload(path, bytes, { contentType: mimeType, upsert: false });
        if (!error) return;
        const status = String((error as { statusCode?: string | number }).statusCode ?? '');
        if (status === '409' || /already exists|duplicate/i.test(error.message)) return;
        throw new Error(`upload: ${error.message}`);
      },
      async download(path) {
        const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
        if (error || !data?.signedUrl) return null;
        const r = await fetch(data.signedUrl);
        if (!r.ok) return null;
        return new Uint8Array(await r.arrayBuffer());
      },
      async removeFolder(prefix) {
        for (;;) {
          const { data, error } = await sb.storage.from('documents').list(prefix, { limit: 100 });
          if (error) throw new Error(`list: ${error.message}`);
          if (!data || data.length === 0) return;
          const { error: rmError } = await sb.storage
            .from('documents')
            .remove(data.map((o) => `${prefix}/${o.name}`));
          if (rmError) throw new Error(`remove: ${rmError.message}`);
          if (data.length < 100) return;
        }
      },
    },
  };
}
