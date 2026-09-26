# AutoKeep V1 — Production readiness (M24, T180/T181)

_Date: 2026-09-26 · Audience: the product owner deciding on release._

## What is ready

- **Local-first app on the approved UI.** Hebrew/RTL throughout.
  - Onboarding: scan boundary, the official registry (data.gov.il, only with consent), or manual entry.
  - Features: vehicles, odometer, service capture with originals, history, documents, Garage Mode, alerts with a lifecycle, deferrals, multi-vehicle, lifecycle (archive / delete / dossier PDF), and failure recovery.
  - All data is on-device SQLite with forward-only migrations.
- **Honesty guarantees**, enforced in code and tests:
  - no maintenance advice without a verified official source;
  - forecasts are labeled (צפי);
  - user-reported facts are labeled;
  - AI output is never authoritative;
  - garage notes never become manufacturer requirements.
- **Cloud backup** (Supabase), optional and delayed until data is worth protecting:
  - email-code sign-in, adoption of device data, two-way sync with conflict recording;
  - private backup of document originals, and restore on a new device with SHA-256 re-verification.
  - Verified against the local Supabase stack and from the phone.
- **Security:** threat model, MASVS review and findings register ([THREAT_MODEL.md](../security/THREAT_MODEL.md)). No open Critical/High findings.
- **Quality gates:** format, lint, types, unit and UI tests (`npm run verify`), plus the cloud suite, the live registry test, and device verification on a Samsung SM-A546E.

## Approval status

- **G2 (2026-09-26): approved.** The architecture is in ADR-0016 (hybrid discovery), ADR-0017
  (document intelligence) and ADR-0018 (hosted EU Supabase, EAS). Everything it allows without
  accounts, credentials, vendors or money is implemented.
- **G3 (open):** the Expo account, EAS init and signing, the hosted Supabase project, SMTP, the
  OCR/AI vendor, the optional web-search vendor, and who verifies registry entries. See
  [G3](../gates/G3-accounts-and-vendors.md).

## Configuration for a release build

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` must point at the **hosted** project. `.env.local`, which holds local dev keys, is git-ignored and must not be used for release.
- `EXPO_PUBLIC_DEMO_DATA` must be unset: real data is the default.
- Permissions (`app.json`): camera and notifications only. Microphone, location and broad storage are blocked. All rationale strings are in Hebrew.

## Known limitations (T181)

| Area                      | Limitation                                                                                                                    | Why / plan                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Verified schedules        | None in production until providers are approved (above)                                                                       | G1 gate; the pipeline is implemented and tested with labeled mocks |
| Registration scan         | Photos can't be read automatically (no OCR provider)                                                                          | G1; the user continues with registry lookup or manual entry        |
| Invoice reading           | Invoices are stored as originals; the user fills in the draft                                                                 | G1                                                                 |
| Notifications             | Unavailable inside Expo Go (a platform restriction); work in development and release builds, which need re-verification there | Expo Go since SDK 53                                               |
| Camera capture            | Storage path not yet device-verified: camera permission was not granted on the test phone                                     | Verify in the release build                                        |
| Registry lookup on device | Not device-verified end to end: the test phone had no internet                                                                | The desktop live test passes; re-check on a connected phone        |
| RTL TextInput alignment   | Verified under Expo Go's RTL handling; the native RTL of a release build must be re-checked                                   | ADR-0006                                                           |
| SQLite at rest            | Not encrypted beyond the OS sandbox and device encryption                                                                     | Accepted for V1 (THREAT_MODEL F-04)                                |
| Dependencies              | 15 moderate advisories: build tooling, plus a deep-link DoS in router parsing                                                 | Accepted; re-check on every SDK upgrade                            |
| Dev-only diagnostics      | Technical error text (redacted) appears only in `__DEV__` builds                                                              | By design                                                          |
