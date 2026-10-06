import type { Migration } from './runner';
import { V2_SYNC, V3_SYNC_PARKED } from './v2_sync';

/**
 * Schema history. Append-only: add a new migration for every change (ADR-0008).
 * Every vehicle-scoped table carries `vehicle_id` (invariant 14). Entity rows carry
 * created_at / updated_at / version for sync (ADR-0002).
 */
const META = `created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1`;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    up: `
CREATE TABLE profiles (
  id TEXT PRIMARY KEY,
  account_user_id TEXT,
  ${META}
);

CREATE TABLE vehicles (
  id TEXT PRIMARY KEY,
  owner_profile_id TEXT NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL CHECK (type IN ('car','motorcycle','scooter')),
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  trim TEXT, model_code TEXT, engine TEXT, fuel TEXT, transmission TEXT,
  registration TEXT NOT NULL,
  vin TEXT,
  lifecycle TEXT NOT NULL CHECK (lifecycle IN ('active','archived')),
  archived_at TEXT,
  ${META}
);
CREATE INDEX idx_vehicles_owner ON vehicles(owner_profile_id);

CREATE TABLE odometer_readings (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  value_km INTEGER NOT NULL CHECK (value_km >= 0),
  measured_at TEXT NOT NULL,
  source TEXT NOT NULL,
  ${META}
);
CREATE INDEX idx_odometer_vehicle ON odometer_readings(vehicle_id, measured_at);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  origin TEXT NOT NULL,
  authority TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  page_count INTEGER,
  verification_json TEXT,
  ${META}
);
CREATE INDEX idx_documents_vehicle ON documents(vehicle_id);

CREATE TABLE extractions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  produced_by TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  uncertain_json TEXT NOT NULL,
  ${META}
);
CREATE INDEX idx_extractions_vehicle ON extractions(vehicle_id);

CREATE TABLE sources (
  id TEXT PRIMARY KEY,
  authority TEXT NOT NULL,
  title TEXT NOT NULL,
  publisher TEXT NOT NULL,
  retrieved_from TEXT,
  edition TEXT,
  retrieved_at TEXT,
  document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  ${META}
);

CREATE TABLE schedules (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  intervals_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  applicability_json TEXT NOT NULL,
  verification_json TEXT NOT NULL,
  ${META}
);
CREATE INDEX idx_schedules_vehicle ON schedules(vehicle_id);

CREATE TABLE service_events (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  odometer_km INTEGER NOT NULL,
  garage_name TEXT,
  notes TEXT,
  origin TEXT NOT NULL CHECK (origin IN ('manual','document')),
  extraction_id TEXT,
  authority TEXT NOT NULL,
  verification_json TEXT NOT NULL,
  confirmed_at TEXT NOT NULL,
  ${META}
);
CREATE INDEX idx_service_events_vehicle ON service_events(vehicle_id, date);

CREATE TABLE service_actions (
  id TEXT PRIMARY KEY,
  service_event_id TEXT NOT NULL REFERENCES service_events(id) ON DELETE CASCADE,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('inspection','replacement','other')),
  performed INTEGER NOT NULL CHECK (performed IN (0,1)),
  maintenance_item_id TEXT,
  unlisted INTEGER NOT NULL CHECK (unlisted IN (0,1))
);
CREATE INDEX idx_service_actions_event ON service_actions(service_event_id);

CREATE TABLE service_event_documents (
  service_event_id TEXT NOT NULL REFERENCES service_events(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (service_event_id, document_id)
);

CREATE TABLE garage_recommendations (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  date TEXT NOT NULL,
  garage_name TEXT,
  source_document_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  authority TEXT NOT NULL CHECK (authority IN ('garage_document','user_report')),
  ${META}
);
CREATE INDEX idx_garage_recs_vehicle ON garage_recommendations(vehicle_id);

CREATE TABLE deferred_items (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  maintenance_item_id TEXT NOT NULL,
  deferred_at TEXT NOT NULL,
  service_event_id TEXT REFERENCES service_events(id) ON DELETE SET NULL,
  reason TEXT,
  resolved_by_service_event_id TEXT,
  ${META}
);
CREATE INDEX idx_deferred_vehicle ON deferred_items(vehicle_id);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('upcoming','overdue','deferred','stale_odometer')),
  status TEXT NOT NULL CHECK (status IN ('active','handled','deferred')),
  basis_json TEXT NOT NULL,
  raised_at TEXT NOT NULL,
  snoozed_until TEXT,
  ${META}
);
CREATE INDEX idx_alerts_vehicle ON alerts(vehicle_id, status);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
  },
  V2_SYNC,
  V3_SYNC_PARKED,
  {
    // Vehicle identity: color and engine code (owner request 2026-09-28). Both optional — unknown
    // stays NULL, never inferred. The engine code is distinct from the displacement (`engine`).
    version: 4,
    name: 'vehicle_color_engine_code',
    up: `
ALTER TABLE vehicles ADD COLUMN color TEXT;
ALTER TABLE vehicles ADD COLUMN engine_code TEXT;
`,
  },
  {
    // Exterior phase of the generation (pre-facelift / facelift), from a high-confidence registry
    // rule or the user's own visual confirmation; NULL = unknown (owner decision 2026-09-29).
    version: 5,
    name: 'vehicle_exterior_phase',
    up: `
ALTER TABLE vehicles ADD COLUMN exterior_phase TEXT;
ALTER TABLE vehicles ADD COLUMN exterior_phase_source TEXT;
`,
  },
  {
    // Maintenance knowledge (owner run 2026-09-29, docs/release/MAINTENANCE_M1.md). LOCAL-ONLY
    // tables: they are not in SYNC_TABLES, so nothing reaches the cloud until the prepared cloud
    // migration is approved and applied. Completions link to requirements through the existing,
    // synced service_actions.maintenance_item_id (a deterministic id per vehicle + task).
    version: 6,
    name: 'maintenance_knowledge',
    up: `
CREATE TABLE maintenance_profiles (
  vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  in_service_date TEXT,
  in_service_precision TEXT CHECK (in_service_precision IN ('day','month')),
  in_service_source TEXT CHECK (in_service_source IN ('registry','user')),
  service_regime TEXT,
  usage TEXT CHECK (usage IN ('normal','severe')),
  updated_at TEXT NOT NULL
);

CREATE TABLE knowledge_documents (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  document_id TEXT REFERENCES documents(id) ON DELETE CASCADE,
  origin TEXT NOT NULL CHECK (origin IN ('user_upload','official_download','catalog_edition')),
  title TEXT NOT NULL,
  authority TEXT NOT NULL,
  markets_json TEXT NOT NULL,
  edition TEXT,
  published_on TEXT,
  sha256 TEXT NOT NULL,
  page_count INTEGER,
  authenticity TEXT NOT NULL
    CHECK (authenticity IN ('unconfirmed','owner_confirmed','matched_official_edition','curator_verified')),
  owner_confirmed_at TEXT,
  rights TEXT NOT NULL CHECK (rights IN ('none','structured_facts_only','redistributable')),
  excerpt_policy TEXT NOT NULL CHECK (excerpt_policy IN ('none','short_allowed')),
  coverage_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_knowledge_documents_vehicle ON knowledge_documents(vehicle_id);

CREATE TABLE maintenance_claims (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  task_text TEXT,
  action TEXT NOT NULL CHECK (action IN ('inspection','replacement','adjustment','other')),
  interval_json TEXT NOT NULL,
  applicability_json TEXT NOT NULL,
  locator_json TEXT NOT NULL,
  excerpt TEXT,
  extraction_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('candidate','accepted','rejected')),
  review_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_maintenance_claims_vehicle ON maintenance_claims(vehicle_id);
`,
  },
  {
    // Reusable maintenance knowledge (owner instruction 2026-09-29): verified atomic requirements
    // stored ONCE at their vehicle-class scope — deliberately NOT vehicle-, user- or plate-scoped
    // (no vehicle_id column), so an identical vehicle reuses them before any new research. Local
    // cache of the (future) shared catalog; the cloud table is a prepared, unapplied migration.
    version: 7,
    name: 'knowledge_catalog',
    up: `
CREATE TABLE knowledge_catalog (
  id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL,
  task TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('inspection','replacement','adjustment','other')),
  requirement_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_host TEXT NOT NULL,
  source_sha256 TEXT NOT NULL CHECK (length(source_sha256) = 64),
  source_json TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  superseded_by TEXT,
  conflicts_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_knowledge_catalog_scope ON knowledge_catalog(scope_key, task, action);
`,
  },
  {
    version: 8,
    name: 'discovery_misses',
    // §24: why no reliable schedule was found, per vehicle CLASS (no vehicle, plate, VIN or user
    // column), so the same search failure can be improved later. Local only; not synced.
    up: `
CREATE TABLE discovery_misses (
  class_key TEXT NOT NULL,
  reasons TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (class_key, reasons)
);
`,
  },
  {
    version: 9,
    name: 'vehicle_registry_records',
    // Add Vehicle by plate: every valid Ministry of Transport fact for the vehicle, as normalized
    // at lookup (no statistics; safety features positive only). Vehicle-scoped, local only.
    up: `
CREATE TABLE vehicle_registry_records (
  vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  record_json TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    version: 10,
    name: 'msource',
    // M-SOURCE V1 (ADR-0020). LOCAL ONLY (not in SYNC_TABLES).
    //  - msource_runs: vehicle-scoped run state and the structured run trace (stages, candidates,
    //    access decisions per operation) — no document bytes, no document text beyond ≤ 30-word
    //    evidence excerpts;
    //  - msource_schedules: the latest resolved schedule per vehicle (provenance + evidence) and
    //    the requirements derived from it;
    //  - msource_evidence_cache: structured results per (vehicle CLASS, canonical URL) so an
    //    unchanged source is not downloaded again; no vehicle, plate or VIN column.
    up: `
CREATE TABLE msource_runs (
  run_id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  fingerprint_key TEXT NOT NULL,
  state TEXT NOT NULL,
  status_json TEXT NOT NULL,
  run_json TEXT,
  msource_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_msource_runs_vehicle ON msource_runs(vehicle_id, started_at);

CREATE TABLE msource_schedules (
  vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  run_id TEXT NOT NULL REFERENCES msource_runs(run_id) ON DELETE CASCADE,
  fingerprint_key TEXT NOT NULL,
  status TEXT NOT NULL,
  schedule_json TEXT NOT NULL,
  requirements_json TEXT NOT NULL,
  resolved_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE msource_evidence_cache (
  class_key TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  content_sha256 TEXT NOT NULL CHECK (length(content_sha256) = 64),
  value_json TEXT NOT NULL,
  retrieved_at TEXT NOT NULL,
  PRIMARY KEY (class_key, canonical_url)
);
`,
  },
  {
    version: 11,
    name: 'msource_owner_review',
    // Owner review of items read from the owner's OWN uploaded documents (spec Part A, D-A3).
    // LOCAL ONLY (not in SYNC_TABLES; D-A4: no network sharing of uploads). One decision per
    // proposal key (document sha prefix + obligation), so it survives re-runs of the same document.
    up: `
CREATE TABLE msource_owner_reviews (
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  proposal_key TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
  decided_at TEXT NOT NULL,
  PRIMARY KEY (vehicle_id, proposal_key)
);
`,
  },
  {
    version: 12,
    name: 'msource_owner_review_edit',
    // The owner's correction of an item read from their own document, saved with the decision
    // (owner review). LOCAL ONLY. NULL = accepted as read.
    up: `ALTER TABLE msource_owner_reviews ADD COLUMN edit_json TEXT;`,
  },
  {
    version: 13,
    name: 'model_photo_cache',
    // General model photos (Wikimedia, license-checked; owner decision 2026-10-03). LOCAL ONLY,
    // keyed by MODEL class (no vehicle, plate or VIN column). "none" remembers an empty lookup.
    up: `
CREATE TABLE model_photo_cache (
  class_key TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('found', 'none')),
  record_json TEXT,
  local_uri TEXT,
  checked_at TEXT NOT NULL
);
`,
  },
  {
    version: 14,
    name: 'vehicle_dates',
    // Test and insurance expiry dates the owner enters (owner decision 2026-10-04). LOCAL ONLY
    // (not in SYNC_TABLES). test_until overrides the registry's licence validity (cars) and is the
    // only source for two-wheelers (their registry dataset has no test date).
    up: `
CREATE TABLE vehicle_dates (
  vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  test_until TEXT,
  compulsory_until TEXT,
  other_until TEXT,
  other_kind TEXT CHECK (other_kind IN ('comprehensive', 'third_party')),
  updated_at TEXT NOT NULL
);
`,
  },
  {
    version: 15,
    name: 'manual_schedule_items',
    // Maintenance items the owner enters by hand (owner decision 2026-10-04: the schedule is the
    // owner's). LOCAL ONLY (not in SYNC_TABLES). task = a known task code, or 'custom' with the
    // owner's own title; at least one of interval_km / interval_months.
    up: `
CREATE TABLE manual_schedule_items (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  task TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('replacement', 'inspection')),
  title TEXT NOT NULL,
  interval_km INTEGER,
  interval_months INTEGER,
  last_done_date TEXT,
  last_done_km INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (interval_km IS NOT NULL OR interval_months IS NOT NULL)
);
CREATE INDEX manual_schedule_items_vehicle ON manual_schedule_items(vehicle_id);
`,
  },
  {
    version: 16,
    name: 'manual_schedule_start',
    // Where the owner's item starts counting when its last service is not stated: the odometer and
    // date at entry (owner decision 2026-10-04). LOCAL ONLY.
    up: `
ALTER TABLE manual_schedule_items ADD COLUMN start_km INTEGER;
ALTER TABLE manual_schedule_items ADD COLUMN start_date TEXT;
`,
  },
  {
    version: 17,
    name: 'vehicle_spec',
    // The vehicle's specification as the owner enters it (owner decision 2026-10-05): oil, fluids,
    // tyres and free notes. LOCAL ONLY (not in SYNC_TABLES). Free text; null = not entered.
    up: `
CREATE TABLE vehicle_spec (
  vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  oil_viscosity TEXT,
  oil_standard TEXT,
  oil_capacity TEXT,
  coolant TEXT,
  brake_fluid TEXT,
  transmission_oil TEXT,
  tire_size TEXT,
  tire_pressure_front TEXT,
  tire_pressure_rear TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    version: 18,
    name: 'manual_schedule_note',
    // The owner's note on one row of their table (owner decision 2026-10-05), e.g. a part number.
    // LOCAL ONLY.
    up: `
ALTER TABLE manual_schedule_items ADD COLUMN note TEXT;
`,
  },
  {
    version: 19,
    name: 'service_table',
    // The owner's maintenance table built like the booklet (owner decision 2026-10-06): items ×
    // periodic-service columns with action letters, as JSON; 'proposed' until the owner approves a
    // table read from their booklet. service_table_done = periodic services / rule items the owner
    // recorded as done (with the history record, when there is one). LOCAL ONLY (not in
    // SYNC_TABLES). The table replaces the earlier per-item entry: its rows are removed (owner
    // approval 2026-10-06; recorded services stay in the history).
    up: `
CREATE TABLE service_tables (
  vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'confirmed')),
  source TEXT NOT NULL CHECK (source IN ('manual', 'photo', 'transcribed')),
  document_id TEXT,
  unsure TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE service_table_done (
  id TEXT PRIMARY KEY,
  vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('periodic', 'rule')),
  service_no INTEGER,
  row_id TEXT,
  done_km INTEGER,
  done_date TEXT NOT NULL,
  service_event_id TEXT,
  created_at TEXT NOT NULL,
  CHECK ((kind = 'periodic' AND service_no IS NOT NULL) OR (kind = 'rule' AND row_id IS NOT NULL))
);
CREATE INDEX service_table_done_vehicle ON service_table_done(vehicle_id);
DELETE FROM manual_schedule_items;
`,
  },
];
