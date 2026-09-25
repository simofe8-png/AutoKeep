# ADR-0009: Vehicle identification pipeline

- Status: accepted
- Date: 2026-09-26

## Context

Onboarding identifies the vehicle from its registration (license) document without inventing data. Real OCR/AI and vehicle-registry providers carry cost, privacy and lock-in consequences, so choosing one is an approval gate (MASTER_EXECUTION "External providers").

## Decision

- **Pipeline:** acquisition (`AcquisitionProvider`, expo pickers) → `RegistrationExtractor` (untrusted output, zod-validated, `.strip()`) → optional `VehicleCatalog` → `resolveIdentification` → draft.
- **Data minimization:** the extraction contract has no owner name, ID or address fields, and unknown keys are stripped. Images are requested without EXIF.
- **Confidence:**
  - ≥ 0.9: accepted.
  - 0.6–0.9: shown as uncertain and must be checked by the user.
  - < 0.6, or malformed: treated as missing.
- **Type recognition:** deterministic from the category text. Motorcycle vs scooter is never guessed; the user chooses.
- **Ambiguity:** several matching catalog variants mean the user must choose. A single match fills only the gaps (origin `catalog`); scanned values are never overwritten.
- **Provenance per field:** `scan`, `user` or `catalog`. User input never becomes `scan`.
- **Manual fallback** produces the same draft shape.
- **Providers now:** `MockRegistrationExtractor` (labeled) and `emptyCatalog`.

### Candidate providers for later approval

- OCR/AI extraction (M11).
- The Israeli government open vehicle registry on data.gov.il, looked up by plate number. It's free, but sending plate numbers to a third-party API is a privacy data flow that requires user approval.

## Consequences

- The full logic is testable without any provider.
- Wiring the pickers and the pipeline into the frozen onboarding UI happens in M13 (T106), where the on-device camera and picker check will be recorded.
