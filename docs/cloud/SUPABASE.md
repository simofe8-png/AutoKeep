# Supabase cloud foundation (M07)

## Scope and environments

| Environment               | What                                                                                                                                                            | Approval                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Local dev**             | `npx supabase start` (Docker): Postgres 17, Auth (GoTrue), Storage, Mailpit, edge runtime. Studio, realtime and analytics are disabled to fit a 4 GB Docker VM. | Not needed (local, free)                                               |
| **Hosted** (staging/prod) | A Supabase project in the cloud                                                                                                                                 | **Approval gate T065**: account, region, plan and cost, data residency |

Nothing is created in the cloud without explicit user approval. `supabase/` holds the config and migrations.

## Data model mapping

The cloud mirrors the local SQLite schema (ADR-0008) with these additions:

- `owner_id uuid NOT NULL DEFAULT auth.uid()` on every table.
- **Composite ownership FK:** vehicle-scoped tables reference `vehicles(id, owner_id)` through `(vehicle_id, owner_id)`. A row can only point at a vehicle owned by the same user, whatever `vehicle_id` the client sends (BOLA/IDOR defense in depth).
- `owner_id` is immutable (trigger), so rows cannot be re-parented to another user.
- `server_updated_at timestamptz` is maintained by a trigger and used for incremental sync pulls (M09).
- IDs are client-generated UUIDs (offline creation, ADR-0002). `version` supports optimistic concurrency.

## Authorization (T061)

- RLS is **enabled and forced** on every table. Policies: `owner_id = auth.uid()` for select/insert/update/delete. Anon has no access.
- **Never trusted from the client:** `owner_id` (defaults to `auth.uid()` and is checked by policy) and `vehicle_id` ownership (composite FK plus policy).
- The service-role key is server-side only: never in the app bundle and never `EXPO_PUBLIC_*`.
- No `SECURITY DEFINER` functions unless reviewed and listed here. The RPCs are `SECURITY INVOKER`, so RLS applies.

## Storage (T062)

- Bucket `documents` is **private** (`public = false`) with a 50 MB limit and a MIME allow-list (pdf/jpeg/png/heic).
- The object path is `{owner_id}/{vehicle_id}/{document_id}`. Storage policies require the first folder to be `auth.uid()` and the second to be a vehicle owned by the caller.
- Access uses only short-lived signed URLs. There are no permanent public URLs (SECURITY.md).

## Auth (T060)

- **Proven provider:** Supabase Auth with email one-time codes (no custom password cryptography). Phone is not required.
- The session is stored in `expo-secure-store` (Android Keystore-backed).
- The account is optional and offered later (M08). Local use never requires sign-in.

## Server-side boundary (T063)

- The client uses the anon key plus the user JWT, and everything goes through PostgREST under RLS.
- Privileged operations (e.g. account deletion) run only in Edge Functions with the service role, after verifying the caller's JWT.
- RPC `vehicle_deletion_preview(uuid)` and `delete_vehicle_permanently(uuid)` are SECURITY INVOKER.

## Tests (T064)

`npm run test:cloud` runs `src/cloud/__tests__/*.cloud.test.ts` against the local stack with two real users. It covers anon denial, cross-user select/update/delete/insert denial, forged `owner_id`/`vehicle_id`, owner immutability, and storage isolation including signed URLs.
