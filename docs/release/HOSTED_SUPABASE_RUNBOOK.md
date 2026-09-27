# Hosted Supabase (EU) — runbook (ADR-0018)

Every step marked 🔒 is an approval gate: account or credentials, hosted resource creation,
secrets, DNS/SMTP, payment/plan, or a production mutation. Stop before it and ask.

## 1. Create the project 🔒

1. 🔒 Choose the Supabase account/organization and the plan. Free works for a pilot; Pro is
   recommended before real users.
2. 🔒 Create the project in an **EU region** (e.g. `eu-central-1`, Frankfurt). Store the database
   password in a password manager, never in the repo.
3. Note the project ref, API URL and **publishable/anon key**. The anon key is public by design;
   RLS is the security boundary. **Never** put the service-role/secret key in the app or in EAS
   public env.

## 2. Apply the schema (staging first)

1. 🔒 Link and push the migrations:

   ```
   npx supabase link --project-ref <ref>
   npx supabase db push
   ```

   This applies `supabase/migrations/*`: the schema, forced RLS, ownership FKs, the adoption and
   sync RPCs, and the private `documents` bucket with storage policies.

2. 🔒 Auth settings (dashboard or config push):
   - email OTP enabled, 6-digit code;
   - the `magic_link` template from `supabase/templates/magic_link.html`, which carries the code;
   - no redirect URLs needed (code-only sign-in).
3. 🔒 Production SMTP: set up a transactional email provider plus sender-domain DNS (SPF/DKIM).
   Supabase's built-in email is rate-limited and meant for testing only.
4. 🔒 Deploy the account-deletion function: `npx supabase functions deploy delete-account`
   (`verify_jwt = true`). The OCR function `document-intelligence` was removed in P2A, so there is
   nothing else to deploy. Every hosted setting is listed in `docs/release/HOSTED_AUTH_SETTINGS.md`.

## 3. Verify against staging

Run the cloud suite against the staging project. The suite is local-stack only today; for
staging, point `localStack.ts` at staging through env and use disposable test users. It must pass
unchanged: RLS/BOLA, storage, adoption, sync and originals restore.

## 4. App configuration (EAS)

- 🔒 `npx eas-cli login`, then `npx eas-cli init`. This links the Expo project and writes
  `extra.eas.projectId`.
- 🔒 `npx eas-cli env:create` for each environment (`preview`, `production`):
  - `EXPO_PUBLIC_SUPABASE_URL`
  - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

  These are public values; plain-text visibility is fine.

- Never use `.env.local` (local dev keys) for release builds.

## Rollback

- Migrations are forward-only. Roll back by deploying a new migration.
- Nothing is deleted on the client: the app is local-first, so a backend outage never loses local
  data.
