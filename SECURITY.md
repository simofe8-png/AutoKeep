# AutoKeep Security

Source: AUTOKEEP_V1_SPEC.md §23. The full threat model is produced in M22 (T160).

## Principles

- Least privilege everywhere, with server-side authorization. Supabase RLS keys on `auth.uid()`.
- A client-supplied `vehicle_id` is **never** authorization. Ownership is checked server-side (BOLA/IDOR).
- User documents are private by default and stored in a private bucket. Access uses only short-lived signed URLs, never permanent public URLs.
- Minimize sensitive data. VIN and registration are masked in UI (last 4 visible) and redacted from logs and telemetry.
- Secrets stay outside source control. `.env*.local` is git-ignored. Only `EXPO_PUBLIC_*` values (non-secret) reach the client bundle.
- Uploaded and retrieved documents are untrusted input: validate type and size, never execute, and parse defensively.
- Prompt-injection boundary: retrieved or document content is passed to AI as data in delimited fields. System instructions never come from content. AI output is schema-validated before use.
- Destructive operations require explicit confirmation (preview → confirm → execute → result).
- Use a proven auth provider (Supabase Auth). No custom password cryptography.

## AutoKeep-specific threats (initial)

| Threat                                    | Mitigation direction                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Cross-vehicle or cross-user data leakage  | vehicle_id-scoped repositories, RLS, isolation tests                                                |
| Source poisoning (fake "official" manual) | authority classification, exact-applicability matching, provenance, unverified by default           |
| Prompt injection in invoices or manuals   | data/instruction separation, schema validation, draft-only output                                   |
| Fabricated maintenance advice             | engine requires verified schedule; no AI-authored requirements                                      |
| PII in logs                               | redaction utility, tested                                                                           |
| Lost device                               | cloud backup after account creation; no secrets on device beyond the auth session in secure storage |

## Reporting

Findings are recorded in `docs/security/` with a severity rating. V1 RC requires zero unresolved Critical/High findings.
