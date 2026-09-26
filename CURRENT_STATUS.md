# AutoKeep — Current Status (resume pointer)

_Last updated: 2026-09-26_

## Position

- **Milestone:** M21 Failure/Recovery
- **Current task:** T151 (No-network behavior)
- **Last verified PASS:** T150 — M20 PASS (archive/restore, exact delete preview, controlled deletion incl. originals, provenance-aware dossier PDF share)
- **Next action:** M21 per task-plan (failure/recovery: offline, interrupted writes, crash/restart recovery, retry/backoff, storage errors)

## Granted policies

- Local git commits at meaningful verified checkpoints (normally milestone PASS). No push. (User, 2026-09-25)
- Android verification on the user's physical phone through Expo Go. The user connects it when needed. (User, 2026-09-25)
- Proportional per-task verification, with the full suite at milestone gates. (User, 2026-09-25)

## Environment notes

- Node 24.16, npm 11.13, JDK 17, adb, Docker Desktop, gh are installed. The Supabase CLI is used through `npx supabase`.
- `ANDROID_HOME=C:\Android\Sdk` (no emulator); the full SDK is at `%LOCALAPPDATA%\Android\Sdk`.
- The project path contains Hebrew characters, so avoid local Gradle builds (ADR-0005).

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
- OPEN (before RC): document ORIGINAL files are not uploaded to the private `documents` bucket — only metadata rows sync (docs/cloud/SUPABASE.md).
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
- Deferred: hosted Supabase project creation (T065 → needed for production Edge Functions / M24).

## Repository / checkpoint

- Checkpoint commits: `M00`–`M20` on `master` (local only, not pushed).
