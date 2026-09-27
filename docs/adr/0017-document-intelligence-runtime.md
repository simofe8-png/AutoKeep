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

## Amendment (G3, 2026-09-26): no paid OCR/AI in V1

**Manual service entry is the complete, first-class workflow.** Invoice, photo and PDF attachment
works without OCR: the original is stored with SHA-256 and linked to the confirmed record (M15).

The `document-intelligence` function and the client ports remain in place, answering
`not_configured`, as an optional future convenience that keeps the same draft → review →
confirmation flow.

Without paid OCR/AI, a verified manual can only become a maintenance schedule through a
**human-curated, evidence-pinned schedule** in the verified registry. That schedule is approved by
a person, and every item carries page/section references to the pinned official document.
Otherwise the app reports "unable to verify".

## Amendment (P2A, 2026-09-27): function removed

The `document-intelligence` Edge Function and its client adapter (`edgeDocumentReader`) were
removed.

- No production path used them.
- As written, the function relied only on the gateway's JWT check, which accepts the public anon
  key. It had no per-user check and no quota: a paid vendor wired into it later could have been
  spent by anyone holding the app.

The provider-independent ports (`OcrProvider`, `StructuredExtractor`) and the draft → review →
confirmation flow remain. A future vendor needs a new function that verifies the user, enforces a
quota and bounds its input, behind a new approval gate.
