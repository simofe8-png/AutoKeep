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
}

export function supabaseAccountBackend(sb: SupabaseClient): AccountBackend {
  return {
    requestCode: (email) => requestEmailCode(sb, email),
    verifyCode: (email, code) => verifyEmailCode(sb, email, code),
    currentEmail: async () => (await sb.auth.getSession()).data.session?.user.email ?? null,
    signOut: () => signOut(sb),
    adoption: supabaseAdoptionCloud(sb),
    transport: supabaseSyncTransport(sb),
  };
}
