# ADR-0002: Local-first persistence with a sync boundary

- Status: accepted
- Date: 2026-09-25

## Context

The app must be fully useful offline. Offline mutations must survive restart and sync later. Registration must not block first use.

## Decision

SQLite on device is the operational source of truth. All records have stable client-generated IDs (UUIDv4) and a version. Writes go through repositories that also enqueue sync operations. The cloud is a replica/backup target after account adoption. Conflict handling is entity-aware (ADR in M09).

## Consequences

Every repository must be vehicle-scoped and restart-safe. Server authorization is independent of client-supplied IDs.
