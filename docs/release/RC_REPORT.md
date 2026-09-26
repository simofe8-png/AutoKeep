# AutoKeep V1: Release Candidate report (zero-cost contract, G3), 2026-09-26

**Status: RC build produced and accepted, except three device checks that the device's state
prevented. AUTOKEEP V1 RC PASS is not declared yet** (see "What remains").

## Build

- `rc-local` release APK: versionName 1.0.0, versionCode 1, arm64-v8a, targetSdk 36, 49 MB.
  sha256 `3fa0813cfccc91d97818f3f91d4e48428da93db822bdb1e80560c807cf367059`.
- Built locally at zero cost (`docs/release/LOCAL_BUILD.md`) and signed with the debug key, for
  device testing only. Not for Google Play.
- Backend: the verified local Supabase stack, reached through `adb reverse`. Cleartext is allowed
  only to 127.0.0.1 and localhost. Hosted production is a later gate.

## Verification

| Layer                                                                                              | Result                                                                |
| -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Format, lint, typecheck, unit/integration/UI (`npm run verify`)                                    | 42 suites / 302 tests PASS                                            |
| Local backend: RLS/BOLA, storage, adoption, sync, restore, edge function (`test:cloud`)            | 26/26 PASS                                                            |
| Live official registry (data.gov.il, `test:live`)                                                  | 1/1 PASS                                                              |
| Galaxy A54, release build                                                                          | PASS except 3 device-state items (`docs/acceptance/RC-device-A54.md`) |
| Security: no open Critical/High findings (T183); least-privilege permissions re-checked on the APK | PASS                                                                  |

## V1 completion definition (spec §25)

| Item                                            | Status                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI and RTL preserved                            | PASS: native RTL checked on the release build                                                                                                         |
| Android acceptance                              | PASS except online lookup, camera capture and a firing reminder on the device                                                                         |
| Local/offline                                   | PASS: device offline throughout; restart and upgrade persistence                                                                                      |
| Authoritative-source behavior                   | PASS: the pipeline, curated hash-pinned schedules and robots rules are tested. With no approved source, every vehicle is correctly "unable to verify" |
| Deterministic maintenance                       | PASS (engine suites)                                                                                                                                  |
| Service recording, history, documents           | PASS: manual entry is first-class, invoice attached without OCR, original hash kept end to end                                                        |
| Alerts                                          | PASS in tests; not fired on the device (no verified schedule)                                                                                         |
| Multi-vehicle isolation; car/motorcycle/scooter | PASS (M18/M23 suites)                                                                                                                                 |
| Account/backup/sync                             | PASS: e-mail code sign-in and backup from the release build, verified on the server                                                                   |
| Archive/dossier, failure/recovery               | PASS (M20/M21 suites)                                                                                                                                 |
| Security/privacy gate                           | PASS                                                                                                                                                  |
| Clean reproducible RC                           | PASS: clean-clone verify (T182) plus the documented build procedure                                                                                   |

## What remains

1. **Device checks blocked by the device's state:**
   - with the phone on Wi-Fi, a successful registry lookup;
   - with camera permission allowed for AutoKeep, a photo capture stored as an original.

   About 10 minutes, no rebuild needed. The APK is kept for this.

2. **Official sources:** approve or reject the candidates in `docs/sources/CANDIDATES.md`. Until a
   person approves them, nothing is trusted and schedules stay "unable to verify". That is correct
   under G3, but no reminder can fire on the device until a verified schedule exists.
3. **Later gates, not part of RC:** hosted Supabase and production e-mail (SMTP/domain), store
   signing and Google Play, and an optional OCR/AI provider.
