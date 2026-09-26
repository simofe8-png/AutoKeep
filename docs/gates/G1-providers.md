# Approval gate G1: external providers for source discovery and document intelligence

- **Raised at:** T081 (M10). This decision also covers M11 (OCR/AI extraction) and the real registration scan (M06).
- **Date:** 2026-09-26
- **Status:** ✅ decided 2026-09-26 (see Decision record below)

## Why this is a gate

MASTER_EXECUTION requires approval before choosing a provider with cost, privacy or lock-in consequences. AutoKeep cannot find official manuals or read documents without an external service, and no free option meets the requirements without a third party.

Everything provider-independent is already built and tested with labeled mocks:

- discovery port
- authority rules (official-domain registry, poisoning defenses)
- exact-applicability matching
- retrieval and versioning
- provenance
- no-source handling
- the identification pipeline (ADR-0009)

## Decision G1-a: source discovery (finding owner's manuals and maintenance schedules)

| Option                               | What it is                                                                                                                                        | Cost                                                                                                                                                                                                                                                                                               | Privacy / lock-in                                                                                                         | Fit                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **A. Claude API web search + fetch** | Claude searches, fetches candidate PDFs and reads them in one call. Authority still comes only from AutoKeep's verified official-domain registry. | Token cost (`claude-opus-5`: $5 input / $25 output per million tokens) plus Anthropic's per-search fee (see Anthropic pricing)                                                                                                                                                                     | Sends only make, model, year and engine (not personal data). Moderate lock-in, contained by the `DiscoveryProvider` port. | One provider for discovery and extraction  |
| B. Brave Search API                  | Web search results, then AutoKeep fetches the PDFs                                                                                                | $5 per 1,000 requests, $5 monthly credit, card required, attribution required ([pricing](https://api-dashboard.search.brave.com/documentation/pricing), free tier removed Feb 2026 ([report](https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/))) | Query text only. Low lock-in.                                                                                             | Still needs a separate extraction provider |
| C. Curated registry only             | AutoKeep maintains verified official manual URLs per manufacturer/importer; no search provider                                                    | Free (curation effort)                                                                                                                                                                                                                                                                             | No third party                                                                                                            | Limited coverage and ongoing maintenance   |

## Decision G1-b: OCR/AI extraction (M11: manuals → structured schedule, invoices → draft, registration → identity)

| Option                                                                                   | Hebrew                                                                                                                                       | Cost                                                                                                | Notes                                                                                                                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **A. Claude API** (vision, native PDF input up to 600 pages / 32 MB, structured outputs) | Yes                                                                                                                                          | Token-based: `claude-opus-5` at $5 / $25 per million tokens. A cheaper model only if you choose it. | Replaces OCR plus parsing in one step, with schema-validated output. Invoices and registration images go to Anthropic. |
| B. Azure AI Document Intelligence (Read)                                                 | Supported per [MS docs](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr?view=doc-intel-4.0.0) | Free F0 tier, then paid                                                                             | OCR only; still needs structuring logic or AI                                                                          |
| C. Google Cloud Vision                                                                   | Confirm on the [language list](https://docs.cloud.google.com/vision/docs/languages)                                                          | 1,000 pages/month free, then $1.50 per 1,000 ([pricing](https://cloud.google.com/vision/pricing))   | OCR only                                                                                                               |

On-device OCR (ML Kit) doesn't support Hebrew script, to my knowledge, and needs a native development build.

## Decision G1-c (optional): Israeli vehicle registry lookup (identification by plate)

data.gov.il (Ministry of Transport open data, CKAN `datastore_search` by `mispar_rechev`) is free and official, and would reduce OCR dependence. It sends the plate number to a government API. I'd ask for per-use consent in the app. ([example integration](https://github.com/RoyeeB/plate-lookup))

## Recommendation

1. **G1-a = A and G1-b = A (Claude API):** one provider, PDF-native, Hebrew-capable, schema-validated output.
   - Keep the provider-independent ports so it can be swapped later.
   - AI output stays a _proposal_: authority still comes only from the verified domain registry, and invoices remain drafts until the user confirms (invariants 3, 4 and 7).
   - Keys never go on the device: calls run from a Supabase Edge Function. Local development runs through `supabase functions serve`; production needs the hosted Supabase project (deferred gate T065).
   - Seed the official-domain registry with entries I verify during setup (with evidence), starting with the manufacturers in scope.
2. **G1-c = yes, with in-app consent.**

## What I need from you to proceed

- Approve or modify the choices above (or choose B/C).
- For Claude API:
  - An Anthropic API key for development, provided in a git-ignored `supabase/.env.local`. It's never committed and never in the app.
  - A monthly spend cap you're comfortable with.
  - Confirmation that the default model `claude-opus-5` is fine, or name a cheaper one.
- Nothing will be created or charged until you confirm.

## If not approved yet

AutoKeep stays fully usable. Manual vehicle entry, manual service recording and user-uploaded documents all work, and the maintenance schedule shows as "unavailable/pending" instead of inventing recommendations.

## Decision record (user, 2026-09-26)

1. The **data.gov.il** official vehicle registry is the primary Israeli vehicle-data source, behind a provider-independent interface.
2. Owner's-manual and official maintenance-source discovery stays behind a provider-independent interface. Only verified official manufacturer/importer sources may become trusted. AI or search results are never authoritative evidence.
3. OCR, document reading and AI stay behind provider-independent interfaces. **No runtime AI provider is chosen or purchased yet**; clearly labeled fixtures/mocks continue.
4. Development continues with Opus 5.5 High.
5. **No paid services, API keys or paid API calls.** When a real runtime provider becomes necessary to continue V1, stop at that gate and present options.

Consequence for the task plan: T081/M10 and M11 complete within this approved scope (interfaces, rules, orchestration, labeled mocks). A real discovery/extraction runtime provider is a later gate (expected before the V1 RC acceptance of verified-source behavior).
