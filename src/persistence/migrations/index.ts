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
];
