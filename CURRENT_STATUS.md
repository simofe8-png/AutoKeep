# AutoKeep — Current Status (resume pointer)

_Last updated: 2026-09-28_

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
- **Next action:** stop. P2C (real beta users, beta project) is **not** started and needs explicit owner approval. Before the first real invitation: see "Remaining before the first real Beta invitation" in `PRIVATE_BETA_AUTH.md`/the P2C readiness matrix (beta backend project, privacy notice, distribution/signing, runbook). Minor pre-existing findings from the A54 run: UTC day in "last backed up"/"added" dates near midnight; delete-vehicle confirmation requires the dashed plate.

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
