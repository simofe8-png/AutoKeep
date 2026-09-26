# AutoKeep — Current Status (resume pointer)

_Last updated: 2026-09-26_

## Position

- **Milestone:** M24 Release Candidate. G3 (ZERO-COST V1) was approved 2026-09-26 and everything that can be done at zero cost is implemented.
- **STOPPED:** (1) retry exhaustion on the local release build (5/5); (2) human approval required for official-source candidates.
- **Current task:** T184 (BLOCKED).
- **Last verified PASS:** G3 implementation (task-plan § G3): zero-cost official-site discovery (RFC 9309 robots), curated hash-pinned schedules without OCR/AI, `npm run curate:check`, candidate research.
- **Next action (choose one):**
  - **Release build**, per `docs/release/LOCAL_BUILD.md`, either option:
    - **A.** Retry 6: make `C:k-sdk` a REAL ASCII copy of the SDK subset (cmake, ndk, build-tools, platforms). CMake/ninja canonicalizes the junction back to the Hebrew path.
    - **B.** Wait for the free EAS quota reset (2026-10-01) and run `eas build --profile rc-local --platform android`.
  - After either: install on the Galaxy A54 → device acceptance → RC report.
  - **Sources:** a person reviews `docs/sources/CANDIDATES.md`. Approved domains go to `OFFICIAL_DOMAINS`; curated schedules follow REGISTRY_PROCEDURE.
  - **Google Play and hosted production remain separate gates.**

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
