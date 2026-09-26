# ADR-0017: Document intelligence runtime architecture

- Status: accepted (G2, 2026-09-26)

## Decision

### Registration

1. Use the plate from the scan or from typing.
2. Look it up in the official Israeli registry (data.gov.il, only with consent). Registry values
   outrank OCR.
3. Use OCR/AI only for fields that are still missing.

Uncertain scanned values are never silently accepted.

### Invoices

OCR/AI produces an editable draft. The user reviews and corrects it, then explicitly confirms,
and only then does it enter history. The original is stored as evidence (M15).

### Manuals and maintenance documents

1. Extraction produces structured intervals and items, each with an exact page, section or table
   and a quote grounded against the OCR text.
2. The domain decides verification.
3. The deterministic engine computes due points.

### Runtime placement

OCR/AI runs **server-side** behind the provider-independent ports (`OcrProvider`,
`StructuredExtractor`), in a Supabase Edge Function (`document-intelligence`). That keeps vendor
keys off the device and makes the vendor replaceable without domain or UI changes.

- The client adapter (`edgeDocumentReader`) sends the original and receives OCR text and a
  candidate structure.
- All trust decisions stay in the app: schema validation, grounding, injection flags, drafts
  only.

The vendor itself (and its cost and data-processing terms) is a separate approval. Until it is
approved, the function answers `not_configured` and the app keeps "reading unavailable".

## Consequences

- Documents leave the device for reading once a vendor is configured, and the privacy notice must
  say so.
- AI output is always derived data and never mutates confirmed history.
