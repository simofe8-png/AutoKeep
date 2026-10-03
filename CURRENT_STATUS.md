# AutoKeep — Current Status (resume pointer)

_Last updated: 2026-10-03_

## Position

- **Baselines:** RC `35478a2`; P1 `7a1c798`; P2 plan `f6dd6a9`; P2A `6984342`.
- **P2B technical cloud staging: PASS (2026-09-27)**, with a documented authentication limitation. Report: `docs/release/P2B_STAGING_REPORT.md`.
  - Staging project `autokeep-staging` (`bqgyaiqfubumkhmrztra`), Free, eu-central-1, $0. Retained; empty after cleanup.
  - Staging secrets live outside the repository in `~/.autokeep/staging.env`.
- **Private Beta authentication: Invitation → Username + Password: PASS on staging (2026-09-28).** Owner decision; supersedes the e-mail-code flow and the Gmail SMTP plan (no e-mail, SMTP, OTP or domain). Details: `docs/release/PRIVATE_BETA_AUTH.md`, ADR-0019.
  - Migration `20260928000001_beta_invitations` and function `register` (verify_jwt=false) are on staging. Public sign-up is off. Supabase password floor: 6 characters (provider constraint), 72-byte cap; no AutoKeep rules.
  - Admin tool: `tools/beta-admin.mjs --target local|staging` (invite create/list/revoke/delete, user list/set-password).
  - Verified: verify 50/365; cloud 52/52 local **and** hosted staging; Galaxy A54 13/13 on hosted staging. Staging empty after cleanup.
  - The Gmail/App Password step is **no longer needed** (the ZERO_DOMAIN doc is historical).
- **Screen parity with the approved visual references: IMPLEMENTED (2026-09-28), commit `86ec70d`.** Reference set and decisions: `docs/design/README.md` (Home = LEFT variant; four-tab navigation authoritative; product/security decisions override old mockup content). Audit baseline: `docs/design/PARITY_AUDIT.md`. Existing-user login from the welcome screen added. verify 51/372. Galaxy A54 staging acceptance of the corrected UI: **PASS** (standalone release APK, no Metro; fresh install → existing-user login → data restored), `docs/design/README.md` §5.
- **Vehicle identification correction (2026-09-28): color, engine code, neutral image, vehicle edit — A54 ACCEPTED (standalone APK `ccfb4e4`, sha256 `26e67e98…`); license scan NOT PASS.** `docs/release/VEHICLE_IDENTIFICATION_CORRECTION.md`. Staging migration `20260928000002` applied (owner-approved), hosted cloud suite 53/53; staging empty after cleanup. verify 54/389. **ML Kit POC STOPPED before integration:** ML Kit sends device/installation identifiers and usage metadata to Google with no documented opt-out (image/text stay on device) — owner decision needed (accept telemetry / unofficial block / Tesseract).
- **License-scan OCR POC (Tesseract on-device, owner-approved 2026-09-28): synthetic evaluation done, NOT PASS.** `docs/release/LICENSE_OCR_POC.md`. Local module `modules/license-ocr` (Tesseract4Android 4.9.0 / Tesseract 5.5.1, heb+eng tessdata_fast); plate-first flow; +10.0 MB APK; 0 bytes network during OCR; offline works; image deleted; no text in logcat. **Next: owner photographs a real license with POC APK `a565bea` (sha256 `ec7b37a2…`) on the A54.** Not promoted to production.
- **Vehicle image (approved Ibiza scope, 2026-09-29): IMPLEMENTED; A54 A–D, F–I PASS, E (real camera photo) left to the owner.** `docs/release/VEHICLE_IMAGE_IMPLEMENTATION.md`. Catalog `vehicle_reference_images` + bucket `vehicle-references` (staging migrations `20260929000001/2` applied, 2 CC BY-SA 4.0 Ibiza references published); class key + high-confidence phase rules; searching/found/question/no-image/offline states; user photo priority + removal. verify 59/427, cloud 57/57 local + staging. APK `069bb88` sha256 `cc0f3a68…`.
- **Backlog (separate, not part of the parity correction):** post-midnight UTC date display; delete-vehicle confirmation requires the dashed plate; P2C; vehicle-manual / maintenance knowledge architecture.
- **Owner fix run 2026-09-29 (Tasks 1–5):** see `docs/release/UI_FIX_RUN_2026-09-29.md` and `docs/release/MAINTENANCE_ARCHITECTURE_DISCOVERY.md`.
- **UX fixes + maintenance core run 2026-09-29 (Tasks 1–11):** `docs/release/MAINTENANCE_M1.md`. Zoomable document viewer, one swipeable Home vehicle card, "כלי הרכב שלי" in the menu, requirement model + deterministic resolution/due engine, knowledge pipeline, real evidence for the acceptance vehicles (none verified → exact evidence requests), local SQLite v6, evidence-based Maintenance UI and journal linkage. Verify 66/485; local cloud 60/60; A54 A–H (pinch pending owner).
- **Universal maintenance discovery (owner instruction 2026-09-29, maintenance-only priority): engine IMPLEMENTED, blind PASS criterion NOT MET.** `docs/release/MAINTENANCE_DISCOVERY.md`. Evidence levels A–E (market caps at B instead of excluding; per task+action precedence), data-driven source registry with the P1 access policy (robots AND terms), deterministic document understanding + table/sentence extraction with grounding, reusable knowledge catalog (domain, local SQLite v7, cloud migration `20260930000002` prepared, local Docker only), level labels + official links in the UI. Blind matrix (committed first, `5b19311`): 0/12 usable plans. Access restriction 11/12, no source 1/12. Capability probe on the one permitted host (SYM): 15 + 14 grounded requirements, level C (model years not stated).
- **M-SOURCE: Israeli Maintenance Source Registry + coverage engine (2026-09-30): PARTIAL PASS.** Engineering steps 1–19 pass; the product objective is not met. `docs/maintenance/ISRAEL_SOURCE_REGISTRY.md`.
  - 59 source systems (37 Israeli), each with a six-dimension, evidence-backed, versioned access policy. ALLOWED appears only for SYM, by owner decision.
  - Generic adapters (listing, URL template, JSON API, restricted) sit behind a policy gate, with standard failure codes.
  - Also built: the Ministry fleet universe → source-system mapping, document versions, the private-upload hash path, a requirement reviewer, the coverage engine, and precise fallback reasons in the UI.
  - Fleet ceiling: official documents obtainable automatically for 0.77% of 4,373,456 vehicles, and Israeli authority for 0%. Blind set: 0/12. The dominant blocker is access policy (REQUIRES_PERMISSION / UNKNOWN / NOT_ALLOWED).
  - Migrations: `20260930000001` was fixed (owner-scoped claim FK); `20260930000003` is new. Both are local Docker only.
- **Maintenance access expansion + §24 user fallback (2026-09-30): no new automatic coverage.** `docs/maintenance/ACCESS_EXPANSION_2026-09-30.md`.
  - All 59 systems re-reviewed under the affirmative-evidence standard: **no new ALLOWED** anywhere. 36 dimensions on 13 systems tightened UNKNOWN → NOT_ALLOWED / REQUIRES_PERMISSION (policy v2, append-only).
  - Coverage unchanged: 0.77% document ceiling (SYM, owner decision only), 0% Israeli authority, 0/12 blind.
  - §24 fallback: owner-approved Hebrew message + direct private upload when no reliable schedule; partial schedules labelled; discovery misses recorded per vehicle class (local SQLite v8 `discovery_misses`, not synced). B1–B12: all fallback + upload, no full or partial schedule.
- **Source-agnostic maintenance discovery (2026-09-30): 7/12 blind vehicles get a usable schedule (3 COMPLETE, 4 PARTIAL); 5 fallback.** `docs/maintenance/SOURCE_AGNOSTIC_RESULTS_2026-09-30.md`. Research of any credible source → deterministic grounding (quote + interval values re-found on the page) → triangulation (evidence level T, confidence high/medium) → engine (market, model years, conflicts) → plan with core-item completeness; no service interval → §24 fallback.
- **M-SOURCE V1 runtime discovery engine (2026-10-02): IMPLEMENTED, not committed.** ADR-0020;
  results `docs/maintenance/MSOURCE_V1_RESULTS_2026-10-02.md`.
  - The runner has explicit stages and a per-operation access engine (DISCOVERY / FETCH /
    EXTRACTION / STORAGE; robots-based positive evidence for FETCH).
  - Acquisition is SSRF-safe, PDFs are parsed in an isolated process, and extraction is
    column-aware and multilingual.
  - Vehicle matching gives EXACT…NOT_APPLICABLE; resolution is support-based and never averages
    conflicting values.
  - Persistence is SQLite v10 (local only).
  - Discovery starts automatically once a vehicle is added or confirmed. Uploads go through the
    same pipeline, and there is a retry. The maintenance-plan card shows the Hebrew states.
  - Fable is used as recorded research on the worker host; its output is never evidence.
  - **Live results: Fiesta SNJB — INSUFFICIENT_EVIDENCE; Ibiza CGG — INSUFFICIENT_EVIDENCE.**
    Nothing was fabricated. Each obligation has one non-official source; the SEAT manual's fixed
    1 yr / 15,000 km (QG0/QG2) is PARTIAL because it states no model years and seat.co.uk is not
    an approved system.
  - Tests: 84 engine + 6 app tests. Full verify: see task-plan "M-SOURCE V1".
- **M-SOURCE V1 correction (2026-10-02, evening): DONE, not committed.**
  - FETCH follows RFC 9309 (`msource-access/2`).
  - One strongly applicable independent source may be SUPPORTED (never EXACT).
  - A generic all-engines page no longer counts as engine-specific.
  - **Live: Fiesta CONFLICTING_EVIDENCE** (cabin filter 20,000 mi vs 30,000 km / 24 months;
    everything else single-source generic → INSUFFICIENT). **Ibiza INSUFFICIENT_EVIDENCE.** No
    item was scheduled for either.
  - SEAT QG0/QG2 cannot be established from project data; the owner must read the data sticker.
    See `docs/maintenance/MSOURCE_V1_RESULTS_2026-10-02.md` §Correction run.
- **M-SOURCE V1 applicability and provenance correction (2026-10-03): DONE, not committed.**
  - Item-level scopes and per-operation sufficiency; section and official-metadata years.
  - Official identity is separate from fetch permission (brand domain), and schedules can be
    CONDITIONAL / READY_PARTIAL.
  - **Live:**
    - **Fiesta READY_PARTIAL:** brake fluid 30,000 km / 24 months and pollen filter
      30,000 km / 24 months are SUPPORTED (carwiki.de, all models and engines). The guide's
      schedule was a 2019 one and does not apply.
    - **Ibiza CONDITIONAL:** the official MY12 manual's 15,000 km / 12 months is STRONG and
      applies once the owner confirms QG0 or QG2.
  - Results doc §"Applicability and provenance correction".
- **M-SOURCE generalization (2026-10-03): DONE, not committed.** See
  `docs/maintenance/MSOURCE_GENERALIZATION_2026-10-03.md`.
  - Vehicle-specific production logic was removed: the QG regime pattern, the SEAT/Ford booklet
    hints, the fixed QG0/1/2 options, and the two-car research claims. A guard test now fails on
    any recurrence.
  - Queries are progressive (L1–L5), the fingerprint carries the body variant, and source
    families are learned without intervals.
  - Matrix: 16 vehicles across 13 manufacturers, one generic pipeline. 8 vehicles have
    established items (partial), 1 is conditional (Ibiza, QG0/QG2) and 7 are insufficient.
  - No core service / oil interval is established for any vehicle; the non-official items rest
    on a single publisher.
  - Eleven generic defects found by the matrix were fixed, including reflected-content patterns
    that had produced false items.
- **Provider research and identity-only state (2026-10-03): DONE, not committed.** See
  `docs/maintenance/PROVIDER_RESEARCH_2026-10-03.md`.
  - The registry's `misgeret` is the full VIN. `sanitizeVin` (`src/providers/registry/vin.ts`)
    yields a valid 17-character VIN or nothing; the UI still shows `••••1234`. No VIN is sent
    anywhere: that is a personal-data and provider-choice gate.
  - New presentation state VERIFIED_IDENTITY_ONLY: a registry-identified vehicle with no
    matched schedule shows its verified identity and "פרטי הרכב אומתו מול משרד התחבורה. שגרת
    הטיפולים לדגם זה טרם אומתה.". Retry, upload and manual entry stay available.
  - Catalog guard tests: exact engine-code segments only (no prefix, substring or empty match).
    No high-mileage task synthesis exists in production.
  - Owner decisions applied (2026-10-03): the matcher no longer relates engine codes by prefix.
    Only identical codes or entries in `explicitAliases` (`msource/engineAliases.ts`, empty until an
    equivalence is verified with cited evidence) match; CGG ≠ CGGB. The identity-only view carries the
    approved wording-only notice. VIN dispatch stays gated until a signed DPA and a B2C display licence.
- **Part A step 1: owner-document ingestion (2026-10-03): DONE, verified, device check pending.**
  - Text PDFs are read on the device: pdf.js in a hidden WebView with no network (D-A1).
  - Owner review: upload items are held until the owner accepts them, then become
    `vehicle_document` requirements, page cited, local only (migration v11).
  - `npm run verify`: 94 suites / 774 tests.
  - Next: the Expo Go check on the phone, then editing a proposed value and photo OCR (D-A2).
  - See `SPEC_INGEST_PROVIDERS_2026-10-03.md` → Implementation log.
- **Owner backlog (recorded, not started):** Home shortcut tiles duplicate the bottom navigation
  (history / documents / maintenance). Keep the bottom navigation, and keep only unique Home
  shortcuts such as Garage Mode.
- **Next action:** owner review of M-SOURCE V1. Decisions:
  - (a) [done: RFC 9309 semantics];
  - (b) approve SEAT/Ford global manufacturer domains as authorities (official provenance);
  - (c) on-device PDF text reading (pdf.js in a WebView, a new free dependency);
  - (d) a live research/search provider (G3, paid);
  - (e) local commit of this work. It is uncommitted because five files also hold the previous
    session's uncommitted vehicle-search changes.

  Earlier: stop for owner review. Pending owner decisions:
  1. permission requests to importers (Union Motors, Champion, Colmobil, Talcar, Samelet, Geo Mobility), or a legal position on automated reading of official manuals;
  2. re-confirm SYM's owner-decision permissions under M-SOURCE;
  3. approve the proposed source systems as authorities;
  4. curator for uploaded manuals and the reviewer tool;
  5. the model-year coverage rule;
  6. staging: cloud migrations `20260930000001`–`03` and an edge deployment of the pipeline.

  P2C is **not** started.

## Granted policies

- Local git commits at meaningful verified checkpoints (normally milestone PASS). No push. (User, 2026-09-25)
- Android verification on the user's physical phone through Expo Go. The user connects it when needed. (User, 2026-09-25)
- Proportional per-task verification, with the full suite at milestone gates. (User, 2026-09-25)

## Environment notes

- Node 24.16, npm 11.13, JDK 17, adb, Docker Desktop, gh are installed. The Supabase CLI is used through `npx supabase`.
- `ANDROID_HOME=C:\Android\Sdk` (no emulator); the full SDK is at `%LOCALAPPDATA%\Android\Sdk`.
- The project path contains Hebrew characters, so avoid local Gradle builds (ADR-0005). Local-build attempt log: `docs/release/LOCAL_BUILD.md`.

## Open issues

- UI test load-flake recurred once (M10, 9 failures inside verify, not reproducible standalone). Mitigation: verify uses --maxWorkers=2. If it recurs → investigate with --runInBand timing.

- Local Supabase: `npm run cloud:start` (ports 566xx; other local projects use 543xx/557xx — never stop them). Cloud tests: `npm run test:cloud`.
- Intermittent UI test timeouts once under heavy load (Docker running); not reproduced in 3 runs — watch.

- Real mode is the default; demo data only with `EXPO_PUBLIC_DEMO_DATA=1` (restart Metro) or in UI tests (ADR-0015).
- Device (M13): the phone had NO network during T107 (DNS failed for all hosts) → the data.gov.il lookup on device showed the correct "unavailable" state; re-verify a successful on-device registry lookup when the phone is online (Node live test passes).
- Expo Go: dismissing the Android camera-permission sheet with Back leaves the permission promise pending (no result). Explicit denial is covered by a UI test; re-verify in the dev/release build (T182). Camera permission was NOT granted on the user's phone (user decision).
- Invoice/registration reading: no OCR/AI provider (G1) — capture stores the original and the user fills the draft. Provider approval gate expected before V1 RC (T170).
- Expo Go file scoping: picker/cached files outside the project scope are unreadable by expo-file-system (device-verified). Documents: content URI copied into private cache (fixed). Camera/library image capture → storage NOT yet device-verified (camera permission not granted on the user's phone) — verify in dev build (T182).
- Device test data in Expo Go app storage: vehicle 'Honda XR650L 2001' (public registry sample plate), a garage note, a manual service, an uploaded test document. Harmless; clear via app data if desired.
- Local notifications cannot run in Expo Go (importing expo-notifications throws on Android since SDK 53 — device-verified). Scheduler is lazy and disabled there; verify notifications on a development/release build (T182). Remote push would need an external account (approval gate) — not used.
- Dev device ↔ local Supabase: `.env.local` (git-ignored, local demo keys) + `adb reverse tcp:56621 tcp:56621`; OTP code from Mailpit http://127.0.0.1:56624.
- Git Bash rewrites `/sdcard/...` adb paths — use `MSYS_NO_PATHCONV=1` for adb shell/exec-out with device paths.

- adb can wedge after long sessions: bound every adb call with `timeout`; recover with `Stop-Process adb` + `adb start-server` (start-device.mjs now times out adb reverse).

- UI is FROZEN (ADR-0007, docs/ui-baseline). Backend work must feed the existing screens without redesign.
- Native-RTL release build must re-verify TextInput alignment and text rules (M24 T182).
- Device verification tooling: `tools/device-shots.sh`, `tools/adb-tap.py` (python + PIL available).

- expo-router `typedRoutes` disabled: its incremental generator registered non-route files as routes on this machine (stale .expo/types broke tsc). Revisit if upstream fixes it.

- Device: run Metro with `npm run start:device` (Node 24 localhost→::1 breaks Expo Go over adb reverse). Expo Go was installed on the user phone by Expo CLI (2026-09-25).
- `@types/jest` 30 vs expected 29.5 (expo install --check); harmless for now, align in M03.

- `npm audit`: 14 moderate advisories in the Expo template's transitive dependencies (dev tooling). Review in T166.

## Pending approval gates

- G1 decided 2026-09-26: data.gov.il primary; discovery/OCR/AI behind ports with labeled mocks; NO paid services/keys/calls. Next gate when a real runtime AI/discovery provider is required to continue V1.
- **G2 decided 2026-09-26** (docs/gates/G2-release-providers.md, ADR-0016/17/18). **G3 open:** runtime providers (discovery, OCR/AI, registry entries), hosted Supabase (T065), release build/signing — docs/gates/G2-release-providers.md.

## Repository / checkpoint

- Checkpoint commits: `M00`–`M23` + M24 pre-gate work on `master` (local only, not pushed).
