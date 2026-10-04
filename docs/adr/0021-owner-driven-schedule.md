# ADR-0021: The maintenance schedule and vehicle details come from the owner

- Status: accepted (owner decisions 2026-10-04 and 2026-10-05)
- Date: 2026-10-05
- Supersedes: ADR-0016 (hybrid official-source discovery), ADR-0020 (M-SOURCE V1 discovery engine)

## Context

The automatic engines (web discovery of a schedule, research catalogs, triangulated and generic
guidance, automatic reference images) did not deliver a usable schedule for the acceptance
vehicles (blind matrix 0/12 usable plans; M-SOURCE V1: insufficient evidence for both), and a
schedule the app derives by itself risks presenting unverified maintenance facts. The owner
redirected the product on 2026-10-04.

Research into paid data (HaynesPro) found workshop licences only, no app licence and no Israeli
plate lookup. The owner left a provider open for a future decision (approval gate).

## Decision

1. **No automatic schedule and no automatic vehicle image.** The discovery engine, catalogs,
   research data, guidance and reference-image code are removed (commit `1082df7` and after).
   The registry identification (data.gov.il), the service journal and the deterministic next-due
   engine stay.
2. **The schedule comes only from the owner**, in three ways:
   - **"לוח טיפולים תקופתי"**: a table with one row per item: item, every km, every months
     (free text with suggestions). Saved as a whole. Until a service is recorded, an item counts
     from the odometer and date at entry (`from_entry`). Authority `owner_entered`, level `O`.
     An owner item replaces another source's item for the same task and action.
   - **The owner's digital booklet** (PDF/HTML/image), read on the device.
   - **A photographed booklet page**, read on the device by Tesseract (heb+eng) in a WebView with
     no network.
     Every item read from a document is a proposal until the owner approves it.
3. **Vehicle photo**: only the owner's own photo; otherwise an empty frame with take / pick.
4. **Test and insurance** on Home: test date from the registry licence validity (cars) or the
   owner; insurance (compulsory plus optional comprehensive / third party) from the owner.
5. **"מפרט הרכב"** (2026-10-05, option ג): the owner writes oil (viscosity, standard, capacity),
   fluids (coolant, brake, gearbox), tyres (size, pressures) and free notes once. They are shown
   on the vehicle screen, beside the matching plan item and in Garage Mode. **Each table row**
   may also carry its own note (e.g. a part number), shown on its plan card and in Garage Mode.
6. **Vehicle deletion** (2026-10-05): the plate is shown already filled in, and the delete button
   is enabled; "האם אתה בטוח?" (כן / ביטול) shows what will be deleted, and only "כן" deletes.
   This keeps the spec's preview → explicit confirmation → controlled deletion → result. Typing
   the registration is no longer required.

7. **Bottom menu on secondary screens** (2026-10-05): the four primary destinations also show
   under every secondary screen (vehicle management, settings, spec, table, alerts…), except the
   first-run onboarding, the full-screen Garage Mode and the document viewer; hidden while the
   keyboard is up. A tap returns to the tabs and opens that destination. One shared tab list
   (`src/features/shell/BottomNav.tsx`) feeds both bars.
8. **Vehicle photo on Android**: the photo frame is a fresh view per state (empty / photo); a
   frame that had the dashed empty border did not draw a photo added later (device-verified).

## Consequences

- Local SQLite migrations: v14 `vehicle_dates`, v15 `manual_schedule_items`, v16 start point
  (`start_km`, `start_date`), v17 `vehicle_spec`, v18 `manual_schedule_items.note`. All are
  **local only** (not in `SYNC_TABLES`). Adding them to cloud backup is an approval gate, not yet
  decided.
- Tables of removed features stay in the schema (migrations are append-only) but are not read.
- No maintenance fact is created by the app. Values in the spec and table are the owner's, and
  examples in empty fields are shown as placeholders only.
- A paid or external schedule provider remains an open owner decision.
