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
Persistence (src/persistence: expo-sqlite, migrations, repositories)  ← local-first source of truth on device
   ▼
Sync boundary (src/sync: versioned operations queue, entity-aware conflicts)
   ▼
Cloud (Supabase: Auth, PostgreSQL + RLS, private Storage; supabase/ migrations)
   ▼
Providers (src/providers: discovery, retrieval, OCR, AI extraction, notifications, all interfaces)
   ▼
Verification pipeline (evidence → verification record → verified schedule)
```

## Key rules

- **Local-first:** SQLite on device is the operational store. The app is fully useful offline. Mutations are queued with stable IDs and survive restart.
- **Vehicle scoping:** every vehicle-scoped table and query takes `vehicle_id` explicitly. The "active vehicle" is UI context only (persisted preference), never an ownership change. On the server, authorization derives from the authenticated user, never from a client-supplied `vehicle_id`.
- **Provenance:** facts carry `SourceReference` and `VerificationRecord`. Derived data (OCR/AI) is stored separately from original documents.
- **AI boundary:** AI/OCR produce _proposals_ validated against schemas. They never write confirmed history or verified schedules directly. Retrieved content is treated as untrusted data, never as instructions.
- **Deterministic engine:** `src/engine` is pure TypeScript with no I/O or clock access. "Now" is passed in. It is fully fixture-tested.
- **Provider independence:** every external capability sits behind an interface in `src/providers`. Mocks are explicitly named `Mock*` and flagged in UI and dev tooling.
- **UI-first:** M01–M03 build the complete UI on labeled mock data. After the M03 freeze, backend adapters feed the existing screens without redesign.

## Navigation

expo-router in `src/app`:

- `(tabs)` has four bottom destinations: בית / תחזוקה / היסטוריה / מסמכים
- stack screens cover onboarding, garage mode, service capture, alerts (bell), vehicles (switcher), settings, dossier and lifecycle
- deep links carry `vehicleId` and resolve the active vehicle context before rendering

## Platform

Android is first, through Expo managed workflow / Continuous Native Generation. iOS must remain possible: no Android-only APIs without an abstraction. RTL is forced through `I18nManager` and `expo-localization` config.

See `docs/adr/` for recorded decisions.
