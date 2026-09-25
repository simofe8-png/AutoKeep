# AutoKeep V1 — Approved Product & Architecture Specification

## 1. Product vision

AutoKeep is an AI-native personal vehicle-maintenance manager. It should reduce manual work: identify the vehicle, find authoritative documentation and maintenance schedules, track service history, prepare the owner for garage visits, record completed work, and issue grounded reminders.

The system must be proactive without inventing professional maintenance facts.

## 2. V1 scope

Supported vehicle types:
- private passenger car
- motorcycle
- scooter

One account supports 1..N vehicles. A user may have any mixture of supported vehicle types.

Explicitly outside the original V1 direction unless later approved: fleet/driver management, GPS trip tracking, garage work-order/inventory systems.

## 3. Onboarding

Preferred flow:
Open app → scan vehicle registration/license → extract identity → user confirms vehicle → ask only for missing required data → current odometer → automatically find and verify owner’s manual/maintenance schedule → create vehicle environment → Home.

The app should not ask users to manually re-enter information it can reliably obtain.

If scan fails: retry / upload image / manual entry.
If identification is partial: ask only for missing necessary fields.
If multiple exact candidates remain: user selects; AutoKeep does not guess.

Vehicle type should be auto-detected from registration data when reliably available.

## 4. Vehicle identity and privacy

Vehicle data may include manufacturer, model, year, trim/version/model code, engine type/displacement/code, fuel/powertrain, transmission where relevant, registration number, VIN/manufacturer identifier where required, current odometer and measurement date.

Sensitive identifiers must be minimized in UI/logs. Full VIN may be retained internally when genuinely required, but presentation should avoid unnecessary exposure and should support masking the final four characters as previously specified.

## 5. Official sources and maintenance schedules

AutoKeep is responsible for automatically searching for the owner’s manual and official maintenance schedule.

Pipeline:
vehicle identity → source discovery → authority classification → exact-vehicle applicability matching → document retrieval → extraction → evidence linking → validation → structured maintenance schedule.

If no verifiable official source is found, AutoKeep must not invent professional maintenance recommendations. The user may continue using the app, but the professional schedule remains unavailable/pending.

If a source cannot be proven to match the exact version, it remains pending/unverified.

Original documents are retained separately from derived data.

## 6. Provenance and verification

Provenance is first-class. Significant facts should retain source, date/version, verification state and exact applicability.

System states:
- verified
- pending / missing information
- unable to verify
Internally, conflicting/unverified states may also be represented where useful.

Sources may include:
- manufacturer
- official importer
- vehicle document
- garage document
- user report

User-reported information never silently becomes independently verified.

AI is never the authoritative source. Evidence is.

## 7. Maintenance engine

The maintenance engine is deterministic once structured verified schedule data exists.

It combines:
- mileage intervals
- time intervals
- manufacturer-defined earliest-of logic
- current odometer
- odometer measurement date
- service history
- deferred items where applicable

It computes next due, overdue, and forecast information. Forecast dates based on driving rate must be explicitly labeled `צפי`.

Do not claim the vehicle is mechanically healthy merely because no scheduled task is due. Preferred wording is factual, e.g. “אין כרגע משימות תחזוקה נוספות שזוהו”.

## 8. Home

Home answers quickly:
- which vehicle is active?
- what is the maintenance status?
- what is next?
- when is it due?
- does the user need to act?

It shows active vehicle, current odometer, next service, distance/time remaining, meaningful alerts, and direct access to preparation/Garage Mode.

## 9. Maintenance and next service

One scrollable next-service screen. Top: interval, distance/time remaining, forecast if applicable. Below: maintenance actions.

Each action expands in place to show:
- what manufacturer says
- exact action
- inspection/replacement/other
- exact source/page/section reference

Avoid redundant detail screens when expansion in context is sufficient.

## 10. Garage Mode

Garage Mode is suitable for handing/showing to a service advisor.

Three sections must remain separate:
1. Manufacturer requirements
2. What AutoKeep already knows
3. Garage notes/recommendations

A garage recommendation never becomes a manufacturer requirement merely because it was entered.

The clean garage view may support PDF/share output when implemented.

## 11. Service recording

Entry methods:
- invoice/photo
- uploaded file
- manual entry

Manual entry must always be available.

Minimum manual data:
- date
- odometer
- work performed
Garage and notes are optional.

OCR/AI may extract a draft but may not update history automatically. User reviews/corrects and explicitly confirms first.

Selectable/performed service actions use checkboxes. Checked means performed. Action type is stored independently as inspection/replacement/other. Unlisted actions can be added.

## 12. Service history

Chronological history includes date, odometer, actions, documents and provenance.

Service detail shows all performed actions and their evidence/source quality.

History is distinct from what the manufacturer schedule says should have occurred.

## 13. Documents

Vehicle-specific document library includes owner’s manual, maintenance schedule, invoices/receipts, registration or other relevant files.

Original file is retained. Derived OCR/extraction is separate.

Where possible, evidence links point to exact page/section/table rather than only opening a large PDF.

## 14. Alerts and reminders

Grounded V1 alert types:
- upcoming service
- overdue service
- deferred action
- stale odometer where stale data impairs calculation

Alerts are actionable: view service, update odometer, mark handled/record service, defer where appropriate.

Each alert is explainable: why it exists, source/data basis, vehicle, and relevant last completion.

Safety language requires reliable professional basis.

Device notifications and in-app alerts are supported when required.

## 15. Multiple vehicles

Use the umbrella Hebrew terminology `כלי הרכב` where appropriate.

“My Vehicles” / vehicle switcher shows each vehicle with identifying summary, odometer and important status. One vehicle is active at a time.

Selecting a vehicle changes the application context. All maintenance, documents, history, alerts and Garage Mode are scoped to that vehicle_id.

Notifications/deep links open the correct vehicle automatically.

Actions such as recording service should visibly identify the target vehicle to reduce misfiling.

## 16. Account, backup and offline

Registration must not block first-use onboarding.

Preferred flow:
open app → identify/configure vehicle → once valuable data exists, offer account creation framed around saving/backing up AutoKeep data.

Account exists because history is long-lived and should survive device loss/replacement and support backup/sync.

App remains useful offline. Offline mutations survive restart and synchronize later.

Sync is not itself a backup strategy; production requires an independently validated backup/restore strategy.

## 17. Settings

Settings/profile includes appropriate access to:
- profile/account
- alerts/reminders
- vehicle management
- backup/sync status
- document management where appropriate
- language/appearance
- accessibility
- about/security controls where appropriate

Phone number is not mandatory unless a real feature requires it.

Settings should manage behavior, not duplicate content screens.

## 18. Vehicle lifecycle

When a vehicle is sold/no longer used:
- archive is the default
- archived data/history/documents remain
- restore from archive is possible
- permanent deletion is separate and requires explicit confirmation

Permanent deletion should use preview → explicit confirmation → controlled deletion → result.

## 19. Vehicle dossier

V1 includes an exportable/shareable vehicle dossier for sale/transfer.

It is generated from existing source-of-truth data rather than becoming a competing history.

It may include vehicle details, maintenance history, documented odometer readings, relevant documents and provenance/verification.

User-reported facts must remain labeled as such.

## 20. Failure/exception policy

No separate “error area” is required; failures appear in context with a corrective action.

Required cases include:
- failed registration scan
- partial/ambiguous identity
- official manual not found
- exact applicability cannot be verified
- partially unreadable document
- offline
- stale odometer
- overdue maintenance
- uncertain invoice extraction
- garage/manufacturer disagreement
- upload/sync failure/conflict

Never hide uncertainty with invented fallback facts.

## 21. Data model direction

Core entities/boundaries:
- User/local profile
- Vehicle
- VehicleIdentifier
- OdometerReading
- Document
- Source
- SourceReference
- MaintenanceSchedule
- MaintenanceInterval
- MaintenanceItem
- ServiceEvent
- ServiceAction
- GarageRecommendation
- Alert
- VerificationRecord/provenance
- Sync state/operations
- Vehicle lifecycle
- Vehicle dossier/export snapshot

Vehicle-scoped operational data belongs to vehicle_id.

## 22. Architecture

Approved baseline:
React Native/Expo/TypeScript app
→ SQLite local persistence
→ sync/API boundary
→ Supabase-backed authenticated cloud
→ PostgreSQL/private Storage
→ source discovery
→ document processing
→ provider-independent OCR/AI extraction
→ verification
→ deterministic maintenance engine
→ alerts/notifications

Architecture is local-first/cloud-backed, Android-first, and must not prevent future iOS.

## 23. Security

Principles:
- least privilege
- server-side authorization
- client-supplied vehicle_id is never authorization
- private-by-default user documents
- no permanent public URLs for private documents
- sensitive-data minimization/redaction in telemetry
- secrets outside source control
- uploads/retrieved documents are untrusted input
- prompt-injection boundaries between instructions and retrieved content
- validate AI structured output
- explicit confirmation for destructive operations
- proven auth provider rather than custom password cryptography
- threat model specific to AutoKeep in addition to OWASP review

## 24. Sync/conflicts

Do not blindly use server-wins or last-write-wins for every entity.

Offline changes have stable IDs/versioning and must survive restart. Conflict handling is entity-aware; two independent service events may both be legitimate, while concurrent edits to the same entity may require conflict handling.

## 25. V1 completion definition

Do not call V1 complete until:
- approved UI and RTL behavior are preserved
- Android acceptance passes
- local/offline behavior passes
- authoritative-source behavior passes
- deterministic maintenance tests pass
- service recording/history/documents work
- alerts work
- multiple vehicles are isolated
- car/motorcycle/scooter scenarios pass
- account/backup/sync behavior passes
- archive/dossier behavior passes
- failure/recovery matrix passes
- security/privacy gate passes with no unresolved Critical/High finding
- clean reproducible Release Candidate is produced
