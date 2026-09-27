# P2: production backend plan (PLAN / AUDIT ONLY, 2026-09-27): APPROVAL GATE

**Baseline:** RC PASS `35478a2`; P1 docs `7a1c798`.

**Scope of this document:**

- It is research and design only.
- No application code, migration, cloud resource, email account or secret was created or changed.

**Sources:** three read-only audits (backend `supabase/` against the live local database, the client
`src/`, and current official pricing). Code claims cite `file:line`. Pricing cites the official
page, accessed 2026-09-27; anything unconfirmed is marked **UNCONFIRMED**.

**Summary:**

- The RC architecture is sound and most of it carries over unchanged: local-first SQLite, forced
  RLS, the owner-scoped private bucket, the op-ledger sync, and e-mail code sign-in.
- Production needs a small set of targeted fixes: account deletion, two sync-cursor
  correctness bugs, grants/indexes, and sync scheduling. It also needs hosted configuration.
- It needs **no** paid AI, OCR or search provider.
- The minimum real-user configuration is **not zero-cost**: Supabase Pro (about $25/month) plus
  a sending domain. §10 explains why.

---

## 1. Supabase / PostgreSQL

### 1.1 Migrations (ordered; all applied locally)

| #   | File                                                    | Purpose                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `supabase/migrations/20260926000001_initial_schema.sql` | 12 domain tables mirroring local SQLite; triggers; owner-only RLS (forced) on every table; `vehicle_deletion_preview`, `delete_vehicle_permanently`; private `documents` bucket; `can_access_document_path`; storage policies |
| 2   | `…20260926000002_adopt_local_data.sql`                  | `adopt_local_data(jsonb)`: moves a device's data into the account in one idempotent transaction                                                                                                                               |
| 3   | `…20260926000003_sync.sql`                              | Drops `unique(profiles.owner_id)` (profile = device); `sync_applied_ops` (op ledger) and `sync_tombstones` with RLS; `sync_push(jsonb)`                                                                                       |

### 1.2 Schema

- Everything is in `public`.
- Tables: profiles, vehicles, odometer_readings, documents, extractions, schedules,
  service_events, service_actions, service_event_documents, garage_recommendations,
  deferred_items, alerts, sync_applied_ops, sync_tombstones.
- Every table has `owner_id uuid default auth.uid()`.
- Domain tables carry `created_at`, `updated_at`, `version` and `server_updated_at default now()`.
- Children cascade through the composite FK `(vehicle_id, owner_id) → vehicles(id, owner_id)`.
- `profiles`, `vehicles`, `sync_applied_ops` and `sync_tombstones` cascade from `auth.users`.
- Check constraints: 17 live. Examples: registration `^[0-9]{5,8}$`, VIN format, `documents.size_bytes ≤ 52,428,800`, sha256 hex, `storage_key !~* '^https?:'`.
- No length limits on text or jsonb columns.

**Extensions:** Supabase defaults only (pgcrypto, uuid-ossp, pg_stat_statements, supabase_vault).
No migration creates an extension.

**Scheduled/background work: none.** There is no pg_cron, pg_net, webhook or cleanup job.

### 1.3 RLS and server-side authorization

- **RLS enabled and FORCED on all 14 tables** (live-verified).
- Domain tables have per-command owner policies `owner_id = (select auth.uid())`, `TO authenticated` (mig 1:242-249).
- The sync tables have a single `owner_all` policy (mig 3:34).

**Functions:**

- Every function is **SECURITY INVOKER with `search_path = ''`**; there is no SECURITY DEFINER.
- RPCs: `adopt_local_data`, `sync_push`, `vehicle_deletion_preview`, `delete_vehicle_permanently` (authenticated only).
- Triggers: `set_server_updated_at` (BEFORE INSERT/UPDATE) and `forbid_owner_change` (BEFORE UPDATE) on every domain table.

**Sync pull** is not an RPC. The client reads tables through PostgREST under RLS
(`src/sync/supabaseTransport.ts:14-41`).

**Findings to fix:**

- **A1. Over-broad default grants.**
  - Live, `authenticated` holds `TRUNCATE, TRIGGER, REFERENCES` on every table, plus UPDATE on the sync tables.
  - These come from Supabase's default ACL on `public`, which the migrations never revoke (mig 1:240-241, mig 3:33).
  - TRUNCATE bypasses RLS. PostgREST cannot issue it, but defence in depth requires revoking it.
  - `auto_expose_new_tables` defaults to true (`config.toml:23`).
- **A2. `delete_vehicle_permanently` (mig 1:265)** deletes without a tombstone and without storage cleanup. Other devices would never learn of the delete. Only `sync_push` does it correctly.
- **A3. `sync_push` hardening** (mig 3):
  - The client fully controls `version` (the CAS does not enforce `base+1`).
  - Unbounded batch size.
  - A global `op_id` PK.
  - An append-only `on conflict do nothing` reports `duplicate` even when the id belongs to another user, so the row is silently dropped.
  - The delete path returns `applied` even when nothing was deleted.
  - One `information_schema` query per op.
- **A4. Unbounded inputs.** `adopt_local_data` and `sync_push` have no size or row caps. Only the 8 s statement timeout bounds them.

### 1.4 Indexes (A5)

**Existing:** `vehicles(owner_id)`, `odometer(vehicle_id)`, `documents(vehicle_id)`,
`service_events(vehicle_id, date)`.

**Missing:**

- `(owner_id, server_updated_at, id)` on every synced table. The pull is keyset-ordered by these; without the index each sync is a sequential scan per table.
- `vehicle_id` on extractions, schedules, service_actions, garage_recommendations, deferred_items and alerts.
- FK indexes on `extractions.document_id`, `service_actions.service_event_id` and `service_event_documents.document_id`. These slow cascades on vehicle deletion.
- `sync_applied_ops(owner_id)`.

---

## 2. Authentication

**Current flow.**

- Passwordless e-mail code: `signInWithOtp({ email, options: { shouldCreateUser: true } })`, then `verifyOtp({ type: 'email' })`. The client accepts 6–10 digits (`src/cloud/auth.ts:23-45`).
- **No redirect or deep link is required.** `detectSessionInUrl: false` (`src/cloud/client.ts:24-27`). The `autokeep` scheme is used only for in-app and notification links.
- Template: `supabase/templates/magic_link.html` shows `{{ .Token }}` (RTL Hebrew).

**Session.**

- Stored in expo-secure-store (chunked; `src/cloud/secureSessionStorage.ts`), with `persistSession` and `autoRefreshToken` on.
- JWT 3600 s, refresh-token rotation on (`config.toml:164-173`).
- There is no AppState-driven start/stop of auto-refresh (Supabase recommends it for React Native), and no `onAuthStateChange` listener.

**Sign-out:** `sb.auth.signOut()` has default scope **`global`**, so it revokes every device's session
(`auth.ts:47-48`). Local data stays on the device, by design.

**Account deletion: NOT IMPLEMENTED** anywhere (app, RPC, function). This is a **release blocker**.

- Google Play requires in-app account deletion for apps that create accounts, and privacy law expects erasure.
- An admin deleting `auth.users` cascades all rows, but **not storage objects** (no FK or trigger), which leaves orphans.

**What needs a production e-mail provider:**

- Every sign-in code. Supabase's built-in sender goes "only to pre-authorized addresses" (team members) at "2 messages per hour" (https://supabase.com/docs/guides/auth/auth-smtp).
- **Custom SMTP is required for real users.**
- With custom SMTP, Supabase starts at 30 messages per hour, adjustable under Auth → Rate Limits.

**Hosted settings to apply** (`config.toml` auth and templates are **not** applied by `db push`; use
`supabase config push` or the dashboard):

- `site_url` and redirect URLs set to non-localhost placeholders (unused by the code flow);
- custom SMTP;
- **the "Confirm signup" template must also carry `{{ .Token }}`**, or confirmations must be disabled. With `shouldCreateUser: true`, new users otherwise get a link-only e-mail and cannot sign in;
- shorter `otp_expiry` (1 hour today; recommend 10–15 minutes);
- rate limits for OTP send and verify;
- optional captcha.

---

## 3. Storage

**Bucket and paths.**

- Private bucket `documents`: `public=false`, 50 MiB, MIME allow-list pdf/jpeg/png/heic (mig 1:282-287).
- Path `<uid>/<vehicle>/<document>`.
- Policies require folder 1 = `auth.uid()` and folder 2 = a vehicle the caller owns (`can_access_document_path`, mig 1:291-311).
- Uploads `upsert: true`; downloads through 60 s signed URLs (`src/features/account/backend.ts:51-63`).

**Integrity.**

- An upload happens only if the local file re-hashes to the recorded SHA-256.
- A download is re-hashed; on mismatch it is discarded (`localStore.ts:382-417, 675-702`).

**Limits.**

- Client: 50 MB, with MIME taken from the picker's declaration (not content-sniffed).
- Plan: Free caps uploads at 50 MB ("the limit can't exceed 50 MB"); Pro allows up to 500 GB
  (https://supabase.com/docs/guides/storage/uploads/file-limits). The 50 MB design fits both.

**Deletion.**

- Vehicle deletion removes `<uid>/<vehicle>/*` **before** pushing the delete (fixed in RC,
  `localStore.ts:419-446`). Storage RLS needs the vehicle row to still exist.
- No single-document delete exists.

**Orphan and abuse findings:**

- **S1.** Account deletion must remove the user's prefix, through a service-role function.
- **S2.** The storage insert policy does not require a matching `documents` row. A user can upload
  arbitrary files, up to 50 MB each, into their own vehicle folders without limit. This is a
  cost/abuse vector. Require an existing owned `documents` row whose id is the object name, and
  optionally a per-user quota.
- **S3.** On other devices, local originals of a remotely deleted vehicle are not removed. The
  picker cache and dossier exports are never purged (local only).
- **S4.** `upsert: true` lets the owner overwrite their own object. The DB SHA-256 still anchors
  integrity, and download re-verifies, so this is low risk.

---

## 4. Sync

**Protocol** (ADR-0011; verified end to end at RC).

- SQLite triggers write an outbox per entity. Pushes go in batches of 50 to `sync_push`.
- Idempotency comes from the `op_id` ledger. Mutable tables use compare-and-set on `version`.
- Conflicts are resolved by an entity-aware 3-way merge (`src/sync/merge.ts`) and recorded as field conflicts.
- Pull: keyset `(server_updated_at, id)`, pages of 500. Vehicle tombstones propagate deletions.

**Offline:** the app is fully local. A reconnect triggers a sync.

**Multi-device:** a new device adopts its local data, then pulls everything, and fetches originals lazily.

**Correctness findings (release blockers for multi-device):**

- **Y1. Missed rows under concurrency.**
  - `server_updated_at = now()` is the **transaction start** time (mig 1:11).
  - A row committed late by a long transaction (`sync_push`, `adopt_local_data`) can carry a timestamp below a cursor another device has already passed. That row is **never pulled**.
  - Fix: pull with a safety overlap (re-read from `cursor − Δ`, relying on the idempotent, version-guarded apply the engine already has), or a commit-ordered sequence.
- **Y2. Possible infinite loop.** `service_event_documents` pulls with `server_updated_at >= ts` and no tiebreak (`supabaseTransport.ts:16,37`). If 500 or more rows share one timestamp (one adoption), paging never advances. Fix: a composite keyset on `(server_updated_at, service_event_id, document_id)`.
- **Y3. A poison op blocks the queue.** A server error raised inside `sync_push` fails the whole batch, and it is recorded as "network" every time. `attempts` has no cap and failing ops are never parked (`engine.ts:247-257`).
- **Y4. No automatic sync.**
  - Nothing runs on app start or foreground, after local writes, or on a timer.
  - `retryInMs` (backoff) is computed but never used (`engine.ts:420`).
  - A failed adoption stays "adopting" until the user signs out and in again (`LocalDataProvider.tsx:278`).
- **Y5.** Conflict "later wins" relies on client clocks (`merge.ts:50`). Acceptable, and documented.

---

## 5. Server / Edge functions

| Function                             | Needed for V1?                                                                                                                                        | Secrets                                                                                         | External calls                  | Zero-cost?                                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document-intelligence` (exists)     | **No.** V1 ships no OCR/AI (G3). It always answers 501 `not_configured` (`index.ts:43-46`), and `edgeDocumentReader` is not wired in production code. | `DOC_AI_PROVIDER` (unused)                                                                      | None                            | Yes, but **recommend not deploying it**. As written it relies only on the gateway's `verify_jwt`, which accepts the anon key; it does not call `getUser()` and has no quota (`index.ts:8,20`). |
| **`delete-account` (new, required)** | **Yes.** Account deletion (§2, S1).                                                                                                                   | `SUPABASE_SERVICE_ROLE_KEY` (injected by the platform into Edge Functions; UNCONFIRMED wording) | Supabase Storage/Admin API only | Yes (Free 500k and Pro 2M invocations; https://supabase.com/pricing)                                                                                                                           |
| Retention job (optional)             | No. It prunes `sync_applied_ops` and old tombstones. Could be a scheduled function or pg_cron later.                                                  | Service role                                                                                    | None                            | Yes                                                                                                                                                                                            |

Limits: 256 MB memory, 2 s CPU, secrets supported on every plan (100 per project)
(https://supabase.com/docs/guides/functions/limits and /secrets).

---

## 6. Vehicle registry (data.gov.il)

- **Called directly from the device**, with no backend (`src/providers/registry/dataGovIl.ts:12-26`; wired at `dataSource.ts:107`).
- Calls: `package_show` for 3 packages, then `datastore_search` with `filters={"mispar_rechev":…}`.
- 10 s per call. The resource-id cache is in memory for 24 h. No result cache, no retries.
- A 429 maps to "unavailable".
- Consent is explicit per press. Only the plate is sent, plus the device's IP address and user agent, inherent to any HTTP call.
- The response may include the VIN, which is stored only if the user confirms.
- Production concerns:
  - no backend is needed;
  - a public, free, key-less API;
  - failures already surface as "unavailable";
  - the privacy notice must state that the plate goes to data.gov.il (the in-app notice already does, `he.ts:96-97`).
- The main car resource was empty on 2026-09-27; the adapter correctly fell back to the model catalogue.
- Change needed: none. Optionally add a per-session throttle.

---

## 7. Source / document pipeline after P1

- **Disabled in production:**
  - `OFFICIAL_DOMAINS` and `KNOWN_OFFICIAL_SOURCES` are empty;
  - `reader`, `extractor` and `invoiceReader` are null;
  - `planOfficialSource` returns `not_found` before any network call (`src/features/sources/sourceService.ts:64-68`).
- **Explicit failures, verified:**
  - "לא ניתן לאמת" (unable to verify) for sources;
  - "unavailable" for registration-photo reading;
  - "קריאה אוטומטית אינה זמינה" (automatic reading unavailable) for invoices;
  - manual entry is first-class.
- No path fabricates data. Mocks exist only with `EXPO_PUBLIC_DEMO_DATA=1`.
- **Works without paid providers:** manual entry, invoice/photo/PDF originals, the registry lookup, the deterministic engine, alerts, backup.
- **Before any P1 domain enters `OFFICIAL_DOMAINS`** (P1 §8.4), the dormant crawler needs:
  - a per-domain `automation` flag (default prohibited);
  - **fail-closed** robots handling (today an unreachable robots.txt means allow-all, `officialSiteDiscovery.ts:83-84,55`);
  - an identifying User-Agent.

  This is P1/P3 work and **not needed for the backend launch**, because the registry stays empty.

---

## 8. Security and privacy

**Secrets.**

- The client bundles only the `EXPO_PUBLIC_*` URL, the anon key and flags (`src/config/env.ts`). The anon key is public by design; RLS is the boundary.
- The service-role key appears only in the test helper (`src/cloud/testing/localStack.ts`).
- Production adds server-side secrets (§E).

**PII.**

| Data                                              | Where it goes                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| E-mail                                            | Auth, and SecureStore on the device                                    |
| Plate and VIN                                     | Synced; the plate is also sent to data.gov.il on request               |
| Invoices and documents (may contain name/address) | Private bucket                                                         |
| Local SQLite and originals                        | **Unencrypted** in the app sandbox, excluded from Android cloud backup |
| Lock-screen notifications                         | Show make, model and alert kind                                        |

**Logs.**

- In production there are no console logs (`__DEV__` only). `redact()` masks e-mails, VINs, phones and plates.
- `sync_outbox.last_error` keeps raw server messages locally.
- Server logs (Supabase) contain request metadata. Their residency follows the platform: "Backups, logs … can affect your data residency" (https://supabase.com/docs/guides/security/gdpr-compliance).

**Backup and restore:** see §9.

**Deletion guarantees.**

- Vehicle deletion covers rows, tombstones, the bucket prefix and local files.
- **Account deletion is missing.** Required: a function that deletes the storage prefix, then `auth.users`. Rows cascade; `vehicles.profile_id → profiles` is NO ACTION, so verify it within one statement on staging.

**Abuse and rate limiting:**

- OTP send and verify limits;
- captcha optional;
- **storage insert tied to a document row** (S2);
- RPC input caps (A4);
- Pro spend cap on (default), so overage stops service instead of billing.

**Threat-model deltas from RC:**

- local loopback becomes the public internet;
- the anon key becomes public;
- e-mail bombing through OTP requests;
- OTP brute force (6 digits, bounded by `token_verifications`);
- storage filling (S2);
- a leaked service-role key (keep it only in the Supabase function environment);
- the function exposed with only anon-JWT protection (do not deploy `document-intelligence`).

**Production build.**

- HTTPS hosted URL in the EAS `production` environment. **Never** the `rc-local` variant or `.env.local`.
- Regenerate `android/` without the localhost-cleartext plugin.
- Add a release guard that rejects non-HTTPS or loopback URLs (`env.ts` has none).

---

## 9. Operations

- **Monitoring (minimum):**
  - Supabase dashboard usage and log explorer (API, auth, storage, function errors);
  - usage e-mails near quota;
  - a weekly check of auth failures and storage growth.

  No third-party APM is needed for V1.

- **Backups:**
  - Pro gives "the last 7 days of daily backups"; Free has none and the docs recommend regular
    `db dump` (https://supabase.com/docs/guides/platform/backups).
  - **Storage objects are not part of database backups** (UNCONFIRMED on the current page; verify
    before relying on it). Originals also stay on the user's devices, so they exist in two places.
  - Recommendation: add a weekly `supabase db dump` of the schema and data, encrypted and stored
    offline by the owner. It is free.
- **Migration and rollback:**
  - Migrations are forward-only.
  - Order: CLI `db push` to **staging**, run the cloud suite against staging, then production.
  - Roll back with a new corrective migration plus a restore from backup if data was affected.
  - Schema changes must be backward-compatible with deployed app versions: add first, remove later.
- **Staging vs production:**
  - **Two projects:** staging on **Free**, where pausing after a week of inactivity is acceptable, and production on **Pro**. Free allows 2 active projects (https://supabase.com/pricing).
  - Same EU region for both: **Frankfurt `eu-central-1`**. The region "determines where your primary project data is stored" (https://supabase.com/docs/guides/platform/regions). Free availability of that region is UNCONFIRMED.
- **Disaster recovery minimum:**
  - RPO 24 h (daily backups). RTO a few hours (restore by dashboard or dump).
  - Local-first devices hold full copies and re-sync after a restore.
  - Keep a documented restore drill on staging.
- **Maintenance burden:**
  - low: roughly an hour a week of monitoring;
  - a monthly review of Supabase changelogs and deprecations;
  - template and DNS upkeep;
  - quarterly restore drills.

---

## 10. Cost (official pages accessed 2026-09-27)

| Item             | Free                      | Pro                                                 |
| ---------------- | ------------------------- | --------------------------------------------------- |
| Price            | $0                        | **$25/month** (compute credit $10 covers one Micro) |
| Database         | 500 MB                    | 8 GB included                                       |
| Storage          | 1 GB                      | 100 GB included                                     |
| Egress           | 5 GB                      | 250 GB                                              |
| Auth MAU         | 50,000                    | 100,000                                             |
| Edge invocations | 500k                      | 2M                                                  |
| Backups          | **None**                  | 7 days daily                                        |
| Inactivity pause | **After 1 week**          | Never                                               |
| Built-in e-mail  | Team members only, 2/hour | Same; custom SMTP needed                            |

Sources: https://supabase.com/pricing,
https://supabase.com/docs/guides/platform/free-project-pausing,
https://supabase.com/docs/guides/platform/backups and
https://supabase.com/docs/guides/auth/auth-smtp.

**E-mail** (free tiers, custom SMTP):

| Provider   | Free tier                  | Notes                                                                                 | Source                             |
| ---------- | -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------- |
| Resend     | 3,000/month, 100/day, SMTP | Verified domain required; EU region (Ireland), whose Free availability is UNCONFIRMED | https://resend.com/pricing         |
| Mailgun    | 100/day                    | EU sending available                                                                  | https://www.mailgun.com/pricing/   |
| MailerSend | 500/month                  | Asks for payment details                                                              | https://www.mailersend.com/pricing |
| Brevo      | 300/day                    | Snippet only; UNCONFIRMED                                                             | —                                  |
| Postmark   | 100/month                  | US only                                                                               | https://postmarkapp.com/pricing    |
| SendGrid   | 60-day trial only          | —                                                                                     | —                                  |

- **Every option that can mail arbitrary users needs a verified sending domain.** Sandbox senders reach only your own or a few whitelisted addresses.
- Domain: an annual registrar fee. Cloudflare Registrar sells at cost (https://www.cloudflare.com/products/registrar/); the exact price is UNCONFIRMED.

**Zero-cost configuration: not viable for real users.**

- Free projects pause after a week of inactivity and have no backups.
- The built-in e-mail cannot reach real users.
- Custom SMTP needs a domain, which costs money.
- It is technically viable **only** as a closed pilot for team-member e-mails at 2 per hour, which is not production.

**Minimum sensible paid configuration:**

- Supabase Pro **$25/month**;
- a domain (small annual fee);
- a free e-mail tier (Resend Free: 100/day is plenty for OTP at V1 scale);
- staging on Free.

**What triggers each paid cost:**

| Trigger                                            | Cost                                                   |
| -------------------------------------------------- | ------------------------------------------------------ |
| The first real users                               | Pro, for no pausing and for backups                    |
| The first e-mail to a non-team address             | A domain, plus an SMTP provider (free tier)            |
| More than 100 OTP e-mails a day                    | Resend Pro, $20/month                                  |
| More than 8 GB DB, 100 GB storage or 250 GB egress | Pro overage, disabled by the spend cap unless opted in |
| RPO under 24 h                                     | PITR, about $100/month (needs Small compute)           |
| An SLA                                             | Team plan, $599/month                                  |

---

## A. Existing verified components reusable unchanged

- The local-first data layer and domain/engine (verify 44 / 305).
- The migration structure. The schema, forced RLS, owner policies, private bucket and path policy are sound; add to them, do not redesign.
- `adopt_local_data` and the `sync_push` op-ledger model; the entity-aware merge; tombstone propagation for vehicles.
- The originals pipeline: SHA-256 on import, upload and download; vehicle-delete removal of the bucket prefix (RC fix); 60 s signed URLs.
- E-mail code sign-in with no deep links, and SecureStore session storage.
- The on-device data.gov.il registry with explicit consent.
- Explicit "unavailable / unable to verify" behaviour, with no fabrication.
- EAS `production` profile (AAB, remote versioning).

## B. Required changes before Production (release blockers)

1. **Account deletion:**
   - an in-app flow (with confirmation) and a `delete-account` Edge Function;
   - the function authenticates the user with `getUser()`, removes the storage prefix, then deletes the auth user;
   - cascade verified on staging.
2. **Sync correctness:**
   - Y1: overlap re-pull or commit-ordered cursor;
   - Y2: composite keyset for `service_event_documents`;
   - Y3: cap attempts, park and surface poison ops.
3. **Sync scheduling (Y4):** sync on app start and foreground, debounced after local writes, and on retry with the existing backoff; recover a stuck adoption.
4. **Database hardening migration** (new migration, forward-only):
   - revoke TRUNCATE, TRIGGER and REFERENCES, and UPDATE on the sync tables, from `authenticated`, and set default privileges (A1);
   - add the indexes (A5);
   - `sync_push` fixes: server-enforced `version = base+1`, owner-aware duplicate, delete result only when a row was deleted, batch cap (A3/A4);
   - make `delete_vehicle_permanently` write a tombstone or revoke it (A2);
   - tie the storage insert policy to an owned `documents` row (S2).
5. **Auth configuration for hosted:**
   - custom SMTP;
   - the token in the "Confirm signup" template (or confirmations off);
   - OTP expiry of 10–15 minutes;
   - rate limits;
   - `site_url` changed from localhost;
   - an AppState auto-refresh and an `onAuthStateChange` handler in the client;
   - decide the sign-out scope (recommend `local`).
6. **Production build hygiene:** EAS production environment variables (HTTPS URL and anon key), a release guard against non-HTTPS or loopback URLs, and native projects regenerated without `rc-local`.
7. **Privacy and legal texts** for real users: a privacy notice (e-mail, plate to data.gov.il, documents in the EU cloud, deletion) and the Google Play Data safety form. These are store requirements, delivered with the Play gate.
8. **Do not deploy `document-intelligence`.** If it is ever deployed, it needs `getUser()`, a quota, a Content-Length check and size caps.

## C. Optional improvements (not release blockers)

- SQLCipher encryption at rest.
- Lock-screen notification privacy (private visibility).
- A retention job for `sync_applied_ops` and tombstones.
- A storage orphan reaper.
- Local cleanup of originals from remotely deleted vehicles, and of cache and export files.
- Syncing the `sources` table.
- Captcha on OTP.
- `upsert: false` for uploads.
- A registry throttle.
- Removing the dead `EXPO_PUBLIC_PROVIDER_MODE`.
- PITR.
- A weekly offline `db dump`, recommended.
- Crawler compliance (P1): required only before any domain is added.

## D. Cloud resources that would eventually need creation

1. A Supabase organization (existing account or a new one: owner's decision).
2. **Supabase project `autokeep-staging`**: Free, EU Frankfurt.
3. **Supabase project `autokeep-prod`**: **Pro**, EU Frankfurt, spend cap ON.
4. The storage bucket `documents` in each project, created by the migration, not by hand.
5. The Edge Function `delete-account` in each project.
6. **A domain** (for example an `autokeep` name), with DNS records SPF, DKIM, DMARC and the provider's verification records.
7. **A transactional e-mail provider account** (recommended: Resend Free, EU region if available; alternative: Mailgun EU), with the domain verified.
8. The EAS environment `production` variables (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`), and the same for `preview` pointing at staging.
9. Later gates, not P2: a Google Play Console account and store listing; production signing (the EAS-managed keystore exists).

## E. Secrets and credentials that would eventually be required

| Secret                                                           | Where it lives                                                                               | Who holds it |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ------------ |
| Supabase **DB password** (staging, prod)                         | Owner's password manager                                                                     | Owner        |
| Supabase **service-role key** (per project)                      | Only in the Edge Function environment (platform-provided) and never in the app or repository | Platform     |
| Supabase **anon/publishable key** (per project)                  | EAS env; public by design                                                                    | —            |
| **Supabase access token** for CLI `link`/`db push`/`config push` | Developer session, never committed                                                           | Developer    |
| **SMTP credentials** (provider API key / SMTP password)          | Supabase Auth SMTP settings                                                                  | —            |
| **DNS/registrar** account credentials                            | Owner                                                                                        | Owner        |
| Optional: **EXPO_TOKEN** for CI builds                           | Session or CI secret                                                                         | —            |
| Existing: the EAS-managed Android keystore                       | EAS                                                                                          | EAS          |

## F. Free vs paid comparison

|                        | Zero-cost                                          | Minimum paid (recommended)                                  |
| ---------------------- | -------------------------------------------------- | ----------------------------------------------------------- |
| Monthly                | $0                                                 | **≈ $25** (Pro; the Micro compute is covered by the credit) |
| Yearly extra           | $0                                                 | Domain fee (UNCONFIRMED exact price)                        |
| Real users can sign in | **No** (built-in e-mail reaches team members only) | Yes (custom SMTP, 100/day free)                             |
| Availability           | Pauses after 7 idle days                           | Always on                                                   |
| Backups                | None (manual dumps)                                | 7 × daily, plus an optional weekly dump                     |
| Staging                | —                                                  | Free project                                                |
| Paid AI/OCR/search     | Not needed                                         | Not needed                                                  |

## G. Recommended minimum Production configuration

- **Supabase:**
  - `autokeep-prod` on Pro, EU Frankfurt, spend cap on;
  - Micro compute (the included credit);
  - custom SMTP through Resend Free on the owned domain;
  - OTP expiry 10–15 minutes;
  - the "Confirm signup" template carrying `{{ .Token }}`;
  - auth rate limits set;
  - no `document-intelligence` deployment;
  - `delete-account` deployed.
- **`autokeep-staging`** on Free, same region, mirrors every migration first.
- **The app:** an EAS production build with the prod URL and anon key, HTTPS only.
- **Answers to the open questions:**
  - Two projects: yes.
  - Pro: **only before real public users**. Staging and internal testing can stay on Free. Production must be Pro from the first real user, because of pausing and backups.
  - A separate transactional e-mail provider: **yes**.
  - A paid AI/OCR/search provider: **no**.

## H. Ordered implementation and migration plan

1. **(Code, local, no cloud)**
   - the hardening migration: grants, indexes, `sync_push` and `delete_vehicle_permanently` fixes, the storage insert policy;
   - the sync fixes Y1–Y4;
   - the auth client changes;
   - the account-deletion function and UI;
   - the release URL guard.

   Tests for each, including negative controls, then verify and cloud suites against the local stack.

2. **(Gate)** Create `autokeep-staging` on Free. Link it, `db push`, `config push`, set SMTP, deploy `delete-account`.
3. Run the cloud suite against staging with disposable users. Do a device check with a preview build pointed at staging, including account deletion end to end.
4. **(Gate)** Register the domain; create the e-mail provider account; verify DNS.
5. **(Gate, paid)** Create `autokeep-prod` on **Pro** (EU Frankfurt). `db push` and `config push`, SMTP, the function, spend cap on.
6. Smoke-test prod with the owner's own account: sign-in, backup, restore on a second device, deletion. Set up the weekly offline dump.
7. **(Gate, P3 or store)** Build the production AAB with the prod env. Google Play internal testing is a separate gate.

## I. Explicit approval gates and external actions

1. **Approve this P2 plan** and the §B blocker list, then start the code work (step H1), which is local only.
2. **Create the Supabase staging project** (Free). This is a hosted resource creation.
3. **Choose and register a domain.** This is a purchase.
4. **Create a transactional e-mail provider account** (Resend or an alternative) and add DNS records. These are external accounts and DNS changes.
5. **Upgrade or create the production project on Supabase Pro** (≈ $25/month). This is a paid service.
6. **Apply migrations to production** (`db push`) and configure production auth and SMTP. This is a production mutation.
7. **Deploy Edge Functions** to staging and prod.
8. **Set the EAS production environment variables.**
9. **Privacy notice and legal texts** (content approval).
10. **Google Play Console** (one-time fee) and any store upload. This is a separate later gate.

Nothing in this list has been started.
