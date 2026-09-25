/**
 * Row mapping between the local SQLite schema and the cloud Postgres schema (ADR-0008/0011).
 * Shared by account adoption (M08) and sync (M09).
 */
export const SYNC_TABLES = [
  'profiles',
  'vehicles',
  'odometer_readings',
  'documents',
  'extractions',
  'schedules',
  'service_events',
  'service_actions',
  'service_event_documents',
  'garage_recommendations',
  'deferred_items',
  'alerts',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

/** Records that never change after creation: concurrent creations on two devices are both kept. */
export const APPEND_ONLY: ReadonlySet<SyncTable> = new Set([
  'odometer_readings',
  'documents',
  'extractions',
  'schedules',
  'service_events',
  'service_actions',
  'service_event_documents',
  'garage_recommendations',
]);

export type Row = Record<string, unknown>;

const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
const str = (v: unknown) => (v === null || v === undefined ? null : JSON.stringify(v));
const bool = (v: unknown) => v === 1 || v === true;
const int = (v: unknown) => (v === true || v === 1 ? 1 : 0);

/** Normalizes Postgres timestamptz text ("…+00:00") to the local ISO "…Z" form. */
function isoTs(v: unknown): unknown {
  return typeof v === 'string' && /T/.test(v) ? new Date(v).toISOString() : v;
}
const TS_COLS = [
  'created_at',
  'updated_at',
  'archived_at',
  'confirmed_at',
  'raised_at',
  'retrieved_at',
];

type Pair = { toCloud: (r: Row) => Row; toLocal: (r: Row) => Row };

const jsonCols = (pairs: [local: string, cloud: string][]): Pair => ({
  toCloud: (r) => {
    const out: Row = { ...r };
    for (const [l, c] of pairs) {
      out[c] = parse(r[l]);
      delete out[l];
    }
    return out;
  },
  toLocal: (r) => {
    const out: Row = { ...r };
    for (const [l, c] of pairs) {
      out[l] = str(r[c]);
      delete out[c];
    }
    return out;
  },
});

const identity: Pair = { toCloud: (r) => ({ ...r }), toLocal: (r) => ({ ...r }) };

const MAP: Record<SyncTable, Pair> = {
  profiles: {
    // account_user_id is device-local bookkeeping; never sent, never overwritten by a pull.
    toCloud: ({ account_user_id: _local, ...r }) => r,
    toLocal: (r) => ({ ...r }),
  },
  vehicles: {
    toCloud: ({ owner_profile_id, ...r }) => ({ ...r, profile_id: owner_profile_id }),
    toLocal: ({ profile_id, ...r }) => ({ ...r, owner_profile_id: profile_id }),
  },
  odometer_readings: identity,
  documents: jsonCols([['verification_json', 'verification']]),
  extractions: jsonCols([
    ['payload_json', 'payload'],
    ['uncertain_json', 'uncertain_fields'],
  ]),
  schedules: jsonCols([
    ['intervals_json', 'intervals'],
    ['evidence_json', 'evidence'],
    ['applicability_json', 'applicability'],
    ['verification_json', 'verification'],
  ]),
  service_events: jsonCols([['verification_json', 'verification']]),
  service_actions: {
    toCloud: (r) => ({ ...r, performed: bool(r.performed), unlisted: bool(r.unlisted) }),
    toLocal: (r) => ({ ...r, performed: int(r.performed), unlisted: int(r.unlisted) }),
  },
  service_event_documents: identity,
  garage_recommendations: identity,
  deferred_items: identity,
  alerts: jsonCols([['basis_json', 'basis']]),
};

export function toCloudRow(table: SyncTable, local: Row): Row {
  return MAP[table].toCloud(local);
}

/** Maps a pulled cloud row to local columns, dropping cloud-only bookkeeping. */
export function toLocalRow(table: SyncTable, cloud: Row): Row {
  const { owner_id: _o, server_updated_at: _s, ...rest } = cloud;
  const mapped = MAP[table].toLocal(rest);
  for (const c of TS_COLS) if (c in mapped) mapped[c] = isoTs(mapped[c]);
  return mapped;
}

/** Entity key (composite for the link table). */
export function entityKey(table: SyncTable, row: Row): string {
  return table === 'service_event_documents'
    ? `${String(row.service_event_id)}|${String(row.document_id)}`
    : String(row.id);
}
