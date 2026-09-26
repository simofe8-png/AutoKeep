# AutoKeep V1 — Threat Model & Security Review (M22)

_Date: 2026-09-26 · Scope: the Expo app, the local SQLite store, provider ports, and the Supabase
backend schema, RLS and storage (local stack; a hosted project is an approval gate, T065/M24).
Method: asset/actor/boundary analysis with STRIDE per boundary, then an OWASP MASVS-oriented
checklist (T167). Every mitigation below points at the code, and at the test that proves it where
one exists._

## 1. Assets

| Asset                                            | Why it matters                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| Service history, odometer readings, deferrals    | Long-lived vehicle value; must not be lost, forged or mixed between vehicles |
| Document originals (invoices, licenses, manuals) | May contain names, addresses, VIN; evidence for provenance                   |
| Vehicle identifiers (registration, VIN)          | Personal data under Israeli privacy law; enable owner lookup                 |
| Account identity (email) and session tokens      | Account takeover means access to the full history                            |
| Maintenance recommendations                      | Safety-relevant: must never be fabricated or poisoned                        |

## 2. Actors

- **Owner:** the legitimate user, possibly on several devices.
- **Other users:** authenticated but not the owner (BOLA/IDOR attempts).
- **Anonymous network attacker.**
- **Malicious document author:** a crafted invoice or manual (prompt injection, hostile files).
- **Malicious or compromised source:** a fake "official" manual site.
- **Device thief:** a lost or unlocked phone.
- **Supply chain:** npm dependencies.

## 3. Trust boundaries

1. **UI ⇄ local store:** all writes go through domain constructors (validation, provenance).
2. **App ⇄ Supabase (network):** anon key only. RLS is authoritative.
3. **App ⇄ external providers:**
   - data.gov.il: plate only, with consent;
   - discovery, OCR and AI: provider ports; no provider is approved yet (G1).
4. **App ⇄ OS:** file pickers, camera, share sheet, notifications, secure store.

## 4. Threats and mitigations (STRIDE)

| #   | Threat                                               | Mitigation                                                                                                                                                                                                                                                           | Evidence                                                                                              |
| --- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| S1  | Account takeover / session theft                     | Supabase Auth, one-time email code; session stored with **chunked SecureStore** (Keystore-backed); no passwords handled                                                                                                                                              | `src/cloud/secureSessionStorage.ts`, tests `secureSessionStorage.test.ts`                             |
| T1  | Forged `owner_id` / writes to another user's vehicle | Forced RLS on every table, composite FK `(vehicle_id, owner_id)`, `owner_id` immutable, SECURITY INVOKER RPCs                                                                                                                                                        | `rls.cloud.test.ts` (BOLA/IDOR, forged owner, client-supplied vehicle_id)                             |
| T2  | Hijacking another user's rows through adoption ids   | Adoption RPC never overwrites a foreign id; read-back verification leaves adoption _pending_                                                                                                                                                                         | `adoption.cloud.test.ts` (hostile id collision); M19 fix of a test-id collision proved the check live |
| T3  | Tampered document original                           | SHA-256 recorded at import, re-verified on every view and before upload; a mismatching restored copy is discarded                                                                                                                                                    | `history-documents.test.tsx` (tamper), `account.cloud.test.ts` (restore re-verified)                  |
| T4  | Fake "official" manual (source poisoning)            | Only a **verified official-domain registry** grants authority (ships empty); exact-applicability matching; user uploads can never be manufacturer/importer evidence (domain rule)                                                                                    | discovery tests (M10), `createDocument` rule, `history-documents.test.tsx`                            |
| T5  | Prompt injection in invoices/manuals                 | Untrusted content wrapped with a random boundary; hidden/bidi chars stripped; instruction-like text and boundary forgery **flagged**; schema-validated output; every fact grounded against OCR text; invoices → **draft only**, all flagged values marked for review | `intelligence.test.ts`, `failure-recovery.test.tsx` (flagged document, invalid output)                |
| T6  | Fabricated maintenance advice                        | Engine computes only from a **verified** schedule; unverified → "unavailable" with the reason; history never marked overdue for missing records                                                                                                                      | engine suite (M12), `adapters.test.ts`, `garage-mode.test.tsx`                                        |
| R1  | Silent data changes across devices                   | Sync op ledger, CAS on version, three-way merge; conflicts recorded and shown to the user                                                                                                                                                                            | `sync.cloud.test.ts`, `failure-recovery.test.tsx` (conflicts)                                         |
| I1  | Cross-vehicle leakage in the app                     | Every repository read takes a vehicleId; views scoped; randomized leakage gate                                                                                                                                                                                       | `leakage.test.ts` (negative control fails), `multi-vehicle.test.tsx`                                  |
| I2  | Cross-user leakage in the cloud                      | RLS select policies; private `documents` bucket with path-based storage RLS; signed URLs (60 s) only                                                                                                                                                                 | `rls.cloud.test.ts` (storage), `account.cloud.test.ts` (other user cannot sign the object)            |
| I3  | PII in logs/diagnostics                              | `safeErrorText`/`redact` on every log or technical error path (VIN/plate → last 4, email/phone removed); technical detail shown only in `__DEV__`                                                                                                                    | `redact.test.ts`                                                                                      |
| I4  | Registry lookup leaks personal data                  | Only the plate is sent, after an explicit consent notice; the response has no owner data                                                                                                                                                                             | ADR-0012, `real-data.test.tsx` (consent + plate only)                                                 |
| I5  | EXIF/location in photos                              | Image capture requests no EXIF                                                                                                                                                                                                                                       | `expoAcquisition.ts`                                                                                  |
| D1  | Hostile/huge files                                   | Type allow-list + size bound at acquisition and at storage (bucket `file_size_limit`, `allowed_mime_types`); empty files rejected                                                                                                                                    | `screenAcquiredFile` tests, `rls.cloud.test.ts` (content types)                                       |
| D2  | Malformed deep links                                 | expo-router parsing; alert/document ids resolved only against local records (unknown → empty state)                                                                                                                                                                  | `alerts.test.tsx`, `multi-vehicle.test.tsx`                                                           |
| E1  | Privilege escalation via service key                 | Service-role key never in the app (`EXPO_PUBLIC_*` only); secrets-boundary test scans the bundle config                                                                                                                                                              | `secrets-boundary.test.ts`                                                                            |
| E2  | Destructive operations by mistake                    | Archive ≠ delete; delete = exact preview → typed registration → one transaction → originals removed after commit                                                                                                                                                     | `lifecycle.test.tsx`                                                                                  |

## 5. OWASP MASVS-oriented review (T167)

| Area                 | Status                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **MASVS-STORAGE**    | Data sits in the app sandbox (SQLite, private document directory); session is in SecureStore; no secrets in AsyncStorage or logs; exports only through the user-chosen share sheet. **Residual:** the SQLite file isn't encrypted at rest. It relies on Android sandbox and device encryption, which is accepted for V1; revisit if a threat requires it. |
| **MASVS-CRYPTO**     | Uses platform crypto only: SHA-256 via expo-crypto, UUIDv4 from a CSPRNG. There is no custom cryptography.                                                                                                                                                                                                                                                |
| **MASVS-AUTH**       | Provider auth (Supabase, email OTP code), and authorization is server-side (RLS). The implicit flow is used deliberately: codes are verified in-app, with no redirect or token in a URL.                                                                                                                                                                  |
| **MASVS-NETWORK**    | HTTPS is required for hosted endpoints. The local dev stack is HTTP over `adb reverse` only; production config is gated at M24.                                                                                                                                                                                                                           |
| **MASVS-PLATFORM**   | Deep links go only to internal routes; share happens only on explicit user action; permissions are requested in context (camera, notifications), and denials are explained.                                                                                                                                                                               |
| **MASVS-CODE**       | Dependencies are audited (below). zod-validated external data applies to AI output, registry responses and sync rows.                                                                                                                                                                                                                                     |
| **MASVS-RESILIENCE** | Not in V1 scope (no anti-tamper requirement).                                                                                                                                                                                                                                                                                                             |
| **MASVS-PRIVACY**    | Data minimization: the extraction contract has no owner fields, only the plate is sent to the registry, and there's no EXIF. The UI masks VIN and plate in logs. Account creation is optional and delayed.                                                                                                                                                |

## 6. Dependency scan (T166)

`npm audit` (2026-09-26): **0 critical, 0 high**, 15 moderate.

- **Build-time only:** `@expo/cli`, `@expo/config-plugins` → `xcode` → `uuid`. These run at prebuild on the developer machine and don't ship in the app.
- **Runtime:** `expo-router` → `query-string` → `decode-uri-component`. The DoS needs a malformed percent-encoded deep link, and the only deep links are our own notifications and internal routes.
- **Disposition:** accepted as residual risk. The versions are pinned by Expo SDK 57, and forcing fixes breaks the SDK. Re-check at every SDK upgrade and at RC (T183).

## 7. Findings register (T168)

| ID   | Severity | Finding                                                                                                       | Status                                                                                                                     |
| ---- | -------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| F-01 | High     | Document originals weren't backed up. Only metadata synced, so a device loss meant losing the evidence files. | **Fixed (M22):** private-bucket upload after sync, on-demand restore with SHA-256 re-verification; `account.cloud.test.ts` |
| F-02 | Medium   | No redaction utility, although SECURITY.md required one. Dev error text could carry VIN, plate or email.      | **Fixed (M22):** `src/security/redact.ts` applied to all log and error paths; tests                                        |
| F-03 | Medium   | The PKCE flow on Hermes fell back to a plain challenge (no WebCrypto).                                        | **Fixed (M19):** implicit flow for in-app code sign-in; nothing is exchanged via URL                                       |
| F-04 | Low      | The SQLite store isn't encrypted at rest beyond OS sandbox and device encryption.                             | Accepted for V1 (see MASVS-STORAGE)                                                                                        |
| F-05 | Low      | 15 moderate npm advisories (build tooling, deep-link DoS).                                                    | Accepted, re-check at RC                                                                                                   |

**Open Critical/High: none.**
