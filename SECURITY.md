# AutoKeep Security

Source: AUTOKEEP_V1_SPEC.md §23. The full threat model, MASVS review, dependency disposition and
findings register are in [docs/security/THREAT_MODEL.md](docs/security/THREAT_MODEL.md) (M22).

## Principles

- **Local-first, no backend (ADR-0023):** local device is the source of truth. AutoKeep operates without an AutoKeep user-data backend, so there is no server-side copy of user data, no account and no credential to protect. Network paths are listed in [docs/security/NETWORK.md](docs/security/NETWORK.md) and guarded by a test.
- User data (SQLite and document originals) lives only in the app's private storage. Originals are never referenced by a public URL; they open through a temporary read grant.
- A backup file holds all user data unencrypted and goes only where the user puts it (device folder or share sheet); restore validates format, schema and SHA-256 checksums and never overwrites working data with an invalid file.
- Minimize sensitive data. VIN and registration are masked in UI (last 4 visible) and redacted from logs and telemetry.
- Secrets stay outside source control. `.env*.local` is git-ignored. Only `EXPO_PUBLIC_*` values (non-secret) reach the client bundle.
- Uploaded and retrieved documents are untrusted input: validate type and size, never execute, and parse defensively.
- Prompt-injection boundary: retrieved or document content is passed to AI as data in delimited fields. System instructions never come from content. AI output is schema-validated before use.
- Destructive operations require explicit confirmation (preview → confirm → execute → result).

## AutoKeep-specific threats (initial)

| Threat                                    | Mitigation direction                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Cross-vehicle data leakage                | vehicle_id-scoped repositories, isolation tests                                                        |
| Source poisoning (fake "official" manual) | authority classification, exact-applicability matching, provenance, unverified by default              |
| Prompt injection in invoices or manuals   | data/instruction separation, schema validation, draft-only output                                      |
| Tampered or foreign backup file           | format/version/schema checks, per-file and content SHA-256, atomic restore, nothing changes on failure |
| Fabricated maintenance advice             | engine requires verified schedule; no AI-authored requirements                                         |
| PII in logs                               | `src/security/redact.ts` (`safeErrorText`) on every log/technical-error path, tested                   |
| Lost device                               | user-saved backup file (Home offers it once data exists); no secrets on the device                     |

## Reporting

Findings are recorded in `docs/security/` with a severity rating. V1 RC requires zero unresolved Critical/High findings.
