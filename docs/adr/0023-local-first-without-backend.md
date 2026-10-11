# ADR-0023: Local-first without an AutoKeep backend

- Status: accepted (owner instruction "Local-First Migration Master Plan V1", 2026-10-11)
- Date: 2026-10-11
- Supersedes: ADR-0010 (account adoption), ADR-0011 (sync protocol), ADR-0018 (hosted backend),
  ADR-0019 (Private Beta username + password). Amends ADR-0002 (the sync boundary is removed).

## Decision

**Local device is the source of truth. AutoKeep operates without an AutoKeep user-data backend.**

| Concern               | Where it lives                                                                                     |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Structured user data  | SQLite on the device (`expo-sqlite`, `src/persistence`)                                            |
| Documents and photos  | App-private file storage (`originals/…`, `src/providers/storage`); the DB keeps key/type/size/hash |
| Secrets / keys        | None are needed. `expo-secure-store` was removed with the account session.                         |
| Backup                | One file the user saves and restores where they choose (`src/persistence/backup`)                  |
| Server-side user data | None. No AutoKeep database, auth, storage, sync or function exists.                                |
| GitHub                | Source code only                                                                                   |
| Vercel                | Public, stateless pages only (none deployed from this repository today)                            |
| EAS / Google Play     | App distribution and over-the-air updates only                                                     |

No account is created or required. There is no central replication and no replacement backend.

## Inventory before the migration (stage 2)

Every cloud reference at `pre-local-first` (`d41baa0`), classified:

| Item                                                                                          | Class      | Outcome                                             |
| --------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------- |
| `src/cloud` (client, auth, username, backend URL guard, SecureStore session storage)          | REMOVE     | deleted                                             |
| `src/sync` (outbox engine, merge, Supabase transport, memory server)                          | REMOVE     | deleted                                             |
| `src/account` (adoption, bundle, Supabase adoption, delayed offer)                            | REMOVE     | deleted                                             |
| `src/features/account` (backend, auth texts, offer card, test backend)                        | REPLACE    | offer card → `src/features/backup/BackupOfferCard`  |
| `src/app/account.tsx`, `src/app/invite.tsx` (sign-in, invitation, password, delete account)   | REPLACE    | `src/app/backup.tsx` (save / restore a backup file) |
| `src/features/data/syncScheduler.ts`, account/sync parts of the store and provider            | REMOVE     | deleted                                             |
| `src/config/env.ts` (Supabase URL/key, provider mode — no other reader)                       | REMOVE     | deleted                                             |
| Local SQLite v2/v3 sync triggers + `sync_*` tables, account settings                          | REMOVE     | migration v21 drops them; v2/v3 kept as history     |
| `supabase/` (12 migrations, `register` + `delete-account` functions, config)                  | REMOVE     | deleted                                             |
| `tools/beta-admin.mjs` (invitations, users, passwords)                                        | REMOVE     | deleted                                             |
| `app.config.js` variants `rc-local` (loopback backend) and `staging` (hosted staging)         | REMOVE     | file deleted; `eas.json` profile `rc-local` deleted |
| `plugins/withLocalhostCleartext.js`                                                           | REMOVE     | deleted                                             |
| `jest.cloud.config.js`, `jest.cloud.setup.ts`, every `*.cloud.test.ts`, account/sync tests    | REMOVE     | deleted; replaced by backup and local-first tests   |
| CI job `cloud-security` (local Supabase stack)                                                | REMOVE     | deleted                                             |
| npm `@supabase/supabase-js`, `supabase`, `expo-secure-store`; scripts `cloud:*`, `test:cloud` | REMOVE     | uninstalled                                         |
| `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` in `.env.local`, EAS `production` and `preview`      | REMOVE     | no code reads them; deletion is stage 23            |
| `docs/cloud/SUPABASE.md`, hosted runbooks, Private Beta auth, P2 backend plan/reports         | REMOVE     | deleted (Git history keeps them)                    |
| ADR-0010/0011/0018/0019, dated reports that mention the cloud                                 | HISTORICAL | kept, marked superseded / historical                |

Nothing was KEEP TEMPORARILY: the hosted project itself is outside the repository (stage 23).

## User data and its single owner (stage 3)

| Data                                                                   | Before                     | Final owner                                                            |
| ---------------------------------------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| Vehicles (plate, VIN, identity, colour, engine code, phase, lifecycle) | SQLite + cloud replica     | SQLite `vehicles`                                                      |
| Mileage                                                                | SQLite + cloud replica     | SQLite `odometer_readings`                                             |
| Service history, actions, linked documents                             | SQLite + cloud replica     | SQLite `service_events`, `service_actions`, `service_event_documents`  |
| Documents (licence, invoices, booklet, insurance…) — records           | SQLite + cloud replica     | SQLite `documents`                                                     |
| Documents — original files (PDF / images)                              | app files + private bucket | app files `originals/` (key in `documents.storage_key`)                |
| Owner's vehicle photo                                                  | app files (never synced)   | app files `originals/` (key in settings `vehiclePhotos`)               |
| OCR / extraction proposals                                             | SQLite + cloud replica     | SQLite `extractions`                                                   |
| Schedules, evidence, sources, provenance / verification records        | SQLite + cloud replica     | SQLite `schedules`, `sources`, `maintenance_*`, `knowledge_*`          |
| Garage recommendations, deferred items, alerts                         | SQLite + cloud replica     | SQLite                                                                 |
| Maintenance table, periodic services, manual items, notes              | SQLite (local only)        | SQLite `service_tables`, `service_table_done`, `manual_schedule_items` |
| Test date, insurance                                                   | SQLite (local only)        | SQLite `vehicle_dates`                                                 |
| Vehicle spec (oil, fluids, tyres, notes)                               | SQLite (local only)        | SQLite `vehicle_spec`                                                  |
| Ministry registry record                                               | SQLite (local only)        | SQLite `vehicle_registry_records`                                      |
| Owner documents review (M-SOURCE)                                      | SQLite (local only)        | SQLite `msource_*`                                                     |
| Settings (notifications, active vehicle, profile card, last backup)    | SQLite                     | SQLite `settings`                                                      |
| Device profile                                                         | SQLite + cloud replica     | SQLite `profiles` (`account_user_id` cleared by v21)                   |
| Account session token                                                  | SecureStore                | none (see stage 5)                                                     |

Every table except `schema_migrations` goes into the backup file, so no persistent user data is
outside the backup.

## Migration safety (stage 5)

- The app's sync **pulled** every server row into local SQLite, so after a device's last
  successful sync its local database holds everything the account held. The only data the cloud
  could hold that a device does not is (a) rows written by another device after this device's
  last pull, and (b) document **original files**, which were downloaded lazily (only when opened)
  after a restore from the account.
- Removing the app code is not destructive: it deletes nothing in the cloud. The hosted project
  stays exactly as it is until stage 23, which needs the owner's account and is the only
  destructive step.
- On the device, the new backup reports referenced originals that are missing from the device
  ("N קבצים מקוריים לא נמצאו במכשיר"). Before the hosted project is deleted, the owner saves a
  backup on the phone and confirms that this count is 0. If it is not, the missing originals are
  still in the hosted bucket and must be exported from the Supabase dashboard first.
- Cloud-side verification needs the owner's Supabase credentials, which are outside this
  repository by design. It is done at stage 23.

## Backup file (stages 13–14)

- One JSON file `autokeep-backup-YYYY-MM-DD.json`: `format: "autokeep-backup"`,
  `formatVersion: 1`, `createdAt`, `schemaVersion` (the database migration level), every table as
  columns + rows, every referenced original as base64 with size and SHA-256, and a manifest
  (`tableCounts`, `fileCount`, `missingFiles`, `contentSha256` over the canonical tables + file
  list).
- Saved where the user chooses: a folder on the device (Android Storage Access Framework) or the
  share sheet (Google Drive, Files, e-mail, …). Restored from a file the user picks (system
  document picker, which includes Google Drive). AutoKeep never uploads it.
- Restore validates everything first: format and version, schema not newer than the app, every
  table and column known, row and file counts, the content checksum, every file's size and
  SHA-256, and safe file keys. Any failure returns a reason and changes nothing.
- Then: write only files the current data does not use → replace all tables in **one**
  transaction (foreign keys checked at commit) → after the commit, overwrite shared keys and
  remove files no longer referenced. A failed commit rolls back and removes the newly written
  files. The store reopens afterwards (the device profile comes from the backup).
- The file holds all user data, unencrypted. It goes only where the user puts it; the screen says
  so. Encryption with a user passphrase is a possible later addition (new format version).

## File ownership (stage 12)

`src/persistence/files.ts` lists every stored file a record refers to. When the store opens,
files no record refers to (an interrupted import or deletion) are removed, before any write.
Deleting a vehicle removes its documents' originals and its photo after the rows are deleted.

## Consequences

- No account, sign-in, invitation, password, cloud backup, multi-device sync or account deletion.
  A new device is set up by restoring a backup file ("יש לי קובץ גיבוי — שחזור" on the welcome
  screen).
- Losing the phone without a saved backup loses the data. The Home screen offers a backup once
  there is history or a document and no backup has been saved.
- Removing `expo-secure-store` (and the unused `expo-web-browser`, `expo-device`) changes the
  native runtime: the change ships in a new `staging-internal` build, not as an OTA update.
- An upgraded device keeps an orphaned, keystore-encrypted Supabase session token in SecureStore
  (its key embeds the project ref, which the app no longer has). It is useless once the hosted
  project is deleted and disappears on uninstall.
