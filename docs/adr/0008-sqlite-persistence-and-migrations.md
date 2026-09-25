# ADR-0008: SQLite persistence, migrations and repository rules

- Status: accepted
- Date: 2026-09-26

## Context

AutoKeep is local-first (ADR-0002). Data must survive restarts and stay strictly vehicle-scoped. It also has to be testable without a device.

## Decision

- **Port:** `SqlDatabase` (`src/persistence/db/types.ts`) with serialized, atomic `transaction()`.
  - App: `expo-sqlite` (`openDatabaseAsync`, WAL, `foreign_keys=ON`, `withExclusiveTransactionAsync`).
  - Tests: `sql.js` (real SQLite as WASM) in `src/persistence/testing` (test-only, never imported by app code).
- **Migrations:** numbered 1..n, forward-only, append-only once released, each applied atomically and recorded in `schema_migrations`. The runner refuses to open a database newer than the app, so it never downgrades or drops data.
- **Schema rules:**
  - Every vehicle-scoped table has `vehicle_id NOT NULL` with an FK to `vehicles(id) ON DELETE CASCADE`.
  - Cascades run only through the explicit permanent-deletion command.
  - Entity rows carry `created_at`, `updated_at` and `version`.
- **Repositories:**
  - Every vehicle-scoped read filters by an explicit `vehicleId`.
  - Updates use optimistic concurrency (`WHERE version = expected`).
  - Multi-row writes are atomic.
  - Service events refuse document links from another vehicle.
- **IDs:** UUIDv4 generated on device (`expo-crypto`), so offline creation is safe for later sync.
- **Active vehicle:** persisted in `settings`. It resolves only to an existing active vehicle and is cleared on archive or deletion.

## Consequences

- Repository tests run real SQL in CI.
- On-device behavior is verified by the dev-only `/dev/db-check` route, whose results are recorded in task-plan T050.
- Schema changes require a new migration and a migration test.
