# AutoKeep — Current Status (resume pointer)

_Last updated: 2026-09-25_

## Position

- **Milestone:** M10 Official Source Discovery
- **Current task:** T081 — ⏸ APPROVAL GATE G1 (external providers)
- **Last verified PASS:** T085 (T079/T080/T082–T085 PASS; T086 fixtures green)
- **Next action:** WAIT for user decision on docs/gates/G1-providers.md; then implement approved provider adapters (Edge Function), seed verified official-domain registry, finish T081/T086 → M10 PASS, continue M11.

## Granted policies

- Local git commits at meaningful verified checkpoints (normally milestone PASS). No push. (User, 2026-09-25)
- Android verification on the user's physical phone through Expo Go. The user connects it when needed. (User, 2026-09-25)
- Proportional per-task verification, with the full suite at milestone gates. (User, 2026-09-25)

## Environment notes

- Node 24.16, npm 11.13, JDK 17, adb, Docker Desktop, gh are installed. The Supabase CLI is used through `npx supabase`.
- `ANDROID_HOME=C:\Android\Sdk` (no emulator); the full SDK is at `%LOCALAPPDATA%\Android\Sdk`.
- The project path contains Hebrew characters, so avoid local Gradle builds (ADR-0005).

## Open issues

- Local Supabase: `npm run cloud:start` (ports 566xx; other local projects use 543xx/557xx — never stop them). Cloud tests: `npm run test:cloud`.
- Intermittent UI test timeouts once under heavy load (Docker running); not reproduced in 3 runs — watch.

- Acquisition (camera/picker) on-device verification deferred to M13 wiring (T106).
- Candidate provider needing approval later: data.gov.il vehicle registry lookup by plate (privacy data flow) — ADR-0009.

- adb can wedge after long sessions: bound every adb call with `timeout`; recover with `Stop-Process adb` + `adb start-server` (start-device.mjs now times out adb reverse).

- UI is FROZEN (ADR-0007, docs/ui-baseline). Backend work must feed the existing screens without redesign.
- Native-RTL release build must re-verify TextInput alignment and text rules (M24 T182).
- Device verification tooling: `tools/device-shots.sh`, `tools/adb-tap.py` (python + PIL available).

- expo-router `typedRoutes` disabled: its incremental generator registered non-route files as routes on this machine (stale .expo/types broke tsc). Revisit if upstream fixes it.

- Device: run Metro with `npm run start:device` (Node 24 localhost→::1 breaks Expo Go over adb reverse). Expo Go was installed on the user phone by Expo CLI (2026-09-25).
- `@types/jest` 30 vs expected 29.5 (expo install --check); harmless for now, align in M03.

- `npm audit`: 14 moderate advisories in the Expo template's transitive dependencies (dev tooling). Review in T166.

## Pending approval gates

- **G1 (ACTIVE):** discovery provider + OCR/AI extraction provider (+ optional data.gov.il registry) — docs/gates/G1-providers.md.
- Deferred: hosted Supabase project creation (T065 → needed for production Edge Functions / M24).

## Repository / checkpoint

- Checkpoint commits: `M00`–`M09` + `M10 (partial, pre-gate)` on `master` (local only, not pushed).
