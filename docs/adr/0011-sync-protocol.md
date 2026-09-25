# ADR-0011: Sync protocol, outbox and entity-aware conflict resolution

- Status: accepted
- Date: 2026-09-26

## Context

AutoKeep is local-first. Offline changes must survive restarts and sync later, across several devices of one account. Spec §24 forbids blanket server-wins or last-write-wins: two independent service events are both legitimate, while concurrent edits to one entity need real conflict handling.

## Decision

- **Outbox via SQLite triggers (local migration v2):**
  - Every insert or update on a synced table enqueues `(entity, op, base_version)` in the same transaction as the change.
  - Ops coalesce per entity, keep the original `base_version`, and get a fresh `op_id` on every coalesce, so acknowledging an older in-flight payload can't drop a newer change.
  - `sync_control.applying = 1` suppresses the triggers while remote rows are applied.
  - Permanent vehicle deletion drops that vehicle's pending child ops and queues one `delete`.
- **Push:** RPC `sync_push(ops)`, SECURITY INVOKER (RLS and ownership FKs apply).
  - Idempotent through the `sync_applied_ops(op_id)` ledger.
  - Append-only tables are insert-if-absent (`duplicate` otherwise).
  - Mutable tables use compare-and-set on `version = base_version`. On mismatch the result is `conflict` plus the server row.
  - Deletes (vehicles only) are owner-checked and cascade, and they write `sync_tombstones`.
- **Pull:** a keyset cursor per table on `(server_updated_at, id)`, plus tombstones. Rows without a pending local change are applied when not older. Rows with one are **merged**, and the op stays queued with `base_version = server.version`.
- **Merge policies (`src/sync/merge.ts`):**
  - Append-only records (service events/actions, readings, documents, extractions, schedules, garage notes) are immutable, so records from both devices are kept.
  - Alerts: handled > deferred > active (monotonic).
  - Deferred items: resolution is sticky.
  - Vehicles and profiles: a **3-way field merge** against `sync_shadow`, the last server-accepted state. A field changed on one side only is taken from that side. A field changed on both sides goes to the later edit and is recorded in `sync_conflicts` for user review. Lifecycle and `archived_at` merge as one unit.
- **Retry:** exponential backoff with full jitter (5 s up to 15 min). A network failure leaves the outbox intact.
- **Adoption integration:** the outbox mark captured before the snapshot is cleared on success, and shadows are seeded. Changes made during adoption stay queued.
- **Device profiles:** a profile is a device identity. An account may have several, and each device pins its own (`deviceProfileId`).

## Consequences

- Correctness is proven by the multi-device tests on real Postgres (`src/sync/__tests__/sync.cloud.test.ts`), including a negative control showing that without shadows a concurrent archive would be lost.
- Sync never deletes data except through an explicit permanent deletion.
- Sync is not a backup strategy; that remains an M24 requirement.
