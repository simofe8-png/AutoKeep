import type { SupabaseClient } from '@supabase/supabase-js';

import { AdoptionCloudError, type AdoptionCloud } from './adoption';
import { rowKey, type AdoptionTable, type CloudRow } from './bundle';

const CHUNK = 150;

function classify(error: { message?: string; code?: string; status?: number }): AdoptionCloudError {
  const msg = error.message ?? 'unknown';
  if (error.code === '42501' || error.status === 401 || /JWT|auth/i.test(msg)) {
    return new AdoptionCloudError('not_signed_in', msg);
  }
  if (/fetch|network|timeout/i.test(msg)) return new AdoptionCloudError('network', msg);
  return new AdoptionCloudError('server_rejected', msg);
}

/** Supabase implementation of the adoption port (RPC + RLS-scoped read-back). */
export function supabaseAdoptionCloud(sb: SupabaseClient): AdoptionCloud {
  return {
    async currentUserId() {
      const { data } = await sb.auth.getUser();
      return data.user?.id ?? null;
    },

    async adopt(bundle) {
      const { data, error } = await sb.rpc('adopt_local_data', { p_bundle: bundle });
      if (error) throw classify(error);
      return (data ?? {}) as Record<string, number>;
    },

    async existingKeys(table: AdoptionTable, rows: CloudRow[]) {
      const found = new Set<string>();
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        if (table === 'service_event_documents') {
          const ids = [...new Set(chunk.map((r) => String(r.service_event_id)))];
          const { data, error } = await sb
            .from(table)
            .select('service_event_id, document_id')
            .in('service_event_id', ids);
          if (error) throw classify(error);
          for (const r of data ?? []) found.add(rowKey(table, r));
        } else {
          const { data, error } = await sb
            .from(table)
            .select('id')
            .in(
              'id',
              chunk.map((r) => String(r.id)),
            );
          if (error) throw classify(error);
          for (const r of data ?? []) found.add(String(r.id));
        }
      }
      return found;
    },
  };
}
