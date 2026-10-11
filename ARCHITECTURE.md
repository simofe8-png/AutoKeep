# AutoKeep Architecture

The source of truth is `AutoKeep_Bootstrap_Package/AUTOKEEP_V1_SPEC.md` §22. This file describes how that baseline is realized in code.

## Layers

```
UI (src/app routes, src/features, src/ui design system)
   │  reads view-models only; never computes maintenance facts itself
   ▼
Application services / adapters (src/features/*/adapters, hooks)
   ▼
Domain (src/domain) ─── Maintenance engine (src/engine, pure & deterministic)
   ▼
Persistence (src/persistence: expo-sqlite, migrations, repositories)  ← the only source of truth, on device
   ├─ files (src/persistence/files.ts): which stored original belongs to which record
   └─ backup (src/persistence/backup): one versioned, checksummed file of all data, user-controlled
   ▼
Providers (src/providers: OCR, AI extraction, registry, storage, notifications, all interfaces; automatic schedule discovery removed 2026-10-04, ADR-0021)
   ▼
Verification pipeline (evidence → verification record → verified schedule)
```

## Key rules

- **Local-first, no backend (ADR-0023):** local device is the source of truth. AutoKeep operates without an AutoKeep user-data backend: no account, server database, cloud storage or sync. SQLite holds structured data; app-private files hold document originals and photos (the database keeps only key, type, size and hash). Every write is committed locally at once and survives restart. The owner protects the data with a backup file saved where they choose (device folder or share sheet, e.g. Google Drive) and restores it on a new device.
- **Vehicle scoping:** every vehicle-scoped table and query takes `vehicle_id` explicitly. The "active vehicle" is UI context only (persisted preference), never an ownership change.
- **Network:** only the public Ministry of Transport registry (owner-initiated plate lookup) and app distribution/updates; see [docs/security/NETWORK.md](docs/security/NETWORK.md).
- **Provenance:** facts carry `SourceReference` and `VerificationRecord`. Derived data (OCR/AI) is stored separately from original documents.
- **AI boundary:** AI/OCR produce _proposals_ validated against schemas. They never write confirmed history or verified schedules directly. Retrieved content is treated as untrusted data, never as instructions.
- **Deterministic engine:** `src/engine` is pure TypeScript with no I/O or clock access. "Now" is passed in. It is fully fixture-tested.
- **Provider independence:** every external capability sits behind an interface in `src/providers`. Mocks are explicitly named `Mock*` and flagged in UI and dev tooling.
- **UI-first:** M01–M03 build the complete UI on labeled mock data. After the M03 freeze, the local store feeds the existing screens without redesign.

## Navigation

expo-router in `src/app`:

- `(tabs)` has four bottom destinations: בית / תחזוקה / היסטוריה / מסמכים
- stack screens cover onboarding, garage mode, service capture, alerts (bell), vehicles (switcher), settings, backup/restore, dossier and lifecycle
- deep links carry `vehicleId` and resolve the active vehicle context before rendering

## Platform

Android is first, through Expo managed workflow / Continuous Native Generation. iOS must remain possible: no Android-only APIs without an abstraction. RTL is forced through `I18nManager` and `expo-localization` config.

See `docs/adr/` for recorded decisions.
