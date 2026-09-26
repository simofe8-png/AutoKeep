# AutoKeep — Current Status (resume pointer)

_Last updated: 2026-09-26_

## Position

- **Milestone:** M14 Garage Mode
- **Current task:** T109 (Manufacturer section)
- **Last verified PASS:** T108 — M13 PASS (real SQLite data behind the frozen UI, ADR-0015)
- **Next action:** Garage mode on real data: manufacturer section from the verified schedule (with sources), AutoKeep-known section (history/odometer/deferred), garage-recommendation section kept separate; provenance-separation tests

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

- Checkpoint commits: `M00`–`M13` on `master` (local only, not pushed).
