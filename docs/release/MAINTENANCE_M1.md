# Maintenance core M1 + UX fixes: autonomous run (2026-09-29)

Owner instruction: "UX FIXES + MAINTENANCE CORE AUTONOMOUS RUN", Tasks 1–11. The architecture
follows `MAINTENANCE_ARCHITECTURE_DISCOVERY.md`. No real maintenance interval was invented.

## 1. UX fixes (Tasks 1–4)

| Task            | Implementation                                                                                                                                                                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Document zoom | `src/ui/components/ZoomableImage.tsx` + pure geometry `src/ui/zoom.ts`: pinch (focal point kept), drag while zoomed (clamped, no empty gap), double tap → 2.5× at the tapped point, double tap again → fitted; 1×–5×. `expo-image` with `allowDownscaling={false}` (full-resolution decode). PDF unchanged.                                                                                |
| 2 One Home card | The selector card with a second photo is removed. Home shows one active-vehicle card (image, name, spec line, plate), and the odometer tile below it.                                                                                                                                                                                                                                      |
| 3 Swipe         | `VehiclePager` + pure `pager.ts`. RTL: the first vehicle is at the right and the next comes from the left. After settling, the vehicle becomes active through the existing persisted active-vehicle store. Home's vehicle data is hidden while a card moves and is keyed by vehicle id, so a card never shows next to another vehicle's data. Dots appear only with more than one vehicle. |
| 4 Menu          | "כלי הרכב שלי" is the first menu entry (it replaces the lower "ניהול כלי רכב" row). Choosing a vehicle there lands on its Home.                                                                                                                                                                                                                                                            |

## 2. Maintenance architecture implemented (Tasks 5–8)

- **Domain** (`src/domain/requirements.ts`, `src/domain/knowledge.ts`):
  - atomic `MaintenanceRequirement`: task, action, interval (original unit kept, km derived), applicability, authority, evidence, verification, extraction provenance;
  - vehicle facts, where an absent field means UNKNOWN;
  - knowledge pipeline: document → section → candidate claim → requirement.
- **Trust rule** (`isVerifiedRequirement`): a requirement counts as verified only when all of these hold:
  - it is marked verified;
  - its authority is importer, manufacturer, official publication, or the vehicle's own booklet;
  - it has an exact location;
  - an AI candidate was reviewed by a human.
- **Uploads**: an upload is never authoritative. Owner confirmation only states "this is my booklet". A claim verifies only through a curator review on an authentic edition (a fingerprint match or a curator-verified edition). User uploads are never redistributed; only short excerpts are kept, and only where the terms allow.
- **Engine** (`src/engine/requirements.ts`):
  - per-dimension applicability (applies / does_not_apply / insufficient_information);
  - explicit precedence: a market-named source beats GLOBAL; importer > manufacturer = the vehicle's booklet > publication;
  - the Israeli override is per task;
  - conflicts at the same precedence stay unresolved;
  - an unknown fact that could outrank the applicable requirement blocks the choice;
  - due engine: whichever-first, first and repeating intervals, in-service date, "overdue" only against a recorded completion, forecasts typed.
- **Plan** (`src/features/maintenance/knowledge/plan.ts`):
  - vehicle facts come from the identity and the registry (make aliases, fuel, cc, IL market, first registration);
  - resolution, dues, next service and the exact evidence requests;
  - completions link through a deterministic UUID per (vehicle, task), stored in the existing, synced `service_actions.maintenance_item_id`.
- **Persistence**: local SQLite migration v6 adds `maintenance_profiles`, `knowledge_documents` and `maintenance_claims`.
  - All are vehicle-scoped and cascade on delete. They are local-only (not in `SYNC_TABLES`).
  - Resolutions are derived, recomputed on every read, and not stored.
  - The cloud migration `supabase/migrations/20260930000001_maintenance_knowledge.sql` is **prepared and verified on the local Docker stack only** (owner-only forced RLS, anon denied, fingerprint and excerpt constraints). It is **not applied to staging**, because that is an approval gate.

## 3. Real evidence for the acceptance vehicles (Task 7)

| Vehicle                 | Evidence found (verified by re-reading the sources)                                                                                                                                                                                                                                                                                                                                                                                                      | Status                                                                                                                                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SEAT Ibiza 2012 / CGG   | **Official SEAT owner's manual**, UK English, 6J4012003DC (seat.com, sha256 `05e3aef1…7fa1`):<br>• PDF p.199: the regime is set by the PR code on the Maintenance Programme booklet (QG1 LongLife; QG0/QG2 fixed 1 year / 15,000 km, whichever first);<br>• p.202 / p.209: oil and brake-fluid intervals are only in the Maintenance Programme booklet;<br>• p.249: the vehicle data sticker is in the spare-wheel well and on the booklet's back cover. | UK edition, which does **not** cover an Israeli vehicle. No Israeli (Champion Motors) schedule was found. **Missing:** the car's Maintenance Programme booklet (service table + PR code).             |
| Ford Fiesta 2015 / SNJB | **ford.co.il (Delek Motors), "תוכנית טיפול"** (page dated 24/11/2024): service at the earliest of a dashboard alert, 15,000 km, or one year since the previous service. An importer plan "Fiesta from model 2008" (`Ford_Fiesta_2008_2018.pdf`) exists, but its link requires a Delek Motors sign-in and was not accessed. The US Ford manual does not cover the 1.25 and was not applied.                                                               | Importer rule recorded as a **candidate** (found by AI research, not curator-reviewed), so it is not scheduled. **Missing:** a review decision, or the Fiesta 2008+ plan / the car's service booklet. |

Both are recorded in `src/features/maintenance/knowledge/knownSources.ts` as structured facts with
locators; no manual text is stored.

## 4. UI and journal (Tasks 9–10)

- **Maintenance tab and Home**: when no curated schedule exists, the plan is shown.
  - Each task shows: what, inspection vs replacement, interval, next km/date, remaining, the "צפי" forecast, last done or "not yet recorded", and its source.
  - With insufficient evidence there is no interval: "נדרש מידע נוסף כדי לבנות את לוח הטיפולים" plus the exact next action. For SEAT: photograph the booklet table and the data sticker (PR code). For Ford: the service booklet or the importer plan (*2880).
  - Other requests: the regime and usage questions, engine code, odometer, and the in-service date for time-based tasks.
- **Record service**: plan tasks are offered unchecked. Only a checked task links and recalculates; unrelated tasks and other vehicles are unaffected. Manual recording always works.
- **Device acceptance**: a clearly labelled SYNTHETIC catalog. It loads only with `EXPO_PUBLIC_SYNTHETIC_MAINTENANCE=1` in a dev bundle, and only for a hand-entered make "SYNTHETIC TEST". It is never in normal builds.

## 5. Galaxy A54 acceptance (Task 11)

- **Build**: debug dev-client build of the staging app with Metro, over wireless adb (the USB link kept resetting).
- **Evidence**: `docs/release/evidence/maintenance-run/`.

| Check                 | Result                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A Documents zoom      | **PASS** for double-tap zoom (2.5×; the tiny "ZOOM CHECK 4729-TEST" line on the synthetic license becomes crisp), pan while zoomed, double-tap reset (pixel-identical to the fitted view), and Back → Documents. **Pinch** could not be injected: Samsung SELinux blocks `sendevent`, and `input` has no multi-pointer. The pinch math is unit-tested; a physical pinch by the owner is pending. |
| B One card + swipe    | **PASS**: one card, dots with ≥2 vehicles, left→right = next (RTL), right→left = back, a short drag doesn't switch, the odometer and plan change with the card, data is hidden mid-swipe (frame sheet), and the selection persists across restart.                                                                                                                                               |
| C Menu                | **PASS**: "כלי הרכב שלי" is the first menu row, lists all vehicles, offers Add, and Back → menu → Home.                                                                                                                                                                                                                                                                                          |
| D Identity → schedule | **PASS** (synthetic catalog): items with interval, next km/date, remaining and source; Home's next-service tile shows "טיפול תקופתי · 29.9.2027".                                                                                                                                                                                                                                                |
| E Missing evidence    | **PASS**: the real Ibiza shows "נדרש מידע נוסף…", "העלה את חוברת הטיפולים של הרכב" and the SEAT PR-code guidance, with no interval. The booklet upload is stored and shown as received, still with no schedule. A time-only task without an in-service date asks for it.                                                                                                                         |
| F Service completion  | **PASS**: record → only "טיפול תקופתי" checked → History shows it → next 41,111 km / 29.9.2027, "בוצע לאחרונה 29.9.2026 · 30,000"; the air filter stays at 44,444 km "not yet recorded".                                                                                                                                                                                                         |
| G Isolation           | **PASS**: the real Ibiza's History has no synthetic service, and its plan still needs information.                                                                                                                                                                                                                                                                                               |
| H Restart / offline   | **PASS**: after force-stop + relaunch, the active vehicle and the completion link persist. With Wi-Fi off, Home and Maintenance still show the plan (local data).                                                                                                                                                                                                                                |
