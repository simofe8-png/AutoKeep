# AutoKeep V1: Release Candidate report (zero-cost contract, G3)

**AUTOKEEP V1 RC PASS: 2026-09-27.**

## Build

- `rc-local` release APK: versionName 1.0.0, versionCode 1, arm64-v8a, targetSdk 36.
  sha256 `552256036da95ca32084430a0eccfdf7d79c5029f2a70f1f33ec8dd197fa700e`.
- Built locally at zero cost (`docs/release/LOCAL_BUILD.md`) and signed with the debug key, for
  device testing only. Not for Google Play.
- Backend: the verified local Supabase stack, reached through `adb reverse`. Cleartext is allowed
  only to 127.0.0.1 and localhost. Hosted production is a later gate.

## Verification (final code)

| Layer                                                                                                          | Result                                    |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Format, lint, typecheck, unit/integration/UI (`npm run verify`)                                                | 44 suites / 305 tests PASS                |
| Local backend: RLS/BOLA, storage, adoption, sync, restore, deletion of originals, edge function (`test:cloud`) | 27/27 PASS                                |
| Live official registry (data.gov.il, `test:live`)                                                              | 1/1 PASS                                  |
| Galaxy A54, release build, 4 rounds                                                                            | PASS (`docs/acceptance/RC-device-A54.md`) |
| Security: no open Critical/High findings; least-privilege permissions on the APK                               | PASS                                      |

## V1 completion definition (spec §25)

| Item                                            | Status                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| UI and RTL preserved                            | PASS: native RTL on the release build                                                                         |
| Android acceptance                              | PASS: every check, including the online registry lookup, camera capture and a reminder that fired             |
| Local/offline                                   | PASS: offline round, restart and upgrade persistence                                                          |
| Authoritative-source behavior                   | PASS: with no approved source, correctly "unable to verify"; curated hash-pinned path and robots rules tested |
| Deterministic maintenance                       | PASS                                                                                                          |
| Service recording, history, documents           | PASS: manual (first-class), file and camera originals with the SHA-256 kept end to end                        |
| Alerts                                          | PASS: raised and delivered on the device at 09:49 (quiet hours respected), opens the right vehicle            |
| Multi-vehicle isolation; car/motorcycle/scooter | PASS                                                                                                          |
| Account/backup/sync                             | PASS: e-mail code sign-in, backup, and permanent deletion including originals                                 |
| Archive/dossier, failure/recovery               | PASS                                                                                                          |
| Security/privacy gate                           | PASS                                                                                                          |
| Clean reproducible RC                           | PASS: clean-clone verify plus the documented build procedure                                                  |

## Defects found by device acceptance and fixed (each with a regression test)

1. Release bundles lacked the EXPO_PUBLIC cloud configuration.
2. The photo entry promised extraction that V1 doesn't have.
3. The document chip clipped its title.
4. Unused biometric and c2dm permissions were merged in.
5. A "prototype" label remained in About.
6. Anything dated "today" failed to save between 00:00 and 03:00 Israel time (UTC date used).
7. Permanent deletion left the vehicle's originals in the backup bucket.

## Outside RC (later gates, unchanged)

- Human approval of official sources (`docs/sources/CANDIDATES.md`); until then every vehicle
  is "unable to verify".
- Hosted Supabase and production e-mail (SMTP/domain).
- Store signing and Google Play.
- An optional OCR/AI provider.
