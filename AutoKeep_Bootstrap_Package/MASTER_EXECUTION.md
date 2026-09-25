# AutoKeep V1 — Master Autonomous Execution Contract

## Mission

Starting from an empty AutoKeep project directory, build AutoKeep V1 from bootstrap through Release Candidate by executing the approved task plan sequentially and autonomously.

Execution loop:

UNDERSTAND → PLAN → IMPLEMENT → VERIFY → RECORD EVIDENCE → PASS → CONTINUE

Do not stop between routine tasks. Stop only at a genuine approval gate, an unresolved blocker, bounded-retry exhaustion, or a contradiction that materially affects approved product behavior, architecture, security, privacy, or data integrity.

## Model and effort

Use Claude Opus 5 with High effort for significant implementation, architecture, debugging, security, and verification work.

## Source of truth

The bootstrap package is authoritative:
- MASTER_EXECUTION.md
- AUTOKEEP_V1_SPEC.md
- TASK_PLAN.md
- UX_DESIGN_BASELINE.md

During T001–T003 create and thereafter obey:
- CLAUDE.md
- README.md
- ARCHITECTURE.md
- DOMAIN.md
- SECURITY.md
- TESTING.md
- ROADMAP.md
- CURRENT_STATUS.md
- task-plan.md
- docs/adr/

Do not silently reinterpret approved decisions. If implementation reality reveals a material contradiction, document the evidence and stop only when a safe reversible implementation cannot preserve the approved contract.

## Approved technology baseline

- React Native
- Expo
- TypeScript
- SQLite for local persistence
- Supabase for future PostgreSQL, Authentication, and private Storage
- Provider-independent AI/OCR boundaries
- Android first; future iOS must not require a fundamental rewrite
- Hebrew RTL from the beginning
- Local-first and offline-capable

Do not replace the approved stack without explicit approval.

## Core product invariants

1. Never fabricate vehicle or maintenance information.
2. Manufacturer maintenance requirements require verifiable evidence.
3. AI is not an authoritative maintenance source.
4. AI may discover, extract, classify and propose. Evidence validates. Deterministic code computes maintenance state from verified data.
5. Manufacturer requirements, garage recommendations and user-reported information remain distinct.
6. Original documents remain distinct from OCR/AI-derived representations.
7. OCR/AI extraction never directly mutates confirmed service history.
8. Document-derived service-history changes require user review and confirmation.
9. Manual service entry must always remain possible.
10. A service-action checkbox means performed; action type is independently inspection/replacement/other.
11. Forecast dates are explicitly labeled as forecasts.
12. Never claim mechanical health without evidence.
13. Safety claims require appropriate professional evidence.
14. Vehicle-scoped operational data explicitly belongs to vehicle_id.
15. Switching active vehicle changes context only, never ownership or data.
16. No cross-vehicle leakage is acceptable.
17. Each vehicle has independent odometer readings and measurement dates.
18. verified / pending-or-missing / unable-to-verify states remain distinguishable.
19. History is not the manufacturer schedule.
20. Archive is not deletion.

## Autonomous task engine

Create task-plan.md from TASK_PLAN.md and CURRENT_STATUS.md with:
- current milestone
- current task
- status
- last verified PASS
- verification evidence
- unresolved issues
- approval gates
- next task
- repository/checkpoint state

For every task:
1. Read CLAUDE.md and CURRENT_STATUS.md.
2. Inspect relevant implementation.
3. Reuse verified work.
4. Confirm scope.
5. Implement the minimum justified solution.
6. Run proportional verification.
7. Record evidence.
8. Mark PASS only when acceptance criteria are actually met.
9. Update CURRENT_STATUS.md.
10. Continue automatically.

If a later task is already fully satisfied, do not rewrite it. Record:
`PASS — satisfied by existing verified implementation`
with evidence.

## Debugging policy

For failures:
OBSERVE → DIAGNOSE → CORRECT → VERIFY

Maximum five meaningful iterations per blocker. A retry must add evidence, a new diagnosis, or a justified correction. Never weaken tests merely to obtain PASS. After five unsuccessful meaningful iterations, stop and record failure, evidence, attempted corrections, remaining hypotheses, and safest next action.

## Decision policy

Claude may autonomously make reversible implementation decisions inside approved scope: internal organization, naming, test structure, and minor free/established/replaceable dependencies.

Claude must not autonomously decide:
- new product scope
- paid services
- production deployment or production mutation
- destructive external actions
- irreversible migrations
- major security-boundary changes
- replacement of approved stack
- collection of new personal/sensitive data categories
- third-party commitments with material cost, privacy, or lock-in consequences

## Approval gates

Explicit approval is required before:
- git push
- production deployment
- production DB migration/data/config mutation
- destructive Git/file operation
- paid action/service
- material external/cloud resource creation when not already authorized
- irreversible external action
- security-boundary change
- material scope expansion
- additional sensitive-data collection/use
- provider choice with material cost/privacy/lock-in

Git commits may be used as autonomous local milestone checkpoints only after the user grants that policy. Until then, stop at the first proposed commit checkpoint. Never destroy uncommitted work.

At a gate: complete everything safe before it, verify, checkpoint CURRENT_STATUS.md, report pending action/effect/risk/rollback, then stop. After approval, resume from checkpoint.

## UI-first policy

M01–M03 establish the approved UI before deep backend work. Use realistic mock data, verify on Android, resolve RTL/layout/accessibility defects, and freeze the visual baseline. Later backend work must not casually redesign approved UI.

## External providers

Never fabricate an integration. When a real provider is needed:
1. identify exact capability;
2. research current viable options if permitted;
3. compare only AutoKeep-relevant criteria;
4. prefer free/low-lock-in options when requirements are met;
5. preserve provider-independent boundaries;
6. stop at an approval gate for cost/account/privacy/contract/lock-in consequences.

Mocks may be used only when clearly labeled and must never be reported as a completed real integration.

## Verification

Use proportional layered verification:
formatting → lint → TypeScript → unit → integration → persistence → security → UI → E2E → Android device.

Before each milestone PASS, run its complete required gate. Before V1 RC, run complete regression and acceptance.

## Start

The target project directory is empty except for this bootstrap package.

Begin with T001. Bootstrap in the current project root; do not create an unnecessary nested AutoKeep directory. Preserve the bootstrap documents.

Create governance/state machinery early enough that work can resume after context loss, Claude restart, machine restart, or a new session.

Continue autonomously through TASK_PLAN.md until a genuine approval gate, unresolved blocker, retry exhaustion, or AUTOKEEP V1 RC PASS.
