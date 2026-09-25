# AutoKeep V1 — Autonomous Task Plan

## Execution rules

Execute sequentially. A task may be marked PASS only with evidence. Do not skip a failed task. If a task is already satisfied by verified implementation, record `PASS — satisfied by existing verified implementation` with evidence.

For every task: inspect → implement minimum justified change → verify → record evidence → update CURRENT_STATUS.md → continue.

Milestone PASS requires all tasks in that milestone plus its complete milestone gate. Approval gates stop only immediately before the gated action.

The detailed product, UX, architecture, security, retry and approval rules are in the other bootstrap documents and are part of this plan.


## M00 Foundation

- T001 Bootstrap Expo + React Native + TypeScript in the empty project root.
- T002 Create CLAUDE.md governance, approval gates, retry policy and autonomous progression rules.
- T003 Create README, ARCHITECTURE, DOMAIN, SECURITY, TESTING, ROADMAP and initial ADRs.
- T004 Establish lint, TypeScript, tests and aggregate npm run verify.
- T005 Establish CI baseline plus environment/secrets conventions.
- T006 Verify foundation and record M00 PASS.

## M01 Design System

- T007 RTL Hebrew foundation, typography, layout and design tokens.
- T008 Reusable buttons, inputs, cards, checkboxes, badges and dialogs.
- T009 Reusable loading, empty, error and verification-state components.
- T010 Navigation shell with four primary bottom destinations.
- T011 Active Vehicle Context UI.
- T012 Accessibility/responsive verification and M01 PASS.

## M02 Full UI Prototype

- T013 Onboarding and registration/license scan UI.
- T014 Vehicle confirmation and missing-data flow.
- T015 Source-search progress/result states.
- T016 Home.
- T017 Maintenance schedule and next-service screen.
- T018 Expandable maintenance-item evidence.
- T019 Garage Mode.
- T020 Service capture: photo/file/manual.
- T021 Service review and confirmation.
- T022 Service history and detail.
- T023 Documents.
- T024 Alerts.
- T025 My Vehicles, switcher and add vehicle.
- T026 Account/backup UX.
- T027 Settings.
- T028 Archive/sale/permanent-delete UX.
- T029 Vehicle Dossier preview/share UX.
- T030 Mock end-to-end navigation verification and M02 PASS.

## M03 Visual Acceptance

- T031 Android device rendering verification.
- T032 RTL, keyboard, scrolling, safe area and font-scaling verification.
- T033 Loading/error/empty/offline visual-state verification.
- T034 Resolve visual defects within approved design.
- T035 Freeze UI baseline and record M03 PASS.

## M04 Domain

- T036 Core vehicle/account value objects and stable IDs.
- T037 Provenance and verification model.
- T038 Maintenance schedule/interval/item model.
- T039 Service event/action model.
- T040 Documents/sources/source-reference model.
- T041 Garage recommendations and alerts domain.
- T042 Domain invariants/tests and M04 PASS.

## M05 Local-first Persistence

- T043 SQLite integration and migration framework.
- T044 Vehicle repository and active-vehicle persistence.
- T045 Odometer repository/history.
- T046 Maintenance/document repositories.
- T047 Service/history repositories.
- T048 Alerts/settings persistence.
- T049 Vehicle archive lifecycle persistence.
- T050 Restart/offline/isolation tests and M05 PASS.

## M06 Vehicle Identification

- T051 Camera/file acquisition boundary.
- T052 Registration-document extraction contract.
- T053 Vehicle-type recognition: car/motorcycle/scooter.
- T054 Confidence and ambiguity handling.
- T055 Confirmation and missing-fields engine.
- T056 Manual fallback.
- T057 Identification acceptance tests and M06 PASS.

## M07 Cloud Foundation

- T058 Supabase local/dev integration design.
- T059 PostgreSQL schema and migrations.
- T060 Authentication integration.
- T061 Ownership/authorization/RLS.
- T062 Private document storage.
- T063 Server-side API/security boundaries.
- T064 Local security tests.
- T065 APPROVAL GATE for material external Supabase resources/migrations when required.
- T066 Cloud verification and M07 PASS.

## M08 Account Migration

- T067 Local identity strategy.
- T068 Delayed account-creation flow.
- T069 Transactional local-to-account adoption.
- T070 Recovery/failure handling.
- T071 No-data-loss tests and M08 PASS.

## M09 Sync

- T072 Sync protocol/version model.
- T073 Outbound queue.
- T074 Inbound synchronization.
- T075 Retry/idempotency.
- T076 Entity-aware conflict resolution.
- T077 Multi-device scenarios.
- T078 Offline-to-online acceptance and M09 PASS.

## M10 Official Source Discovery

- T079 Provider-independent discovery interface.
- T080 Source authority/classification rules.
- T081 Manufacturer/official-importer source discovery.
- T082 Exact vehicle applicability matching.
- T083 Document retrieval/versioning.
- T084 Provenance capture.
- T085 Uncertain/no-source handling.
- T086 Discovery fixtures/tests and M10 PASS.

## M11 Document Intelligence

- T087 OCR abstraction.
- T088 AI extraction abstraction.
- T089 Structured schemas and validation.
- T090 Page/section evidence references.
- T091 Confidence/verification pipeline.
- T092 Prompt-injection and untrusted-document defenses.
- T093 Invoice extraction to draft only.
- T094 Extraction security/tests and M11 PASS.

## M12 Maintenance Engine

- T095 Mileage intervals.
- T096 Time intervals.
- T097 Earliest-of rules.
- T098 Service-history reconciliation.
- T099 Next-due/overdue computation.
- T100 Driving-rate forecast explicitly represented as forecast.
- T101 Deferred-item logic.
- T102 Deterministic fixture suite and M12 PASS.

## M13 Real Data Integration

- T103 Home adapters.
- T104 Maintenance adapters.
- T105 Source/evidence adapters.
- T106 Replace UI mock data.
- T107 Preserve approved visual baseline.
- T108 Integration tests and M13 PASS.

## M14 Garage Mode

- T109 Manufacturer section.
- T110 AutoKeep-known section.
- T111 Garage-recommendation section.
- T112 Provenance-separation tests and M14 PASS.

## M15 Service Capture

- T113 Manual service entry.
- T114 Invoice photo/file ingestion.
- T115 Extracted-draft review.
- T116 Performed checkboxes plus independent action type.
- T117 Unlisted actions.
- T118 Explicit confirmation transaction.
- T119 Service/history tests and M15 PASS.

## M16 History & Documents

- T120 Chronological history.
- T121 Service detail.
- T122 Document library.
- T123 Original-document access.
- T124 Source/evidence navigation.
- T125 Provenance verification and M16 PASS.

## M17 Alerts

- T126 Alert rule engine.
- T127 Upcoming/overdue maintenance.
- T128 Stale odometer.
- T129 Deferred actions.
- T130 Notification scheduling.
- T131 Vehicle-aware deep links.
- T132 Alert explainability tests and M17 PASS.

## M18 Multi-Vehicle Hardening

- T133 Car + motorcycle + scooter scenario.
- T134 Switch-context stress tests.
- T135 Documents/history isolation.
- T136 Notifications/deep-link isolation.
- T137 Zero-cross-vehicle-leakage gate and M18 PASS.

## M19 Settings/Account

- T138 Profile/account.
- T139 Notification preferences.
- T140 Sync/backup status.
- T141 Vehicle management.
- T142 General/accessibility preferences.
- T143 Settings acceptance and M19 PASS.

## M20 Vehicle Lifecycle

- T144 Archive/restore.
- T145 Permanent-delete preview.
- T146 Controlled deletion.
- T147 Dossier generation.
- T148 Provenance-aware dossier.
- T149 Export/share.
- T150 Lifecycle acceptance and M20 PASS.

## M21 Failure/Recovery

- T151 No-network behavior.
- T152 Failed scan/ambiguous identification.
- T153 Source unavailable/unverified.
- T154 Corrupt/unreadable document.
- T155 OCR/AI failure.
- T156 Upload/sync failure.
- T157 Stale odometer behavior.
- T158 Conflict/recovery.
- T159 No-dead-end/no-fabrication gate and M21 PASS.

## M22 Security/Privacy

- T160 AutoKeep threat model.
- T161 Auth/RLS/BOLA/IDOR testing.
- T162 Storage/upload security.
- T163 Secrets/config review.
- T164 PII/VIN/registration/log redaction.
- T165 AI/source-poisoning review.
- T166 Dependency/security scanning.
- T167 OWASP-oriented review.
- T168 Remediate Critical/High findings and M22 PASS.

## M23 Full Acceptance

- T169 Fresh-user E2E.
- T170 Verified-source-to-maintenance E2E.
- T171 Garage-to-service-to-history E2E.
- T172 Offline-to-sync E2E.
- T173 Account/device-recovery E2E.
- T174 Multi-vehicle E2E.
- T175 Motorcycle/scooter E2E.
- T176 Archive/dossier E2E.
- T177 Complete regression and M23 PASS.

## M24 Release Candidate

- T178 Release configuration.
- T179 Backup/restore validation.
- T180 Production-readiness documentation.
- T181 Known-limitations review.
- T182 Clean-build/reproducibility check.
- T183 Final security/regression gate.
- T184 Produce V1 RC report and AUTOKEEP V1 RC PASS.
