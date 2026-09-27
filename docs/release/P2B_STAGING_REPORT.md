# P2B: Technical cloud staging report (2026-09-27)

**Result: P2B PASS, with one documented authentication limitation, which is a P2C blocker.**
Test data only. No real user and no personal data were used.

## Staging project

| Item     | Value                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Project  | `autokeep-staging` (ref `bqgyaiqfubumkhmrztra`), existing Supabase organization                                                                  |
| Plan     | **Free**. The organization's paused project shows it is not a paid org; no billing prompt appeared                                               |
| Region   | **eu-central-1 (Frankfurt)**                                                                                                                     |
| API      | `https://bqgyaiqfubumkhmrztra.supabase.co` (Supabase-provided HTTPS; no custom domain)                                                           |
| **Cost** | **$0**                                                                                                                                           |
| Secrets  | DB password, service-role key, DB URL in `~/.autokeep/staging.env`, **outside the repository**, user-only ACL. Never in the app, the logs or git |

## Migrations: the full chain from scratch

`supabase db push` applied `20260926000001` → `…02` → `…03` → `20260927000001_p2a_hardening` in
order.

**Structural equality with the verified local reference:** 254 catalog facts are **identical**.
They cover RLS enabled/forced, grants for anon and authenticated, policies (public + storage),
functions (SECURITY and search_path), function EXECUTE rights, triggers, indexes, constraints, the
bucket (private, 50 MiB, MIME list) and migration history.

## Configuration (documented in `supabase/config.toml` `[remotes.staging]`)

**Pushed:**

- OTP expiry 900 s;
- OTP length 6 (the hosted default was 8);
- confirmations off (code entry proves the mailbox);
- TOTP MFA off;
- site URL set to the project URL;
- storage analytics, S3 and vector off;
- one e-mail per address per 60 s (the hosted default kept).

**Not pushable on Free, documented:**

- **E-mail templates:** "Email template modification is not available for free tier projects
  using the default email provider". The code templates therefore stay the Supabase defaults,
  which carry a link.
- Pooler sizes (dashboard only).
- Twilio flag (it cannot be turned off by push; no SMS credentials exist, so phone sign-in cannot
  work).

## Functions

- **Deployed:** only `delete-account` (verify_jwt = true).
- **Not deployed:** `document-intelligence`, which was removed in P2A.
- No AI, OCR, search or paid provider.

## Hosted verification (the same suites as local, `AUTOKEEP_TEST_TARGET=staging`)

| Suite                                                                                       | Result    |
| ------------------------------------------------------------------------------------------- | --------- |
| RLS and storage (`rls.cloud.test`)                                                          | 14/14     |
| Hardening at the SQL level as `authenticated` with real JWT claims (`hardening.cloud.test`) | 12/12     |
| Account backup, originals, cross-device deletion (`account.cloud.test`)                     | 4/4       |
| Account deletion through the **deployed** function (`deleteAccount.cloud.test`)             | 2/2       |
| Multi-device sync (`sync.cloud.test`)                                                       | 6/6       |
| One run of the whole cloud suite                                                            | **42/42** |
| Auth, hosted (`auth.staging.cloud.test`)                                                    | 3/3       |

What those suites cover:

- **Hardening:**
  - TRUNCATE is denied;
  - child and history rows are immutable;
  - cross-user access returns 0 rows;
  - the version is server-set (+1, `created_at` kept);
  - a poison op is isolated;
  - the op ledger is per owner;
  - the batch cap (200) and adoption cap (50,000 rows) hold;
  - images ≤ 15 MB and PDFs ≤ 50 MB;
  - quotas of 500 documents and 1 GiB;
  - the operator report is not callable by users.
- **RLS and storage:**
  - anonymous access is refused;
  - no cross-user read, update or delete;
  - no forged owner;
  - the private bucket works through signed URLs only;
  - no free-form uploads;
  - no overwrite, even by the owner;
  - MIME types are enforced.
- **Account deletion:** all rows and objects are gone, the auth user is gone, the other user is
  untouched, a retry with the old token returns 200, and anon or no token returns 401.
- **Hosted auth:** a 6-digit code works once, and wrong or reused codes are refused. Sessions
  refresh, and a device-local sign-out leaves the other device signed in. The Free built-in sender
  refuses non-team addresses with `400 "Email address … is invalid"`.

## Authentication result and limitation

**Verified on hosted:** everything the app does after a code exists: verification, the session,
refresh, device-only sign-out, and deletion authorization.

**Not possible on Free with the default sender:**

- The built-in sender refuses any non-team address.
- The templates cannot carry the code the app asks for.

Real users therefore **cannot sign in** until custom SMTP (or another approved method) exists.
No workaround was used: no test hook and no code capture.

**Found and fixed during P2B:** the app reported the server's refusal of an ADDRESS as "wrong
code". Sending a code now maps an address refusal to `email_rejected` ("can't send a code to this
address…"). Covered by `auth.test.ts`, and seen on the device.

## Galaxy A54 staging acceptance

**Build:** staging APK (`APP_VARIANT=staging`) from the local zero-cost build:

- package `com.autokeep.app.staging`, label "AutoKeep Staging", 49 MB;
- sha256 `59e8c329…1ea8`;
- installed next to the RC app without replacing it.

**Secret scan of the bundle:**

- present: the staging HTTPS URL (1) and the public anon key (1);
- absent: the service-role key, the DB password, the pooler host, and any loopback address;
- no cleartext network config (HTTPS only).

| Check                                                                                                             | Result                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Install, launch, onboarding, local-first vehicle (test data "P2BTEST")                                            | PASS                                                                                                                                                                                                                                                                       |
| Release guard in a real release build: HTTPS backend accepted → cloud available (sign-in form, not "unavailable") | PASS                                                                                                                                                                                                                                                                       |
| Sign-in request to a test address                                                                                 | Correct refusal, shown as "can't send a code to this address" (P2B fix); no account created (verified server-side)                                                                                                                                                         |
| Authenticated device flows: device sync to hosted, device upload/download, device account deletion                | **Not executable**: no legitimate way to obtain a session on the device on Free (limitation above). Covered at API level against the hosted backend by the suites above, using the same Supabase client library; previously device-verified against the local backend (RC) |
| Registry lookup, offline states, camera/notifications                                                             | Unchanged since the RC device round (not repeated)                                                                                                                                                                                                                         |

**Play Protect:** installing an unknown app offered to upload it to Google for scanning. **Declined**
(the build was not sent anywhere).

## Cleanup

- Staging: **0 users** (41 disposable test accounts, all `@autokeep.test`), **0 storage objects**,
  0 rows in every table, an empty `storage_usage_report()`.
- Phone: the staging app uninstalled with its test data; the RC app untouched.
- Temporary build copies (`C:\akb`, `C:\ak-sdk`, `C:\ak-jdk`, `C:\ak-gradle`) removed; the
  canonical SDK is untouched.
- The staging project is **retained** for future technical verification.

## Remaining technical blockers

1. **Real-user authentication (P2C MUST):** custom SMTP or another approved method (see
   `P2C_PRIVATE_BETA_READINESS.md` §2).
2. Everything else needed before the first real user is in the P2C readiness matrix.
