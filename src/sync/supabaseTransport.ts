import type { SupabaseClient } from '@supabase/supabase-js';

import {
  SyncNetworkError,
  SyncRejectedError,
  type Cursor,
  type SyncTransport,
  type Tombstone,
} from './engine';
import type { Row, SyncTable } from './mapping';

interface ErrorLike {
  message?: string;
  code?: string;
}

/**
 * Transient (retry with backoff): no HTTP status (network), 401 (session refresh), 408, 429, 5xx.
 * Anything else is the server refusing the request itself (4xx): permanent for that request.
 */
function check(error: ErrorLike | null, status: number): void {
  if (!error) return;
  const msg = error.message ?? 'sync request failed';
  const transient = !status || status === 401 || status === 408 || status === 429 || status >= 500;
  throw transient ? new SyncNetworkError(msg) : new SyncRejectedError(msg);
}

/**
 * Keyset filter strictly after (ts, key), or from ts on (inclusive) when key is null. The link
 * table has a composite key "service_event_id|document_id", ordered column by column.
 */
export function afterCursor(table: SyncTable | 'sync_tombstones', cursor: Cursor): string {
  const ts = cursor.ts;
  if (cursor.key === null) return `server_updated_at.gte.${ts}`;
  if (table === 'service_event_documents') {
    const [s, d] = cursor.key.split('|');
    return (
      `server_updated_at.gt.${ts},` +
      `and(server_updated_at.eq.${ts},service_event_id.gt.${s}),` +
      `and(server_updated_at.eq.${ts},service_event_id.eq.${s},document_id.gt.${d})`
    );
  }
  const idCol = table === 'sync_tombstones' ? 'entity_id' : 'id';
  return `server_updated_at.gt.${ts},and(server_updated_at.eq.${ts},${idCol}.gt.${cursor.key})`;
}

/** Supabase implementation of the sync transport (RLS-scoped PostgREST + sync_push RPC). */
export function supabaseSyncTransport(sb: SupabaseClient): SyncTransport {
  return {
    async push(ops) {
      const { data, error, status } = await sb.rpc('sync_push', { p_ops: ops });
      check(error, status);
      return data ?? [];
    },

    async pull(table, cursor, limit) {
      let q = sb.from(table).select('*').order('server_updated_at', { ascending: true });
      q =
        table === 'service_event_documents'
          ? q.order('service_event_id').order('document_id')
          : q.order('id', { ascending: true });
      if (cursor) q = q.or(afterCursor(table, cursor));
      const { data, error, status } = await q.limit(limit);
      check(error, status);
      return (data ?? []) as Row[];
    },

    async pullTombstones(cursor, limit) {
      let q = sb
        .from('sync_tombstones')
        .select('entity_table, entity_id, server_updated_at')
        .order('server_updated_at')
        .order('entity_id');
      if (cursor) q = q.or(afterCursor('sync_tombstones', cursor));
      const { data, error, status } = await q.limit(limit);
      check(error, status);
      return (data ?? []) as Tombstone[];
    },
  };
}
