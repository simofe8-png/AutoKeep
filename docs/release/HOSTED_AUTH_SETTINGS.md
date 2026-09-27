# Hosted Supabase settings required before real users (P2A, 2026-09-27)

These are **hosted-project settings**. None of them has been applied: no hosted project exists,
and creating one is an approval gate (P2 plan §I). `supabase db push` applies migrations only.
The auth settings, e-mail templates and function deployment below need
`supabase config push`, the dashboard, or `supabase functions deploy`.

## Auth: sign-in with an e-mail code

The app calls `signInWithOtp({ email, options: { shouldCreateUser: true } })`, then
`verifyOtp({ type: 'email' })` (`src/cloud/auth.ts`). It uses no redirect or deep link.

| Setting                     | Required value                                                                                                                                                             | Why                                                                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Email provider              | Enabled; sign-ups enabled (`enable_signup`)                                                                                                                                | `shouldCreateUser: true` creates the account on first sign-in                                                                               |
| **Confirm signup** template | Must contain `{{ .Token }}` (same RTL Hebrew body as `supabase/templates/magic_link.html`) **or** "Confirm email" disabled                                                 | On hosted projects a new user receives the _confirmation_ e-mail, not the magic-link one. Without the code in it, a new user cannot sign in |
| Magic Link template         | `supabase/templates/magic_link.html` (code only)                                                                                                                           | Existing users                                                                                                                              |
| OTP length                  | 6                                                                                                                                                                          | Client accepts 6–10 digits                                                                                                                  |
| **OTP expiry**              | **600–900 s** (10–15 minutes); local default is 3600                                                                                                                       | A 6-digit code should be short-lived; the template already says "short-lived"                                                               |
| Site URL / redirect URLs    | Any non-localhost placeholder (unused by the code flow)                                                                                                                    | The local values are 127.0.0.1                                                                                                              |
| Rate limits                 | E-mail sends: start at 30/hour (Supabase default with custom SMTP) and raise as needed. Token verifications ≤ 30 per 5 min per IP. Sign-ups/sign-ins ≤ 30 per 5 min per IP | E-mail bombing and brute-force bounds                                                                                                       |
| CAPTCHA                     | Optional (not required for V1)                                                                                                                                             | Add if abuse appears                                                                                                                        |
| JWT expiry                  | 3600 s; refresh-token rotation on                                                                                                                                          | As tested locally                                                                                                                           |

## Production e-mail (required)

- Supabase's built-in sender reaches **team members only, at 2 messages per hour**
  (https://supabase.com/docs/guides/auth/auth-smtp), so real users need **custom SMTP**.
- Every provider that can mail arbitrary users needs a **verified sending domain** with SPF, DKIM
  and DMARC. The candidates and their costs are in the P2 plan §10.
- The SMTP host, port, user and password go in the Auth → SMTP settings. They are a secret held
  by the project and never in the app or the repository.

## Edge Functions

| Function                | Deploy?                                 | Settings                                                                                                                                        |
| ----------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `delete-account`        | **Yes** (required for account deletion) | `verify_jwt = true` (see `supabase/config.toml`). It uses the platform-provided `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no extra secret |
| `document-intelligence` | **Removed in P2A**                      | Nothing to deploy                                                                                                                               |

## Project

| Item            | Value                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| Region          | EU (Frankfurt, `eu-central-1`) for both staging and production                                                    |
| Production plan | Pro, spend cap ON; staging on Free                                                                                |
| Storage bucket  | Created by migration `20260926000001` (private, 50 MiB, pdf/jpeg/png/heic). Policies replaced by `20260927000001` |

## App build (EAS environment variables)

| Environment  | Variables                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------ |
| `production` | `EXPO_PUBLIC_SUPABASE_URL` (the **HTTPS** project URL) and `EXPO_PUBLIC_SUPABASE_ANON_KEY` |
| `preview`    | The same two variables, pointing at staging                                                |

- A release build refuses a non-HTTPS or loopback backend URL; the cloud then stays off, failing
  closed (`src/cloud/backendUrl.ts`).
- Never build production with `APP_VARIANT=rc-local` or `.env.local`.
