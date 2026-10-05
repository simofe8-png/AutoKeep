# AutoKeep — Claude Governance

@AGENTS.md

## Authority (read in this order at every session start)

1. `AutoKeep_Bootstrap_Package/MASTER_EXECUTION.md`: execution contract, approval gates, retry policy
2. `AutoKeep_Bootstrap_Package/AUTOKEEP_V1_SPEC.md`: approved product and architecture
3. `AutoKeep_Bootstrap_Package/UX_DESIGN_BASELINE.md`: approved UX structure
4. `AutoKeep_Bootstrap_Package/TASK_PLAN.md`: task sequence T001–T184
5. `CURRENT_STATUS.md`: **resume pointer**, which gives the current task and what to do next
6. `task-plan.md`: per-task status and evidence

The bootstrap package is authoritative and must never be edited. If implementation reality contradicts it materially, document the evidence in `CURRENT_STATUS.md` and an ADR. Stop only if no safe, reversible implementation can preserve the approved contract.

## Resume protocol (after context loss, restart or a new session)

1. Read this file, then `CURRENT_STATUS.md`.
2. Run `git status` and `git log --oneline -5` to confirm the checkpoint state.
3. Continue from the "Next action" in `CURRENT_STATUS.md`. Never redo a task marked PASS unless its evidence is invalidated.

## Autonomous progression

Loop per task: UNDERSTAND → PLAN → IMPLEMENT → VERIFY → RECORD EVIDENCE → PASS → CONTINUE.

- Use **proportional verification** per task: run only the checks that prove its acceptance criteria.
- A **milestone gate** requires the full `npm run verify` plus that milestone's gate checks.
- Before V1 RC, run complete regression and acceptance.
- Mark PASS only with evidence recorded in `task-plan.md`, then update `CURRENT_STATUS.md`.
- If a task is already satisfied, record `PASS — satisfied by existing verified implementation` with evidence.
- Do not stop between routine tasks or milestones.

## Stop conditions

Stop only for:

- a genuine approval gate (see below)
- an unresolved blocker
- retry exhaustion: 5 meaningful OBSERVE → DIAGNOSE → CORRECT → VERIFY iterations per blocker, each adding evidence, a new diagnosis or a justified correction
- AUTOKEEP V1 RC PASS

On retry exhaustion, record the failure, evidence, attempted corrections, remaining hypotheses and the safest next action. **Never weaken a test merely to obtain a PASS.**

## Approval gates (explicit user approval required)

- git push, or any remote Git operation
- production deployment, or production DB, data or config mutation
- destructive Git or file operations (force, reset --hard, history rewrite, deleting user data)
- paid services or actions
- creating hosted or cloud resources (for example a hosted Supabase project). Local Docker Supabase is allowed.
- irreversible external actions
- security-boundary changes
- material scope expansion beyond `AUTOKEEP_V1_SPEC.md`
- collecting or using new categories of personal or sensitive data
- choosing a provider (OCR/AI/search/push/etc.) with material cost, privacy or lock-in consequences
- replacing any part of the approved stack

At a gate: finish everything safe before it, verify, checkpoint `CURRENT_STATUS.md`, report the pending action, its effect, risk and rollback, then stop.

## Git policy (granted by user 2026-09-25)

- A local repository is allowed. **Local commits** are allowed at meaningful verified checkpoints, normally milestone PASS boundaries or an independently valuable, recoverable point. Do not commit after every task.
- Never push, force-push, rewrite history or discard uncommitted work without approval.
- Commit messages: `M0X: <summary>` or `T0XX: <summary>`, ending with the Co-Authored-By attribution line.

## Autonomous decisions allowed

Reversible decisions inside approved scope: internal organization, naming, test structure, and minor free, established, replaceable dependencies (always installed with `npx expo install`).

## Product invariants (non-negotiable; summary, full list in MASTER_EXECUTION.md)

- Never fabricate vehicle or maintenance facts. AI proposes, evidence validates, deterministic code computes.
- Manufacturer requirements, garage recommendations and user reports stay distinct. Originals stay distinct from derived data.
- OCR/AI never mutates confirmed history. The user reviews and explicitly confirms.
- Manual service entry is always possible. Checkbox = performed. Action type (inspection/replacement/other) is independent.
- Forecasts are labeled `צפי`. No "vehicle is healthy" claims.
- All vehicle-scoped data carries `vehicle_id`. Switching vehicles changes context only. Zero cross-vehicle leakage.
- verified / pending-missing / unable-to-verify stay visually and structurally distinct.
- Archive is not deletion.

## Project conventions

- Routes live in `src/app/` (expo-router). Non-route code goes in `src/`:
  - `src/ui/`: design system (tokens, components). Screens must use shared components rather than screen-specific styling.
  - `src/features/`: screen-level feature modules
  - `src/domain/`: pure TypeScript domain model (no React, no I/O)
  - `src/engine/`: deterministic maintenance engine (pure)
  - `src/persistence/`: SQLite repositories and migrations
  - `src/providers/`: provider-independent boundaries (OCR, AI, discovery, storage, auth)
  - `src/sync/`: sync protocol and queue
  - `src/mocks/`: clearly labeled mock data and adapters. Never report a mock as a real integration.
- **Screen layouts follow the approved visual references** in `docs/design/approved/` as mapped in `docs/design/README.md` (Home = left variant; four-tab navigation; later product/security decisions override old mockup content). Do not invent a layout where a reference exists.
- Hebrew RTL always. User-facing strings are Hebrew, kept in `src/i18n/he.ts`.
- The Android device check runs on the user's physical phone through Expo Go: `npm run start:device` (adb reverse + IPv4 Metro), then open `exp://127.0.0.1:8081` (`adb shell am start -a android.intent.action.VIEW -d exp://127.0.0.1:8081 host.exp.exponent`). The project path has non-ASCII characters, so avoid local Gradle builds unless required (see ADR-0005).
- Android releases go to Google Play **Internal testing only**, following `docs/release/PLAY_INTERNAL_RELEASE.md` (verify → build → verify AAB → submit → verify). Never Production; never commit the service-account key.
- Commands: `npm run verify`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run format`.
