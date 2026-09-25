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

| T013 | Onboarding and registration/license scan UI. | TODO | |
| T014 | Vehicle confirmation and missing-data flow. | TODO | |
| T015 | Source-search progress/result states. | TODO | |
| T016 | Home. | TODO | |
| T017 | Maintenance schedule and next-service screen. | TODO | |
| T018 | Expandable maintenance-item evidence. | TODO | |
| T019 | Garage Mode. | TODO | |
| T020 | Service capture: photo/file/manual. | TODO | |
| T021 | Service review and confirmation. | TODO | |
| T022 | Service history and detail. | TODO | |
| T023 | Documents. | TODO | |
| T024 | Alerts. | TODO | |
| T025 | My Vehicles, switcher and add vehicle. | TODO | |
| T026 | Account/backup UX. | TODO | |
| T027 | Settings. | TODO | |
| T028 | Archive/sale/permanent-delete UX. | TODO | |
| T029 | Vehicle Dossier preview/share UX. | TODO | |
| T030 | Mock end-to-end navigation verification and M02 PASS. | TODO | |

## M03 Visual Acceptance

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T031 | Android device rendering verification. | TODO | |
| T032 | RTL, keyboard, scrolling, safe area and font-scaling verification. | TODO | |
| T033 | Loading/error/empty/offline visual-state verification. | TODO | |
| T034 | Resolve visual defects within approved design. | TODO | |
| T035 | Freeze UI baseline and record M03 PASS. | TODO | |

## M04 Domain

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T036 | Core vehicle/account value objects and stable IDs. | TODO | |
| T037 | Provenance and verification model. | TODO | |
| T038 | Maintenance schedule/interval/item model. | TODO | |
| T039 | Service event/action model. | TODO | |
| T040 | Documents/sources/source-reference model. | TODO | |
| T041 | Garage recommendations and alerts domain. | TODO | |
| T042 | Domain invariants/tests and M04 PASS. | TODO | |

## M05 Local-first Persistence

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T043 | SQLite integration and migration framework. | TODO | |
| T044 | Vehicle repository and active-vehicle persistence. | TODO | |
| T045 | Odometer repository/history. | TODO | |
| T046 | Maintenance/document repositories. | TODO | |
| T047 | Service/history repositories. | TODO | |
| T048 | Alerts/settings persistence. | TODO | |
| T049 | Vehicle archive lifecycle persistence. | TODO | |
| T050 | Restart/offline/isolation tests and M05 PASS. | TODO | |

## M06 Vehicle Identification

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T051 | Camera/file acquisition boundary. | TODO | |
| T052 | Registration-document extraction contract. | TODO | |
| T053 | Vehicle-type recognition: car/motorcycle/scooter. | TODO | |
| T054 | Confidence and ambiguity handling. | TODO | |
| T055 | Confirmation and missing-fields engine. | TODO | |
| T056 | Manual fallback. | TODO | |
| T057 | Identification acceptance tests and M06 PASS. | TODO | |

## M07 Cloud Foundation

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T058 | Supabase local/dev integration design. | TODO | |
| T059 | PostgreSQL schema and migrations. | TODO | |
| T060 | Authentication integration. | TODO | |
| T061 | Ownership/authorization/RLS. | TODO | |
| T062 | Private document storage. | TODO | |
| T063 | Server-side API/security boundaries. | TODO | |
| T064 | Local security tests. | TODO | |
| T065 | APPROVAL GATE for material external Supabase resources/migrations when required. | TODO | |
| T066 | Cloud verification and M07 PASS. | TODO | |

## M08 Account Migration

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T067 | Local identity strategy. | TODO | |
| T068 | Delayed account-creation flow. | TODO | |
| T069 | Transactional local-to-account adoption. | TODO | |
| T070 | Recovery/failure handling. | TODO | |
| T071 | No-data-loss tests and M08 PASS. | TODO | |

## M09 Sync

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T072 | Sync protocol/version model. | TODO | |
| T073 | Outbound queue. | TODO | |
| T074 | Inbound synchronization. | TODO | |
| T075 | Retry/idempotency. | TODO | |
| T076 | Entity-aware conflict resolution. | TODO | |
| T077 | Multi-device scenarios. | TODO | |
| T078 | Offline-to-online acceptance and M09 PASS. | TODO | |

## M10 Official Source Discovery

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T079 | Provider-independent discovery interface. | TODO | |
| T080 | Source authority/classification rules. | TODO | |
| T081 | Manufacturer/official-importer source discovery. | TODO | |
| T082 | Exact vehicle applicability matching. | TODO | |
| T083 | Document retrieval/versioning. | TODO | |
| T084 | Provenance capture. | TODO | |
| T085 | Uncertain/no-source handling. | TODO | |
| T086 | Discovery fixtures/tests and M10 PASS. | TODO | |

## M11 Document Intelligence

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T087 | OCR abstraction. | TODO | |
| T088 | AI extraction abstraction. | TODO | |
| T089 | Structured schemas and validation. | TODO | |
| T090 | Page/section evidence references. | TODO | |
| T091 | Confidence/verification pipeline. | TODO | |
| T092 | Prompt-injection and untrusted-document defenses. | TODO | |
| T093 | Invoice extraction to draft only. | TODO | |
| T094 | Extraction security/tests and M11 PASS. | TODO | |

## M12 Maintenance Engine

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T095 | Mileage intervals. | TODO | |
| T096 | Time intervals. | TODO | |
| T097 | Earliest-of rules. | TODO | |
| T098 | Service-history reconciliation. | TODO | |
| T099 | Next-due/overdue computation. | TODO | |
| T100 | Driving-rate forecast explicitly represented as forecast. | TODO | |
| T101 | Deferred-item logic. | TODO | |
| T102 | Deterministic fixture suite and M12 PASS. | TODO | |

## M13 Real Data Integration

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T103 | Home adapters. | TODO | |
| T104 | Maintenance adapters. | TODO | |
| T105 | Source/evidence adapters. | TODO | |
| T106 | Replace UI mock data. | TODO | |
| T107 | Preserve approved visual baseline. | TODO | |
| T108 | Integration tests and M13 PASS. | TODO | |

## M14 Garage Mode

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T109 | Manufacturer section. | TODO | |
| T110 | AutoKeep-known section. | TODO | |
| T111 | Garage-recommendation section. | TODO | |
| T112 | Provenance-separation tests and M14 PASS. | TODO | |

## M15 Service Capture

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T113 | Manual service entry. | TODO | |
| T114 | Invoice photo/file ingestion. | TODO | |
| T115 | Extracted-draft review. | TODO | |
| T116 | Performed checkboxes plus independent action type. | TODO | |
| T117 | Unlisted actions. | TODO | |
| T118 | Explicit confirmation transaction. | TODO | |
| T119 | Service/history tests and M15 PASS. | TODO | |

## M16 History & Documents

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T120 | Chronological history. | TODO | |
| T121 | Service detail. | TODO | |
| T122 | Document library. | TODO | |
| T123 | Original-document access. | TODO | |
| T124 | Source/evidence navigation. | TODO | |
| T125 | Provenance verification and M16 PASS. | TODO | |

## M17 Alerts

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T126 | Alert rule engine. | TODO | |
| T127 | Upcoming/overdue maintenance. | TODO | |
| T128 | Stale odometer. | TODO | |
| T129 | Deferred actions. | TODO | |
| T130 | Notification scheduling. | TODO | |
| T131 | Vehicle-aware deep links. | TODO | |
| T132 | Alert explainability tests and M17 PASS. | TODO | |

## M18 Multi-Vehicle Hardening

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T133 | Car + motorcycle + scooter scenario. | TODO | |
| T134 | Switch-context stress tests. | TODO | |
| T135 | Documents/history isolation. | TODO | |
| T136 | Notifications/deep-link isolation. | TODO | |
| T137 | Zero-cross-vehicle-leakage gate and M18 PASS. | TODO | |

## M19 Settings/Account

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T138 | Profile/account. | TODO | |
| T139 | Notification preferences. | TODO | |
| T140 | Sync/backup status. | TODO | |
| T141 | Vehicle management. | TODO | |
| T142 | General/accessibility preferences. | TODO | |
| T143 | Settings acceptance and M19 PASS. | TODO | |

## M20 Vehicle Lifecycle

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T144 | Archive/restore. | TODO | |
| T145 | Permanent-delete preview. | TODO | |
| T146 | Controlled deletion. | TODO | |
| T147 | Dossier generation. | TODO | |
| T148 | Provenance-aware dossier. | TODO | |
| T149 | Export/share. | TODO | |
| T150 | Lifecycle acceptance and M20 PASS. | TODO | |

## M21 Failure/Recovery

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T151 | No-network behavior. | TODO | |
| T152 | Failed scan/ambiguous identification. | TODO | |
| T153 | Source unavailable/unverified. | TODO | |
| T154 | Corrupt/unreadable document. | TODO | |
| T155 | OCR/AI failure. | TODO | |
| T156 | Upload/sync failure. | TODO | |
| T157 | Stale odometer behavior. | TODO | |
| T158 | Conflict/recovery. | TODO | |
| T159 | No-dead-end/no-fabrication gate and M21 PASS. | TODO | |

## M22 Security/Privacy

| Task | Description | Status | Evidence |
| ---- | ----------- | ------ | -------- |

| T160 | AutoKeep threat model. | TODO | |
| T161 | Auth/RLS/BOLA/IDOR testing. | TODO | |
| T162 | Storage/upload security. | TODO | |
| T163 | Secrets/config review. | TODO | |
| T164 | PII/VIN/registration/log redaction. | TODO | |
| T165 | AI/source-poisoning review. | TODO | |
| T166 | Dependency/security scanning. | TODO | |
| T167 | OWASP-oriented review. | TODO | |
| T168 | Remediate Critical/High findings and M22 PASS. | TODO | |

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
