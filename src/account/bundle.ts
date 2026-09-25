import type { SqlExecutor } from '@/persistence';

/**
 * Snapshot of all device-local rows, mapped to the cloud schema (supabase/migrations). Settings are
 * device-only and never uploaded. Row IDs are preserved (client-generated UUIDs, ADR-0002).
 */
export const ADOPTION_TABLES = [
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
export type AdoptionTable = (typeof ADOPTION_TABLES)[number];

export type CloudRow = Record<string, unknown>;
export type AdoptionBundle = Record<AdoptionTable, CloudRow[]>;

type Row = Record<string, unknown>;
const json = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
const bool = (v: unknown) => v === 1 || v === true;

/** Local column → cloud column mapping where they differ. */
const mappers: Record<AdoptionTable, (r: Row) => CloudRow> = {
  profiles: ({ account_user_id: _ignored, ...r }) => r,
  vehicles: ({ owner_profile_id, ...r }) => ({ ...r, profile_id: owner_profile_id }),
  odometer_readings: (r) => r,
  documents: ({ verification_json, ...r }) => ({ ...r, verification: json(verification_json) }),
  extractions: ({ payload_json, uncertain_json, ...r }) => ({
    ...r,
    payload: json(payload_json),
    uncertain_fields: json(uncertain_json),
  }),
  schedules: ({ intervals_json, evidence_json, applicability_json, verification_json, ...r }) => ({
    ...r,
    intervals: json(intervals_json),
    evidence: json(evidence_json),
    applicability: json(applicability_json),
    verification: json(verification_json),
  }),
  service_events: ({ verification_json, ...r }) => ({
    ...r,
    verification: json(verification_json),
  }),
  service_actions: (r) => ({ ...r, performed: bool(r.performed), unlisted: bool(r.unlisted) }),
  service_event_documents: (r) => r,
  garage_recommendations: (r) => r,
  deferred_items: (r) => r,
  alerts: ({ basis_json, ...r }) => ({ ...r, basis: json(basis_json) }),
};

export async function buildAdoptionBundle(db: SqlExecutor): Promise<AdoptionBundle> {
  const bundle = {} as AdoptionBundle;
  for (const table of ADOPTION_TABLES) {
    const rows = await db.all<Row>(`SELECT * FROM ${table}`);
    bundle[table] = rows.map(mappers[table]);
  }
  return bundle;
}

/** Row identity used for read-back verification (composite key for the link table). */
export function rowKey(table: AdoptionTable, row: CloudRow): string {
  return table === 'service_event_documents'
    ? `${String(row.service_event_id)}|${String(row.document_id)}`
    : String(row.id);
}

export function bundleSize(b: AdoptionBundle): number {
  return ADOPTION_TABLES.reduce((n, t) => n + b[t].length, 0);
}
