import type { SupabaseClient } from '@supabase/supabase-js';

import { SyncNetworkError, type Cursor, type SyncTransport, type Tombstone } from './engine';
import type { Row, SyncTable } from './mapping';

function wrap(error: { message?: string } | null): void {
  if (error) throw new SyncNetworkError(error.message ?? 'sync request failed');
}

/**
 * Keyset filter: rows strictly after (ts, key). The link table has no single id column, so it is
 * pulled with ts >= cursor and applied idempotently (duplicates at the boundary are harmless).
 */
function afterCursor(table: SyncTable, cursor: Cursor | null): string | null {
  if (!cursor) return null;
  if (table === 'service_event_documents') return null;
  return `server_updated_at.gt.${cursor.ts},and(server_updated_at.eq.${cursor.ts},id.gt.${cursor.key})`;
}

/** Supabase implementation of the sync transport (RLS-scoped PostgREST + sync_push RPC). */
export function supabaseSyncTransport(sb: SupabaseClient): SyncTransport {
  return {
    async push(ops) {
      const { data, error } = await sb.rpc('sync_push', { p_ops: ops });
      wrap(error);
      return data ?? [];
    },

    async pull(table, cursor, limit) {
      let q = sb.from(table).select('*').order('server_updated_at', { ascending: true });
      q =
        table === 'service_event_documents'
          ? q.order('service_event_id').order('document_id')
          : q.order('id', { ascending: true });
      const filter = afterCursor(table, cursor);
      if (filter) q = q.or(filter);
      else if (cursor) q = q.gte('server_updated_at', cursor.ts);
      const { data, error } = await q.limit(limit);
      wrap(error);
      return (data ?? []) as Row[];
    },

    async pullTombstones(cursor, limit) {
      let q = sb
        .from('sync_tombstones')
        .select('entity_table, entity_id, server_updated_at')
        .order('server_updated_at')
        .order('entity_id');
      if (cursor) {
        q = q.or(
          `server_updated_at.gt.${cursor.ts},and(server_updated_at.eq.${cursor.ts},entity_id.gt.${cursor.key})`,
        );
      }
      const { data, error } = await q.limit(limit);
      wrap(error);
      return (data ?? []) as Tombstone[];
    },
  };
}
