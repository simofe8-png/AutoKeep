# AutoKeep V1 — Live Task Plan

Generated from `AutoKeep_Bootstrap_Package/TASK_PLAN.md`. Status values: TODO · IN PROGRESS · PASS · BLOCKED · GATE.
Evidence gives the concrete commands and results (or file references) proving the acceptance criteria.

## M00 Foundation

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T001 | Bootstrap Expo + React Native + TypeScript in the empty project root. | PASS | Expo SDK 57 / RN 0.86.3 / TS 6 scaffold (default template, expo-router, src/app) moved into project root, no nested dir; bootstrap package untouched. npm install OK; expo-doctor 21/21; tsc --noEmit clean; expo export --platform android bundles (entry .hbc 2.7MB). Template demo code/Expo LICENSE/plugin-enabling .claude/settings.json removed. |
| T002 | Create CLAUDE.md governance, approval gates, retry policy and autonomous progression rules. | PASS | CLAUDE.md: authority order, resume protocol, autonomous loop, stop conditions, 5-iteration retry policy, approval gates, granted git policy, allowed decisions, invariants, conventions (imports AGENTS.md Expo guidance). |
| T003 | Create README, ARCHITECTURE, DOMAIN, SECURITY, TESTING, ROADMAP and initial ADRs. | PASS | README.md, ARCHITECTURE.md, DOMAIN.md, SECURITY.md, TESTING.md, ROADMAP.md, CURRENT_STATUS.md, task-plan.md (184 tasks), docs/adr/0000-0005 (stack, local-first, provenance, provider boundaries, Expo Go device verification). |
| T004 | Establish lint, TypeScript, tests and aggregate npm run verify. | PASS | eslint.config.js (eslint-config-expo flat + prettier, --max-warnings=0), .prettierrc.json, jest.config.js (jest-expo, @/ alias), RNTL 14 smoke test; tsconfig types=[jest] (TS6 default types=[]). npm run verify = format:check && lint && typecheck && jest --ci: all green (1 suite). |
| T005 | Establish CI baseline plus environment/secrets conventions. | PASS | .github/workflows/ci.yml (npm ci, verify, android export; no secrets; YAML parsed OK), .env.example, .gitignore ignores .env/.env.* except example (git check-ignore verified), docs/ENVIRONMENT.md, src/config/env.ts + 2 tests (mock default, strict 'real'). |
| T006 | Verify foundation and record M00 PASS. | PASS | M00 gate: npm run verify green (format, lint 0 warnings, tsc, 2 suites/3 tests); expo export android OK; governance docs present. M00 PASS. |

## M01 Design System

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T007 | RTL Hebrew foundation, typography, layout and design tokens. | PASS | src/ui/theme: tokens (white/light-blue palette, spacing, radii, 48dp touch target, Heebo typography scale, per-variant font-scale caps), rtl.ts (3-layer RTL: expo-localization forcesRTL plugin, LocaleProvider rtl, root direction rtl; logical textAlign per ADR-0006), fonts.ts (Heebo OFL). Device: RTL layout + Hebrew typography verified on SM-A546E (screens home/vehicles). rtl.test.ts green. |
| T008 | Reusable buttons, inputs, cards, checkboxes, badges and dialogs. | PASS | src/ui/components: AppText, Icon, Button (variants/loading/disabled), IconButton (badge), Card, TextField (label/optional/error/suffix), Checkbox (checked=performed, a11y checkbox), Badge, Dialog (explicit/destructive confirm), SegmentedControl (action type radiogroup), ListRow, Layout (Screen/SectionHeader/Stack/Row). 9 RNTL tests (roles, disabled/busy state, touch target, toggle, confirm/cancel). |
| T009 | Reusable loading, empty, error and verification-state components. | PASS | States.tsx: LoadingState, EmptyState, ErrorState (with actions, no dead ends), InlineNotice (in-context failure + corrective action), OfflineBanner (what resumes later); Verification.tsx: single vocabulary VerificationBadge (מאומת / חסר מידע / ממתין לאימות / לא ניתן לאמת) + ForecastValue always labeled צפי. 8 tests. |
| T010 | Navigation shell with four primary bottom destinations. | PASS | src/app/(tabs) via expo-router/js-tabs: exactly 4 tabs בית/תחזוקה/היסטוריה/מסמכים with Hebrew a11y labels (replacing English 'tab, n of 4' suffix); alerts (bell) and settings (profile) as header secondary entries; unstable_settings initialRouteName=(tabs) so deep-link back returns into app (device-verified hardware back). navigation.test.tsx 3 tests; device: tab order RTL (בית rightmost). |
| T011 | Active Vehicle Context UI. | PASS | ActiveVehicleContext (switch = context only; archived not selectable), ActiveVehicleChip (switcher entry, model+plate+odometer), VehicleTargetBanner (for high-impact actions), vehicles switcher screen, DemoDataStrip labeling mock data. Test: switch car→motorcycle updates header; device: switch verified on phone. |
| T012 | Accessibility/responsive verification and M01 PASS. | PASS | A11y: roles/labels/states on all interactive components (tests), 48dp touch targets, font scaling with caps, colour never sole signal (badges have text). Responsive/device: SM-A546E 1080x2340 @450dpi, system font scale 1.3 — found+fixed: single-line title misaligned (ADR-0006), odometer & vehicle name truncation (2-line wrap), deep-link back exiting app. M01 gate: npm run verify green twice (5 suites/25 tests), Android bundle loads in Expo Go SDK 57. M01 PASS. |

## M02 Full UI Prototype

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T013 | Onboarding and registration/license scan UI. | PASS | src/app/onboarding: welcome (no registration barrier), scan (viewfinder placeholder; camera boundary is M06), identify with in-context outcomes (success/partial/ambiguous/failed via labeled DemoScenarioPicker). Tests: onboarding.test.tsx (5). Device: sources screen rendered RTL on SM-A546E. |
| T014 | Vehicle confirmation and missing-data flow. | PASS | confirm.tsx: identified fields with provenance tags (זוהה מרישיון/הוזן ידנית), VIN masked to last 4, missing-fields engine asks only for missing necessary fields (missingFields), manual fallback prefilled; ambiguous candidates require user choice. Tests: partial asks only engine; ambiguous no guess; VIN masked. |
| T015 | Source-search progress/result states. | PASS | sources.tsx: single updating progress screen (discovery→authority→applicability→retrieval→extraction→validation) then verified/pending/not-found results; not-found states no recommendations are shown; guard against incomplete draft. Tests: verified→Home new vehicle active; notFound wording. Device screenshot verified. |
| T016 | Home. | PASS | Home: active vehicle, next service (interval, due, km/time remaining split stats, צפי forecast), due badge, alerts, garage mode, record service, odometer card, delayed account offer, offline banner, schedule-unavailable state; never 'healthy' (test asserts). Device screenshot verified; fixed duplicated 'נותרו' label. |
| T017 | Maintenance schedule and next-service screen. | PASS | (tabs)/maintenance: one scrollable screen — summary on top, action list, upcoming services, schedule source line; unverified → ScheduleUnavailable, verified-without-next → 'אין כרגע משימות תחזוקה נוספות שזוהו'. Device screenshots verified. |
| T018 | Expandable maintenance-item evidence. | PASS | MaintenanceItemRow expands in place: manufacturer text, action type badge, verification badge, exact source locator + open-source → document detail. Tests: expand details + evidence navigation. |
| T019 | Garage Mode. | PASS | garage.tsx: three visually separate sections (manufacturer / known / garage), garage disclaimer, add-note dialog stores GarageRecommendation only, share placeholder labeled. Test: note never appears in manufacturer section. Device screenshot verified. |
| T020 | Service capture: photo/file/manual. | PASS | service/new (photo/file/manual, VehicleTargetBanner), manual form (date/odometer/actions minimum validation), checkbox=performed with separate action-type SegmentedControl, unlisted actions. Test: manual validation + unlisted action. |
| T021 | Service review and confirmation. | PASS | service/extract (mock draft only) → review with uncertain-field flags + original document card → explicit confirm dialog naming vehicle → history. Tests: confirm required; leaving review leaves history unchanged (no auto-commit). |
| T022 | Service history and detail. | PASS | (tabs)/history chronological with provenance badges + 'history ≠ schedule' note, empty state with action; service/[id] detail with performed/not performed, action types, evidence/source, linked docs. Tests + device screenshot. |
| T023 | Documents. | PASS | (tabs)/documents vehicle-scoped, grouped by kind, verification per doc; documents/[id] shows original and derived extraction separately. Tests: scoping by vehicle; evidence link opens detail. |
| T024 | Alerts. | PASS | alerts/index + alerts/[id]: why/basis/vehicle/last completion, kind-specific actions (view service, update odometer, record with item preselected, mark handled); deep link switches context to the alert's vehicle. Tests + device screenshot (scooter overdue). |
| T025 | My Vehicles, switcher and add vehicle. | PASS | vehicles.tsx (כלי הרכב שלי): VehicleCard with identity/odometer/status/alerts, active marked, switch, manage, add (reuses onboarding), archived section. Device screenshot verified. |
| T026 | Account/backup UX. | PASS | AccountOfferCard shown only when data exists; account.tsx framed around backup, email validation, clear note that real auth arrives with Supabase (nothing sent in demo). Test: offer → create → backup status. |
| T027 | Settings. | PASS | settings.tsx: profile/account, backup, notifications, vehicle management, documents, language, accessibility, about; demo-only offline simulation. Test: offline toggle shows offline banner in context. |
| T028 | Archive/sale/permanent-delete UX. | PASS | vehicle/[id]: archive (keeps data) / restore / permanent delete with preview counts + typed registration confirmation + result screen. Test covers archive→restore→delete. |
| T029 | Vehicle Dossier preview/share UX. | PASS | vehicle/[id]/dossier: generated from existing data; odometer readings, history with verification + user-reported labels, documents; share placeholder labeled. Test: user-reported labeling. |
| T030 | Mock end-to-end navigation verification and M02 PASS. | PASS | M02 gate: prototype-e2e.test.tsx (15) + onboarding (5) + navigation (4); npm run verify green (7 suites/45 tests, lint 0 warnings); Android export OK; device pass on SM-A546E fixed: duplicated remaining label, split km/time stats, compact card padding, VehicleTargetBanner truncating plate, typedRoutes generator broken on this machine (disabled). M02 PASS. |

## M03 Visual Acceptance

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T031 | Android device rendering verification. | PASS | tools/device-shots.sh deep-link pass over 18 screens on SM-A546E (Android 16, he-IL, 1080x2340@450, font 1.3, Expo Go SDK 57); contact-sheet review. Found+fixed: dossier date collapsing (flex:1 in wrapping row), bidi reorder of '·' metadata (RLM joinParts), unit wrapping (NBSP). |
| T032 | RTL, keyboard, scrolling, safe area and font-scaling verification. | PASS | RTL/keyboard/scroll/safe-area/font-scale: font_scale 2.0 pass (restored to 1.3) fixed tab-label clipping (cap x1.3), mid-word title breaks (PageTitle), squeezed rows (ListRow below slot), 2-line headers; small screen 720x1280@320 (reset after) fixed tab bar height (inset-aware 62dp); keyboard: footer hidden → KAV padding on Android; TextInput physical alignment (INPUT_TEXT_ALIGN_START). Screens re-verified after fixes. |
| T033 | Loading/error/empty/offline visual-state verification. | PASS | tools/adb-tap.py scripted state pass: failed scan (retry/manual), ambiguous candidates (user choice), partial identification (only missing field), pending schedule (motorcycle), user-reported history, offline simulation, alerts list; Latin-leading bidi defect fixed via ensureRtlParagraph in AppText (+unit tests). |
| T034 | Resolve visual defects within approved design. | PASS | All M03 defects resolved within approved design (no new screens/flows): see T031–T033; ADR-0007 records the text/bidi/keyboard rules. npm run verify green (7 suites/47 tests). |
| T035 | Freeze UI baseline and record M03 PASS. | PASS | UI baseline frozen: docs/ui-baseline/ (26 downscaled device screenshots + README acceptance checklist), ADR-0007. M03 gate: verify green, Android export OK. Device settings restored (font_scale 1.3, wm size/density reset). M03 PASS. |

## M04 Domain

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T036 | Core vehicle/account value objects and stable IDs. | PASS | src/domain/core.ts (branded UUID ids, injected IdGenerator, IsoDate/Timestamp + date math, Result, EntityMeta version) + vehicle.ts (LocalProfile, Vehicle, registration normalize/format, VIN validate/mask, archive/restore, OdometerReading). Tests: dates/ids/identifiers/validation/lifecycle/odometer. |
| T037 | Provenance and verification model. | PASS | provenance.ts: authorities, 5 internal states → 3 display states, SourceReference (page/section/table), decideVerification (no evidence→pending; user/non-authoritative→unverified; not exact→pending; disagreement→conflicting). Tests (3). |
| T038 | Maintenance schedule/interval/item model. | PASS | maintenance.ts: schedule/interval/item, rules earliest_of/distance_only/time_only, first-occurrence fields, verification decided from evidence+exact applicability, usableSchedule gate. Tests (2). |
| T039 | Service event/action model. | PASS | service.ts: ServiceDraft → confirmServiceDraft(UserConfirmation) only path to history; minimum data date/odometer/performed action; performed-only storage; independent actionType; manual=user_report/unverified, document=garage_document/verified with doc required. Tests (4). |
| T040 | Documents/sources/source-reference model. | PASS | documents.ts: VehicleDocument with immutable OriginalFile (mime/size/sha256, no public URLs, no self-asserted manufacturer authority), Source (edition), DerivedExtraction separate from original. Tests (2). |
| T041 | Garage recommendations and alerts domain. | PASS | garage.ts: GarageRecommendation distinct type (ts-expect-error proves not assignable to MaintenanceItem), DeferredItem, Alert with required explainable basis per kind, handle/snooze. Tests (2). |
| T042 | Domain invariants/tests and M04 PASS. | PASS | domain.test.ts 20 invariant tests incl. vehicle isolation (outOfScope); ESLint purity rule for src/domain + src/engine; DOMAIN.md implementation table. M04 gate: npm run verify green (8 suites/67 tests). M04 PASS. |

## M05 Local-first Persistence

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T043 | SQLite integration and migration framework. | PASS | SqlDatabase port; expo-sqlite adapter (WAL, FK on, exclusive serialized tx); sql.js test adapter; forward-only migration runner + schema v1. migrations.test.ts (5): idempotent, vehicle_id NOT NULL on all scoped tables, atomic rollback, refuses newer DB, FK enforced. On device (Expo Go, SM-A546E) /dev/db-check: MIGRATE 0->1, ROLLBACK OK. ADR-0008. |
| T044 | Vehicle repository and active-vehicle persistence. | PASS | ProfileRepository.getOrCreate, VehicleRepository (insert/update optimistic version/get/list active|all), ActiveVehicleStore (persisted pointer, only active vehicles). Tests: round-trip, ConcurrencyError, switch changes pointer only. Device: active=true after reopen. |
| T045 | Odometer repository/history. | PASS | OdometerRepository add/listForVehicle/latest; test: independent per-vehicle readings and dates. |
| T046 | Maintenance/document repositories. | PASS | ScheduleRepository (append-only, current(vehicleId)), DocumentRepository (original file columns), ExtractionRepository (separate table). Tests: schedule round-trip incl. verification, original vs derived kept separate. |
| T047 | Service/history repositories. | PASS | ServiceRepository: atomic event+ordered actions+doc links, list sorted history, get(vehicleId,id); refuses cross-vehicle document link with full rollback (test). |
| T048 | Alerts/settings persistence. | PASS | AlertRepository (basis json, status update w/ version, ownerOf for deep links), GarageRecommendationRepository, DeferredItemRepository.listOpen, SettingsRepository. Tests. |
| T049 | Vehicle archive lifecycle persistence. | PASS | persistence/lifecycle.ts archive/restore (keeps all data, clears active pointer) + VehicleRepository.deletionPreview/deletePermanently (atomic cascade, only that vehicle). Tests. |
| T050 | Restart/offline/isolation tests and M05 PASS. | PASS | M05 gate: restart test (export bytes → reopen → migrate no-op → data + active vehicle intact), zero cross-vehicle leakage test across documents/services/recs/deferred/alerts; device restart simulation via /dev/db-check REOPEN vehicle=true active=true, UUID OK, DBCHECK PASS; npm run verify green (10 suites/86 tests); Android export OK. M05 PASS. |

## M06 Vehicle Identification

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T051 | Camera/file acquisition boundary. | PASS | src/providers/acquisition: AcquisitionProvider port (camera/library/file), screenAcquiredFile allow-list + size bounds, expo-image-picker/document-picker adapter (no EXIF, cache dir). Tests: screening, cancelled/permission_denied returned in context. On-device camera/picker check deferred to M13 wiring (open item). |
| T052 | Registration-document extraction contract. | PASS | identification/contract.ts: zod schema, per-field value+confidence, documentType, strip unknown keys; no owner name/ID/address fields (data minimization); RegistrationExtractor port; MockRegistrationExtractor (labeled) validates via same schema. Tests: malformed rejected, PII stripped. |
| T053 | Vehicle-type recognition: car/motorcycle/scooter. | PASS | recognizeType: deterministic from category text (car/M1/N1 → car; explicit אופנוע/קטנוע), L-category two-wheelers → ambiguous (never guesses motorcycle vs scooter). Tests. |
| T054 | Confidence and ambiguity handling. | PASS | Confidence thresholds 0.9/0.6 (accept/uncertain/missing), malformed → missing; resolveIdentification: multiple catalog variants → needs_selection, single → fills gaps as catalog without overwriting scan; non-license → failed. Tests. |
| T055 | Confirmation and missing-fields engine. | PASS | Draft engine: REQUIRED_FIELDS, missingFields (only missing necessary), uncertainFields, applyUserInput (validated, origin user), confirmUncertain, toVehicleInput blocks until complete → domain createVehicle. Test end-to-end to Vehicle. |
| T056 | Manual fallback. | PASS | manualDraft: same draft shape, all origin=user, validated per field. Test. |
| T057 | Identification acceptance tests and M06 PASS. | PASS | identification.test.ts 15 acceptance tests (pipeline with mock extractor: full scan, unreadable/error/junk, ambiguous two-wheeler type, catalog ambiguity). Purity lint extended to src/identification. ADR-0009 (incl. data.gov.il registry as approval-gated candidate). npm run verify green (11 suites/101 tests). M06 PASS. |

## M07 Cloud Foundation

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T058 | Supabase local/dev integration design. | PASS | docs/cloud/SUPABASE.md: local (Docker) vs hosted (gated) environments, data mapping, ownership model, RLS, storage, auth, server boundary, tests. Local stack via pinned supabase CLI 2.118.0 on ports 566xx (coexists with other local projects), unneeded services disabled for 4GB Docker VM. |
| T059 | PostgreSQL schema and migrations. | PASS | supabase/migrations/20260926000001_initial_schema.sql: Postgres schema mirroring SQLite (typed dates/timestamptz/jsonb, CHECKs), owner_id everywhere, composite (vehicle_id, owner_id) FKs, server_updated_at + owner-immutability triggers. Applied by supabase start/db reset. |
| T060 | Authentication integration. | PASS | src/cloud/client.ts (supabase-js, anon key only, PKCE, session in expo-secure-store via chunked adapter), auth.ts (email OTP request/verify, error mapping, sign-out). secureSessionStorage.test.ts (3): >2KB sessions, cleanup, partial-write safety. |
| T061 | Ownership/authorization/RLS. | PASS | RLS enabled+forced on all 12 tables, owner policies for select/insert/update/delete, anon revoked; composite FK blocks client-supplied foreign vehicle_id. Cloud tests: cross-user select/update/delete/insert denied, forged owner_id denied, owner immutable; negative control (leaky policy) detected by suite. |
| T062 | Private document storage. | PASS | Private bucket 'documents' (public=false, 50MB, MIME allow-list), path {owner}/{vehicle}/{doc} policies via can_access_document_path. Cloud tests: owner upload + signed URL, public URL refused, cross-user download/sign/list/overwrite denied, foreign-vehicle folder denied, text/html rejected. |
| T063 | Server-side API/security boundaries. | PASS | Boundary: client = anon key + JWT under RLS; RPC vehicle_deletion_preview/delete_vehicle_permanently SECURITY INVOKER (cloud-tested ownership); service role server-only; secrets-boundary.test.ts scans app sources for service_role/sb_secret/JWT_SECRET/EXPO_PUBLIC secrets (none). |
| T064 | Local security tests. | PASS | npm run test:cloud (jest.cloud.config.js, real Node fetch) — rls.cloud.test.ts 11/11 against local stack with two real users; negative control failed as expected then db reset → 11/11; CI job cloud-security added (ephemeral local stack). |
| T065 | APPROVAL GATE for material external Supabase resources/migrations when required. | PASS — gate not triggered | No material external Supabase resources were needed: all M07 work and upcoming M08/M09 tests run on the local Docker stack. Creating a hosted Supabase project (account/region/plan/cost/data residency) remains an approval gate, deferred to release (M24) and will be requested before any creation. |
| T066 | Cloud verification and M07 PASS. | PASS | M07 gate: npm run verify green (13 suites/109 tests; one earlier run had 5 load-related failures not reproduced in 3 subsequent runs — tracked), npm run test:cloud 11/11, docs + ADR updated. M07 PASS. |

## M08 Account Migration

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T067 | Local identity strategy. | PASS | Local identity: device LocalProfile owns all data pre-account (accountUserId null), adoption state machine none/pending/adopted persisted in settings; bundle maps every local table to cloud columns excluding device-only settings. Tests (2). |
| T068 | Delayed account-creation flow. | PASS | account/offer.ts accountOfferDecision: not on first use or vehicle-only, shown once history/documents exist, 14-day snooze on 'not now', hidden with account. Tests (2). UI wiring of real OTP flow scheduled with M13/M19 (account screen already framed as backup). |
| T069 | Transactional local-to-account adoption. | PASS | Migration 20260926000002 RPC adopt_local_data(jsonb): single transaction, SECURITY INVOKER (RLS + composite FKs), dynamic column lists, ON CONFLICT DO NOTHING; adoptLocalData with read-back verification before linking profile; supabaseAdoptionCloud adapter. Unit + cloud tests. |
| T070 | Recovery/failure handling. | PASS | Recovery: pending persisted across restart (tested via DB export/reopen), network/not_signed_in/server_rejected/verification_mismatch all non-destructive and retryable, different_account refused, local history unchanged by adoption. Tests (5). |
| T071 | No-data-loss tests and M08 PASS. | PASS | adoption.cloud.test.ts (4) on local Supabase: every row uploaded with field-level equality + idempotent retry; invalid row → entire bundle rolled back (0 rows); adopted data invisible to others; hostile id collision → safe pending, no leak. npm run test:cloud 15/15, npm run verify 14 suites/119 tests. ADR-0010. M08 PASS. |

## M09 Sync

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T072 | Sync protocol/version model. | PASS | ADR-0011 protocol: op model (op_id, table, op, base_version, row), versioned entities, append-only vs mutable classes, cursors on (server_updated_at,id), tombstones; shared local↔cloud mapping (src/sync/mapping.ts) reused by adoption; per-device profiles (cloud unique dropped, deviceProfileId pinned). |
| T073 | Outbound queue. | PASS | Local migration v2: trigger-based outbox (same transaction), coalescing keeping original base_version + fresh op_id, applying flag suppression, vehicle-delete trigger. Tests (4): enqueue/coalesce/re-key, suppression, delete handling, atomic rollback with change. |
| T074 | Inbound synchronization. | PASS | pullChanges: keyset cursor per table + tombstones, triggers suppressed, pending rows merged not overwritten, shadows maintained; supabaseSyncTransport. Cloud test: fresh second device restores all account data identical to device A. |
| T075 | Retry/idempotency. | PASS | sync_push idempotent via sync_applied_ops ledger (cloud test: same op twice → applied then duplicate), outbox ack only if op_id unchanged, backoff with jitter 5s→15min (unit), network failure keeps outbox and returns retryInMs (cloud test). |
| T076 | Entity-aware conflict resolution. | PASS | merge.ts entity-aware: append-only both kept, alerts monotonic (handled terminal), deferred resolution sticky, vehicles/profiles 3-way field merge vs sync_shadow with lifecycle group; conflicts recorded in sync_conflicts. Unit (5) + cloud (same-field conflict → later wins + recorded; handled vs snoozed → handled). |
| T077 | Multi-device scenarios. | PASS | sync.cloud.test.ts multi-device: two SQLite devices on one account — independent services both kept, A archives car while B edits trim on same car → both preserved, no false conflicts; tombstone deletion propagates; negative control (shadows disabled) fails the archive assertion as expected. |
| T078 | Offline-to-online acceptance and M09 PASS. | PASS | Offline→online acceptance: offline edits on both devices, sync in any order → converge, outboxes empty, no data loss; npm run test:cloud 21/21 (stable x3), npm run verify 15 suites/129 tests. M09 PASS. |

## M10 Official Source Discovery

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T079 | Provider-independent discovery interface. | PASS | src/discovery/types.ts: VehicleIdentityQuery, SourceCandidate, DiscoveryProvider port, DocumentCoverage (facts from document itself, never guessed). |
| T080 | Source authority/classification rules. | PASS | authority.ts: authority only from HTTPS host ∈ verified official-domain registry (manufacturer > importer), lookalike/credentials-in-URL/other-manufacturer rejected; shipped registry intentionally empty until verified (no guessing). Tests (3). |
| T081 | Manufacturer/official-importer source discovery. | PASS — approved G1 scope | Per G1 decision (docs/gates/G1-providers.md): discovery kept behind DiscoveryProvider port; orchestration pipeline (discovery→authority→retrieval→coverage→applicability→validation) tested with fixtures; MockDiscoveryProvider (labeled) for app flows; trust only via verified official-domain registry (shipped empty). No runtime discovery provider chosen — future gate before real verified-source behavior. |
| T082 | Exact vehicle applicability matching. | PASS | applicability.ts: exact only when manufacturer/model/year/engine/modelCode/market proven from document coverage; hard mismatch vs not_proven (missing/ambiguous facts never assumed); engine normalization. Tests (4). |
| T083 | Document retrieval/versioning. | PASS | retrieval.ts: HTTPS + final URL must stay official, PDF only, size/empty/hash checks; versioning appends new version on content change, never overwrites. Tests (2). |
| T084 | Provenance capture. | PASS | pipeline.ts produces Evidence {authority, reference.sourceId, exactApplicability} + retrievedAt for ADR-0003 provenance; tested. |
| T085 | Uncertain/no-source handling. | PASS | Uncertain/no-source: not_found (with rejected reasons / providerError) and pending (official but not exact) — never verified by assumption, no schedule invented; poisoning test (unofficial 'OFFICIAL manual' rejected). Tests (4). |
| T086 | Discovery fixtures/tests and M10 PASS. | PASS | discovery.test.ts 14 + data.gov.il registry (G1 primary vehicle source, ADR-0012): 8 unit tests with recorded shapes (consent enforced, package-name resource resolution, two-wheeler/car/code-only→WLTP catalog mapping, ambiguity→selection, registry outranks OCR not user, failures in context, TTL re-resolution) + opt-in live test passing against real data.gov.il; engine-code parsing fix. verify 17 suites/151 tests (maxWorkers=2 after 2nd load-flake occurrence, not reproducible standalone), cloud 21/21. M10 PASS. |

## M11 Document Intelligence

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T087 | OCR abstraction. | PASS | intelligence/ports.ts OcrProvider (pages/lines/confidence, he+en) + MockOcrProvider (labeled; G1: no runtime provider). |
| T088 | AI extraction abstraction. | PASS | StructuredExtractor port whose signature only accepts UntrustedContent (document never concatenated into instructions) + MockStructuredExtractor recording what it received (test: only wrapped data). |
| T089 | Structured schemas and validation. | PASS | schemas.ts zod: maintenance (coverage, intervals with rule/limit consistency, items with evidence page+quote, confidence) and invoice (value+confidence+optional evidence, lines); unknown keys stripped, invalid rejected. Tests (2). |
| T090 | Page/section evidence references. | PASS | evidence.ts groundQuote: quote must exist on cited page (normalized exact or ≥90% token coverage); paraphrase/invented/wrong page not grounded; digit grouping/quotes/dash normalization via code-point-built regexes (no invisible literals in source). Tests (3). |
| T091 | Confidence/verification pipeline. | PASS | pipeline.ts extractMaintenanceSchedule: OCR→wrap→AI→schema→grounding→confidence (<0.6 drop, <0.9 review)→domain input; flagged docs withhold exact applicability; domain decides verification. Tests (7): clean official→verified, fabricated/low-confidence dropped, nothing grounded→failed, injected doc→pending, non-official→unverified, failures reported. |
| T092 | Prompt-injection and untrusted-document defenses. | PASS | injection.ts: hidden/bidi char stripping, instruction-like (EN/HE) + line-start role markers + boundary-tag forgery flagged, unforgeable random boundary, length bounds, UNTRUSTED_DATA_POLICY for adapters. Tests (3). |
| T093 | Invoice extraction to draft only. | PASS | extractInvoiceDraft → ServiceDraft only (origin document, doc linked), uncertain fields listed, <0.6 values not prefilled, flagged docs marked; history only via confirmServiceDraft (test). Tests (2). |
| T094 | Extraction security/tests and M11 PASS. | PASS | intelligence.test.ts 17 security/behavior tests; ADR-0013; purity lint extended to src/intelligence; npm run verify 18 suites/168 tests. M11 PASS (approved G1 scope: labeled mocks, no runtime AI provider). |

## M12 Maintenance Engine

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T095 | Mileage intervals. | PASS | engine: due km = last performed id-linked service + everyKm; tests (last-service, distance-first overdue, upcoming window, distance_only). |
| T096 | Time intervals. | PASS | due date = last service + everyMonths with month-end clamping; time-only rule; tests (time-first overdue, Jan31+1m). |
| T097 | Earliest-of rules. | PASS | earliest_of: status from whichever limit first; both remainders reported; tests. |
| T098 | Service-history reconciliation. | PASS | lastPerformance: latest performed action linked by maintenanceItemId; not-performed and unlisted same-title actions ignored; test. |
| T099 | Next-due/overdue computation. | PASS | next service = most urgent item + bundle within 1500 km/45 days; no-history never overdue (historyMissing), first-service & milestone baselines, time unknown without in-service date; stale odometer flag (>60 days); tests. |
| T100 | Driving-rate forecast explicitly represented as forecast. | PASS | drivingRate (≥30 days span, positive distance) → Forecast<number>; kmDueForecast Forecast<IsoDate> with basis, separate from facts; insufficient data → null; tests (exact expected date verified by hand after correcting my own arithmetic). |
| T101 | Deferred-item logic. | PASS | openDeferral: open deferral → due now (basis deferred) until a later service performs the item; tests. |
| T102 | Deterministic fixture suite and M12 PASS. | PASS | engine/**tests**/maintenance.test.ts 19 deterministic fixture tests incl. schedule gate, determinism/no mutation, 200 randomized inputs without NaN; ADR-0014; verify 19 suites/187 tests. M12 PASS. |

## M13 Real Data Integration

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T103 | Home adapters. | PASS | features/data/adapters.ts toVehicleSummary + LocalStore snapshot (records→engine→VMs); vehicles/odometer/active vehicle from SQLite. Tests: localStore.test (9), device Home from SQLite. |
| T104 | Maintenance adapters. | PASS | toScheduleVM: verified schedule → next/upcoming/interval labels from engine; unverified → reason (no source/not exact/not official/conflicting), no next. engine/alerts.ts candidates, persisted identity+handled. Tests: adapters.test (10). |
| T105 | Source/evidence adapters. | PASS | SourceRepository + toSourceRef/locatorOf: title, edition, authority, exact locator (page/section/table/figure), documentId; document extraction status separate from original; user-report services never claim garage evidence. Tests: adapters/localStore. |
| T106 | Replace UI mock data. | PASS | AppDataValue contract; LocalDataProvider default, PrototypeDataProvider only in demo/UI tests; onboarding real services (expo acquisition, extractor null per G1, data.gov.il lookup with consent, no discovery → honest not-found); no placeholder docs in real store. ADR-0015. Device: manual onboarding → Home from SQLite, persisted across cold restart; camera permission prompt shown (acquisition boundary live). |
| T107 | Preserve approved visual baseline. | PASS | Device (SM-A546E, Expo Go) real mode: welcome, manual entry + registry card, confirm (origin badges), odometer, sources not-found, Home/Maintenance/History/Documents/Alerts honest empty/unavailable states match baseline layout & RTL; demo mode unchanged (UI suites 29/29). Fixed device-found: SQLite reopen NPE after reload, scan denial feedback. |
| T108 | Integration tests and M13 PASS. | PASS | M13 PASS: verify 22 suites/209 tests (format, lint, tsc); real-data.test.tsx router integration (onboarding via registry, restart persistence, odometer update clears stale alert, camera denial); cloud 21/21. |

## M14 Garage Mode

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T109 | Manufacturer section. | PASS | Manufacturer section from verified schedule only: next title + DueStatusBadge, due point, interval label, items with action type + exact locator, schedule source (title·authority·edition); unavailable → statement + reason. Test garage-mode.test (manufacturer). |
| T110 | AutoKeep-known section. | PASS | Known section: vehicle, registration, odometer+date, last service with provenance (מסמך מוסך / דיווח משתמש), record count, open deferrals. Test garage-mode.test (known). |
| T111 | Garage-recommendation section. | PASS | Garage section: disclaimer, notes with provenance (מתוך מסמך מוסך / הוזן ידנית); add note → GarageRecommendation user_report persisted. Device: note saved on SQLite, shown only in garage section. Fixed device-found: Dialog now keyboard-avoiding (Save was under keyboard). |
| T112 | Provenance-separation tests and M14 PASS. | PASS | M14 PASS: garage-mode.test (4) — note never alters schedule row/items, scoped to vehicle, unverified schedule shows nothing invented; verify 23 suites/213 tests. |

## M15 Service Capture

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T113 | Manual service entry. | PASS | Manual entry on real data: schedule items preselectable, date/odometer/work minimum, stored via confirmServiceDraft (user_report, unverified) + odometer reading. service-capture.test (manual). Device: manual record saved to SQLite, shown in History with user-report badge. |
| T114 | Invoice photo/file ingestion. | PASS | Invoice photo (camera) / file (document picker) through acquisition port; original copied to app-private originals/ with SHA-256 (expo-file-system + expo-crypto, OriginalFileStore port); stored only on confirmation. Rejected/denied explained in place. Tests: localStore (attachment), service-capture (invoice). |
| T115 | Extracted-draft review. | PASS | extract.tsx runs M11 extractInvoiceDraft via invoiceReader port (null in prod per G1 → 'reading unavailable', user fills from invoice); mergeInvoiceDraft prefills, uncertain marks, flagged docs mark all. Tests: invoiceDraft.test (3), service-capture (mock reader: draft only, wrapped untrusted content). |
| T116 | Performed checkboxes plus independent action type. | PASS | Checkbox = performed; action type chosen independently (inspection stored for a replacement item). Only performed actions stored. service-capture.test + device review screen. |
| T117 | Unlisted actions. | PASS | Unlisted actions added in form/extraction are stored unlisted=true with maintenanceItemId=null (never count for the schedule, ADR-0014). service-capture.test. |
| T118 | Explicit confirmation transaction. | PASS | Confirmation dialog names target vehicle; LocalStore.addServiceEvent: file import → ONE transaction (document + event + reading); failure removes copied file; rejected record leaves no rows/files. Negative control: dropping the attachment fails 2 tests. Tests: localStore (3), service-capture. |
| T119 | Service/history tests and M15 PASS. | PASS | M15 PASS: verify 25 suites/223 tests (format, lint, tsc). |

## M16 History & Documents

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T120 | Chronological history. | PASS | History newest-first from ServiceRepository (sortHistory), independent of insertion order; separate from schedule. history-documents.test (chronology). |
| T121 | Service detail. | PASS | Service detail on real data: all actions + performed state, provenance badges (authority/origin/verification), linked originals navigate to document. history-documents.test (detail). |
| T122 | Document library. | PASS | Library upload (real): document picker → kind dialog → addDocument; original stored (originals/, SHA-256); authority by kind (invoice→garage_document, registration→vehicle_document, else user_report) — uploads never manufacturer/importer. Device: test image uploaded as owners manual, shown 'user report / pending'. Fixed device-found: Expo Go picker cache outside scoped storage → content URI copied into private cache. |
| T123 | Original-document access. | PASS | Document detail loads the stored original: inline image preview, SHA-256 re-verified (intact/modified/missing badges), 'open original' via system share sheet (expo-sharing); missing file disables open. Device: preview + 'intact' + share sheet verified. Tests: history-documents (intact/open/tamper/missing). |
| T124 | Source/evidence navigation. | PASS | Evidence links carry the exact locator (page/section/table) to the document screen (document-evidence-locator). history-documents.test (T124). |
| T125 | Provenance verification and M16 PASS. | PASS | M16 PASS: uploads stay user-level evidence (schedules untouched), originals integrity-checked, derived extraction shown separately; verify 26 suites/229 tests. |

## M17 Alerts

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T126 | Alert rule engine. | PASS | engine/alerts.ts: alertCandidates (stable keys) + pure planAlerts lifecycle (create / resolve cleared → handled+resolution=condition_cleared / reactivate expired snooze; handled stays handled). Domain resolveAlert/reactivateAlert. Tests: notificationPlan.test (lifecycle), alerts.test. |
| T127 | Upcoming/overdue maintenance. | PASS | Upcoming/overdue only from a verified computed schedule; missing history never overdue (engine); visit due only by deferral → deferred alert, no duplicate overdue. Explainable reason/basis/last completion. Tests: adapters, localStore, alerts.test. |
| T128 | Stale odometer. | PASS | Stale odometer only where it impairs a distance-based due point of a verified schedule (spec §14). Updating the reading resolves it. Tests: adapters (both ways), alerts.test (stale → resolved). |
| T129 | Deferred actions. | PASS | Service form: 'defer to next service' on unperformed manufacturer items → DeferredItem at confirmation; a later service performing the item resolves open deferrals in the same transaction (sync-merge sticky). Tests: alerts.test (defer + resolve). |
| T130 | Notification scheduling. | PASS | Local notifications only (no push service): pure planNotifications (one notice per alert out of quiet hours, week-before reminder for dated upcoming, past never rescheduled, vehicle-named); opt-in in Settings requests OS permission; NotificationScheduler port (lazy expo-notifications; unavailable in Expo Go — device-verified import crash → honest Settings notice). Tests: notificationPlan (5), alerts.test (opt-in/denied/unavailable). |
| T131 | Vehicle-aware deep links. | PASS | Notification tap → /alerts/<id>; alert detail switches the active context to the alert's vehicle (persisted). alerts.test: car reminder tapped while motorcycle active → car active. |
| T132 | Alert explainability tests and M17 PASS. | PASS | M17 PASS: alerts.test (7) + notificationPlan (5); snooze 7 days via store clock; screens date records with the data source clock (deterministic); verify 28 suites/242 tests; cloud 21/21. |

## M18 Multi-Vehicle Hardening

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T133 | Car + motorcycle + scooter scenario. | PASS | Car + motorcycle + scooter in one real store: own schedule state (verified only for moto), odometer, garage notes, alerts per vehicle. multi-vehicle.test. |
| T134 | Switch-context stress tests. | PASS | Repeated switching (7 switches) — history always the active vehicle's only; switching persists only the pointer. multi-vehicle.test. Found+fixed: latest-reading tie on equal date/time now prefers the higher value (odometer monotonic). |
| T135 | Documents/history isolation. | PASS | Records opened by id show their own vehicle; wrong-vehicle reads return nothing (original(), alert handling). multi-vehicle + leakage tests. |
| T136 | Notifications/deep-link isolation. | PASS | Reminders name their vehicle; tap opens that vehicle's alert and switches context; no other vehicle's data on the screen. multi-vehicle.test (T136). |
| T137 | Zero-cross-vehicle-leakage gate and M18 PASS. | PASS | M18 PASS: leakage.test — seeded random op sequences (3 seeds × 40 ops) with isolation asserted after every step + orphan-row check; negative control (history leak) fails 5/8 tests. verify 30 suites/250 tests. |

## M19 Settings/Account

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T138 | Profile/account. | PASS | Account screen real mode: email → one-time code → verify (AccountBackend port; Supabase impl only with cloud config, else honest 'unavailable'); on sign-in the device data is adopted (read-back verified) and synced; sign-out keeps local data. Device E2E vs local Supabase (adb reverse): code sign-in, adoption, first backup; phone's Honda+service+document+note present in the account. Fixed: magic-link email → code template; PKCE→implicit (Hermes lacks WebCrypto). Tests: account.test (5), account.cloud.test. |
| T139 | Notification preferences. | PASS | Notification preferences: opt-in switch with OS permission, denied/unavailable explained (M17). account.test settings + alerts.test. |
| T140 | Sync/backup status. | PASS | Backup status: connected/adopting, last backup date, pending-change count, sync errors (network/server/different account/not signed in), 'backup now'. Offline change stays pending then backs up (account.test); real push/pull vs local Supabase with RLS isolation (account.cloud.test). |
| T141 | Vehicle management. | PASS | Vehicle management reachable from Settings on real data (list, manage, archive/restore/delete screens from M05/M13). account.test settings; lifecycle depth in M20. |
| T142 | General/accessibility preferences. | PASS | General/accessibility: Hebrew/RTL, text follows device font scale (capped where needed, M03), shown in Settings. account.test settings. |
| T143 | Settings acceptance and M19 PASS. | PASS | M19 PASS: verify 31 suites/256 tests; cloud 22/22 twice (store adoption+sync+RLS; fixed test id collision with rows kept from earlier runs — adoption correctly refused foreign ids). |

## M20 Vehicle Lifecycle

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T144 | Archive/restore. | PASS | Archive keeps every record, clears active context; restore returns the vehicle with history intact; archived excluded from notifications (M17). lifecycle.test (2). |
| T145 | Permanent-delete preview. | PASS | Delete preview = exact DB counts (services, documents, readings, garage notes, alerts) via VehicleRepository.deletionPreview. lifecycle.test. |
| T146 | Controlled deletion. | PASS | Typed-registration confirmation; one-transaction row deletion, then stored originals removed; other vehicles untouched. lifecycle.test (rows + files + isolation). |
| T147 | Dossier generation. | PASS | Dossier from source-of-truth records incl. real odometer readings (bundle.readings) with source labels; device-verified screen. |
| T148 | Provenance-aware dossier. | PASS | buildDossierHtml: RTL, provenance on every fact (user-reported labeled, authority · verification), schedule only if verified, HTML-escaped user text. lifecycle.test (HTML unit). |
| T149 | Export/share. | PASS | DocumentExporter port: expo-print (base64) → app-private PDF → system share sheet (user chooses target; nothing uploaded). Device: PDF generated and share sheet opened. Fixed device-found: expo-print output outside readable scope. Failure explained (lifecycle.test). |
| T150 | Lifecycle acceptance and M20 PASS. | PASS | M20 PASS: lifecycle.test (6) + device dossier/PDF share; verify 32 suites/262 tests. |

## M21 Failure/Recovery

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T151 | No-network behavior. | PASS | NetworkMonitor port (NetInfo; unknown reachability = online, never blocks): offline banner, registry lookup paused with reason, all local actions keep working. Device: phone with no active network shows the offline banner. failure-recovery.test. |
| T152 | Failed scan/ambiguous identification. | PASS | Unreadable scan → in-context failure with retry + manual; multiple registry matches → user chooses, nothing guessed. failure-recovery.test (+ onboarding tests). |
| T153 | Source unavailable/unverified. | PASS | No/unverified/not-exact/conflicting source → schedule unavailable with the specific reason; onboarding honest not-found (adapters.test, real-data.test, garage-mode.test). |
| T154 | Corrupt/unreadable document. | PASS | Corrupt/unreadable document → reading failed explained, draft stays editable; rejected/empty files explained at capture; tampered originals detected (history-documents.test). failure-recovery.test. |
| T155 | OCR/AI failure. | PASS | OCR failure / invalid AI output discarded (never shown as data) / instruction-carrying document flagged with all values marked for review. failure-recovery.test + intelligence tests (M11). |
| T156 | Upload/sync failure. | PASS | Sync failure recorded and shown; changes stay pending; backup resumes automatically when the connection returns (negative control: disabling resume fails the test). failure-recovery.test + account.test. |
| T157 | Stale odometer behavior. | PASS | Stale odometer only where it impairs a distance calculation; explained; resolved by a new reading (alerts.test, adapters.test). |
| T158 | Conflict/recovery. | PASS | Interrupted write (failure after document insert) leaves no partial rows and no orphaned file; two-device conflicts shown once with acknowledgement (sync_conflicts.resolved); DB open failure → retry + fresh-connection recovery (M13 device-verified). failure-recovery.test. |
| T159 | No-dead-end/no-fabrication gate and M21 PASS. | PASS | M21 PASS: every failure path tested offers a next action and fabricates nothing; verify 33 suites/272 tests; cloud 22/22. |

## M22 Security/Privacy

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T160 | AutoKeep threat model. | PASS | docs/security/THREAT_MODEL.md: assets, actors, trust boundaries, STRIDE table (18 threats) each mapped to code + test evidence. |
| T161 | Auth/RLS/BOLA/IDOR testing. | PASS | RLS/BOLA/IDOR: rls.cloud (anon, ownership, forged owner, client-supplied vehicle_id, SECURITY INVOKER RPCs, storage), adoption.cloud (hostile id collision), account.cloud (other user cannot read/sign objects); cloud 23/23. |
| T162 | Storage/upload security. | PASS | Originals: private bucket upload after sync (uid/vehicle/document path, storage RLS), on-demand restore on a new device with SHA-256 re-verification (mismatch discarded); missing/modified never uploaded; type/size bounds. account.cloud.test + account.test. Finding F-01 (High) fixed. |
| T163 | Secrets/config review. | PASS | Secrets: only EXPO_PUBLIC_* in client; .env*/.env.local git-ignored (dev .env.local not committed); repo scan for keys finds only detector regex; secrets-boundary.test. |
| T164 | PII/VIN/registration/log redaction. | PASS | src/security/redact.ts (VIN/plate → last 4, email/phone removed, bounded) applied to all log/technical-error paths; UI masks VIN; registry sends plate only with consent; no EXIF. redact.test (4). Finding F-02 fixed. |
| T165 | AI/source-poisoning review. | PASS | Source poisoning & prompt injection reviewed: verified-domain registry only (ships empty), exact applicability, uploads never official, boundary-wrapped untrusted content, flags, schema + grounding, draft-only (THREAT_MODEL T4/T5; intelligence + failure-recovery tests). |
| T166 | Dependency/security scanning. | PASS | npm audit: 0 critical / 0 high / 15 moderate (Expo build tooling; expo-router query-string DoS via malformed deep link) — accepted residual with rationale, re-check at RC (THREAT_MODEL §6). |
| T167 | OWASP-oriented review. | PASS | OWASP MASVS-oriented review (STORAGE/CRYPTO/AUTH/NETWORK/PLATFORM/CODE/PRIVACY) in THREAT_MODEL §5; residual: SQLite not encrypted at rest (accepted, F-04). |
| T168 | Remediate Critical/High findings and M22 PASS. | PASS | M22 PASS: findings register — no open Critical/High (F-01 High fixed, F-02/F-03 Medium fixed, F-04/F-05 Low accepted); verify 34 suites/277 tests; cloud 23/23. |

## M23 Full Acceptance

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T169 | Fresh-user E2E. | TODO | |
| T170 | Verified-source-to-maintenance E2E. | TODO | |
| T171 | Garage-to-service-to-history E2E. | TODO | |
| T172 | Offline-to-sync E2E. | TODO | |
| T173 | Account/device-recovery E2E. | TODO | |
| T174 | Multi-vehicle E2E. | TODO | |
| T175 | Motorcycle/scooter E2E. | TODO | |
| T176 | Archive/dossier E2E. | TODO | |
| T177 | Complete regression and M23 PASS. | TODO | |

## M24 Release Candidate

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T178 | Release configuration. | TODO | |
| T179 | Backup/restore validation. | TODO | |
| T180 | Production-readiness documentation. | TODO | |
| T181 | Known-limitations review. | TODO | |
| T182 | Clean-build/reproducibility check. | TODO | |
| T183 | Final security/regression gate. | TODO | |
| T184 | Produce V1 RC report and AUTOKEEP V1 RC PASS. | TODO | |
