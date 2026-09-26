import type { SupabaseClient } from '@supabase/supabase-js';

import type { AdoptionCloud } from '@/account/adoption';
import { supabaseAdoptionCloud } from '@/account/cloudAdoption';
import { requestEmailCode, signOut, verifyEmailCode, type AuthResult } from '@/cloud/auth';
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
  signOut(): Promise<void>;
  adoption: AdoptionCloud;
  transport: SyncTransport;
  /**
   * Document originals in the account's PRIVATE bucket (path `<user>/<vehicle>/<document>`,
   * enforced by storage RLS). Downloads use short-lived signed URLs only.
   */
  originals: {
    upload(path: string, bytes: Uint8Array, mimeType: string): Promise<void>;
    download(path: string): Promise<Uint8Array | null>;
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
    adoption: supabaseAdoptionCloud(sb),
    transport: supabaseSyncTransport(sb),
    originals: {
      async upload(path, bytes, mimeType) {
        const { error } = await sb.storage
          .from('documents')
          .upload(path, bytes, { contentType: mimeType, upsert: true });
        if (error) throw new Error(`upload: ${error.message}`);
      },
      async download(path) {
        const { data, error } = await sb.storage.from('documents').createSignedUrl(path, 60);
        if (error || !data?.signedUrl) return null;
        const r = await fetch(data.signedUrl);
        if (!r.ok) return null;
        return new Uint8Array(await r.arrayBuffer());
      },
    },
  };
}
