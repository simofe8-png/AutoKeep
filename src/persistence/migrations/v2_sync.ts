import type { Migration } from './runner';

/** Tables replicated to the cloud, with the column holding the vehicle scope (for coalescing). */
export const SYNCED_TABLES: readonly { table: string; key: string; vehicleCol: string | null }[] = [
  { table: 'profiles', key: 'NEW.id', vehicleCol: null },
  { table: 'vehicles', key: 'NEW.id', vehicleCol: 'NEW.id' },
  { table: 'odometer_readings', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
  { table: 'documents', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
  { table: 'extractions', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
  { table: 'schedules', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
  { table: 'service_events', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
  { table: 'service_actions', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
  {
    table: 'service_event_documents',
    key: "NEW.service_event_id || '|' || NEW.document_id",
    vehicleCol: '(SELECT vehicle_id FROM service_events WHERE id = NEW.service_event_id)',
  },
  { table: 'garage_recommendations', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
  { table: 'deferred_items', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
  { table: 'alerts', key: 'NEW.id', vehicleCol: 'NEW.vehicle_id' },
];

/** SQLite expression producing a random RFC-4122 v4 UUID string. */
const UUID_EXPR = `(lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))))`;

const HAS_VERSION = new Set([
  'profiles',
  'vehicles',
  'odometer_readings',
  'documents',
  'extractions',
  'schedules',
  'service_events',
  'garage_recommendations',
  'deferred_items',
  'alerts',
]);

function triggers(conflictSet = ''): string {
  return SYNCED_TABLES.map(({ table, key, vehicleCol }) => {
    const vehicle = vehicleCol ?? 'NULL';
    const insertBase = '0';
    const updateBase = HAS_VERSION.has(table) ? 'OLD.version' : '0';
    const enqueue = (base: string) => `
  INSERT INTO sync_outbox (entity_table, entity_id, vehicle_id, op, base_version, created_at)
  VALUES ('${table}', ${key}, ${vehicle}, 'upsert', ${base}, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  ON CONFLICT (entity_table, entity_id) DO UPDATE SET op = 'upsert', op_id = ${UUID_EXPR}, attempts = 0, last_error = NULL${conflictSet};`;
    return `
CREATE TRIGGER sync_ins_${table} AFTER INSERT ON ${table}
WHEN (SELECT applying FROM sync_control WHERE id = 1) = 0
BEGIN${enqueue(insertBase)}
END;
CREATE TRIGGER sync_upd_${table} AFTER UPDATE ON ${table}
WHEN (SELECT applying FROM sync_control WHERE id = 1) = 0
BEGIN${enqueue(updateBase)}
END;`;
  }).join('\n');
}

/**
 * v2: replication bookkeeping (ADR-0011). SQLite triggers enqueue every local change into the
 * outbox inside the same transaction as the change itself. `sync_control.applying = 1`
 * suppresses them while remote rows are being applied. Ops coalesce per entity and keep the
 * ORIGINAL base_version (ON CONFLICT does not touch it).
 */
export const V2_SYNC: Migration = {
  version: 2,
  name: 'sync_outbox',
  up: `
CREATE TABLE sync_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  applying INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sync_control (id, applying) VALUES (1, 0);

CREATE TABLE sync_outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL DEFAULT ${UUID_EXPR},
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  vehicle_id TEXT,
  op TEXT NOT NULL CHECK (op IN ('upsert','delete')),
  base_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  UNIQUE (entity_table, entity_id)
);

-- Last server-accepted state of each mutable entity: the common ancestor for 3-way merges.
CREATE TABLE sync_shadow (
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  row_json TEXT NOT NULL,
  PRIMARY KEY (entity_table, entity_id)
);

CREATE TABLE sync_conflicts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_table TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  field TEXT NOT NULL,
  local_value TEXT,
  remote_value TEXT,
  kept TEXT NOT NULL CHECK (kept IN ('local','remote')),
  detected_at TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);

${triggers()}

-- Permanent vehicle deletion: drop pending child ops (the server cascade removes the rows) and
-- enqueue a single delete op for the vehicle.
CREATE TRIGGER sync_del_vehicles AFTER DELETE ON vehicles
WHEN (SELECT applying FROM sync_control WHERE id = 1) = 0
BEGIN
  DELETE FROM sync_outbox WHERE vehicle_id = OLD.id;
  INSERT INTO sync_outbox (entity_table, entity_id, vehicle_id, op, base_version, created_at)
  VALUES ('vehicles', OLD.id, NULL, 'delete', OLD.version, strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
`,
};

/**
 * v3 (P2A): an op the server permanently refuses is PARKED (kept, reported, retried only after
 * the user changes the entity again) instead of blocking the whole queue. The enqueue triggers
 * are recreated so that a new local change un-parks the op.
 */
export const V3_SYNC_PARKED: Migration = {
  version: 3,
  name: 'sync_outbox_parked',
  up: `
ALTER TABLE sync_outbox ADD COLUMN parked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_outbox ADD COLUMN parked_code TEXT;
${SYNCED_TABLES.map(({ table }) => `DROP TRIGGER sync_ins_${table};\nDROP TRIGGER sync_upd_${table};`).join('\n')}
${triggers(', parked = 0, parked_code = NULL')}
`,
};
