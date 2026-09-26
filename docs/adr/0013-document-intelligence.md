# ADR-0013: Document intelligence — AI proposes, evidence grounds, domain decides

- Status: accepted
- Date: 2026-09-26

## Context

Manuals and invoices must become structured data without AutoKeep ever inventing maintenance facts (invariants 1–4, 6–8). Per G1, no runtime OCR/AI provider is chosen yet.

## Decision

- **Ports:** `OcrProvider`, `StructuredExtractor` (`src/intelligence/ports.ts`). Only labeled mocks exist until a provider is approved at a later gate.
- **Untrusted input (T092):**
  - Document text reaches an extractor only as `UntrustedContent`: sanitized (hidden and bidi-control characters removed), page-separated and wrapped in a per-request random boundary the document cannot forge.
  - Instruction-like text (EN/HE), line-start role markers and imitations of the boundary tag are flagged.
  - Adapters must send `UNTRUSTED_DATA_POLICY` as fixed instructions and never concatenate document text into them.
- **Schemas (T089):** zod, unknown keys stripped, invalid output rejected (never repaired). Every maintenance fact carries an evidence reference (page + verbatim quote).
- **Grounding (T090):** each interval and item is kept only if its quote is found on the cited page of the original OCR text (exact, or ≥ 90 % token coverage for OCR noise). Paraphrases and invented facts are dropped.
- **Confidence (T091):**
  - < 0.6: dropped.
  - 0.6–0.9: kept but review required.
  - A flagged (suspicious) document withholds exact applicability, so the domain can never auto-verify it.
  - Verification is always decided by the domain (`createSchedule`) from source authority + applicability.
- **Invoices (T093):** produce a `ServiceDraft` only, with uncertain fields listed and low-confidence values left empty for the user. History requires the explicit `confirmServiceDraft(UserConfirmation)`.

## Consequences

- A real provider can be plugged in later without touching trust logic.
- Its cost, privacy and model choice are a future approval gate.
