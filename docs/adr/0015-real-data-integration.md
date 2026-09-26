# ADR-0015: Real data behind the frozen UI

- Status: accepted
- Date: 2026-09-26

## Decision

Screens depend only on the `AppDataValue` contract (`src/features/data/DataContext.tsx`). Two providers implement it:

- **`LocalDataProvider` (the default):** the on-device SQLite store (`LocalStore`).
  - It opens and migrates the database and pins the device profile.
  - **Reads:** it loads the persisted domain records, runs `computeMaintenance`, and maps the results to the existing view-models through the pure adapters in `src/features/data/adapters.ts`.
  - **Writes:** they go through the domain constructors (validation, provenance) and repositories. They are serialized and followed by a fresh snapshot.
  - **Failures:** a failed write shows a dialog and leaves the data unchanged. A failed open shows an error state with retry.
- **`PrototypeDataProvider`:** the labelled mock data. It is used only in explicit demo mode (`EXPO_PUBLIC_DEMO_DATA=1`) and by the UI test suites. Demo tools and the demo banner appear only there.

### Honesty rules in the adapters

- Without a verified schedule, the schedule view is `pending`/`unable_to_verify` and states the reason: no source, not an exact match, not official, or conflicting sources. It never includes a "next service".
- Alerts are explainable. Pure `alertCandidates` (`src/engine/alerts.ts`) derive them from current data: the next due service, open deferrals, and a stale odometer. Maintenance alerts are derived only from a verified schedule.
  - Each candidate has a stable key. A persisted `Alert` keeps its id and its handled or snoozed status while the condition holds.
  - The alert text is recomputed from current facts.
- A service confirmed without its original document is stored as a user report, even if the draft claimed a document origin. It never claims garage evidence.
- Prototype placeholder bundles, such as fake registration or manual documents, are never written to the real store.

### Onboarding runtime services (outside demo mode)

- **Acquisition:** expo-image-picker. A denied, rejected or failed acquisition is explained on the scan screen.
- **Registration extractor:** `null` until an OCR/AI provider is approved (G1). A captured image then shows "automatic reading not available yet", and the user continues with the registry or manual entry.
- **Registry:** data.gov.il, from the manual-entry screen. Pressing the button, after a notice stating exactly what is sent, is the consent. Only the plate number is sent. Registry fields are badged "ממאגר משרד התחבורה".
- **Source discovery:** no provider is configured, so the honest result is "no verified official source".

### SQLite connection

There is one connection per database per JS runtime. It was device-verified that reopening after a reload can return a stale native handle (a NullPointerException in `execAsync`). A failed open is retried once with `useNewConnection`.

## Consequences

- Demo mode and the UI suites keep exercising every approved visual state.
- Real mode is covered by store integration tests (sql.js), adapter unit tests, and router-level tests, including restart persistence.
- Replacing a provider port (OCR, discovery) needs no screen change.
