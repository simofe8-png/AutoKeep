# ADR-0020: M-SOURCE V1 — maintenance schedule discovery engine

- **Status:** Superseded by ADR-0021 (2026-10-05; the web discovery was removed 2026-10-04 and
  only the owner-upload reading remains). Previously: Accepted for implementation (owner instruction 2026-10-02, "M-SOURCE V1"). Items
  marked _owner decision_ below are still open.
- **Date:** 2026-10-02

## Context

Without a real maintenance schedule AutoKeep does not deliver its core value. The earlier runs
(MK → M-SOURCE registry → M-ACCESS → M-TRIANG) built a strong evidence model but no runtime
discovery: M-TRIANG's 7/12 blind schedules came from offline research that was grounded and then
bundled. The two acceptance vehicles (Ford Fiesta 2015 1.25 SNJB, SEAT Ibiza 2012 1.4 CGG) still
had only unreviewed candidates.

The owner's M-SOURCE V1 instruction keeps the source-agnostic principle and redefines ALLOWED:
positive, documented evidence that the specific automated operation is permitted. No personal
written authorization is required, and no restriction may be bypassed.

## Decision

1. **A staged, source-agnostic runner** lives in `src/discovery/maintenance/msource/`. It is pure
   TypeScript over ports and runs unchanged on the phone, in the worker/tooling host and in
   tests. The stages are VEHICLE_VERIFIED → DISCOVERY → SOURCE_CANDIDATES → ACQUISITION →
   EXTRACTION → VEHICLE_MATCHING → CROSS_SOURCE_VALIDATION → SCHEDULE_RESOLUTION → PERSISTENCE →
   NEXT_SERVICE_CALCULATION. Each stage returns a structured result: status, counts, failure codes
   and notes. A failing source never stops the run, and no stage falls back to guessed data.
2. **The vehicle fingerprint** contains confirmed facts only (make, model and year aliases, cc and
   litre labels, normalized engine codes, fuel, transmission, market, manufacturing country). It
   never contains the plate, and of the VIN at most the masked WMI + VDS prefix (not passed in V1).
   The class key carries nothing that identifies one vehicle.
3. **Deterministic queries** are generated in English, Hebrew (for the IL market), the
   manufacturer's home language and the manufacturing country's language.
4. **The access engine** makes one decision per operation (DISCOVERY / FETCH / EXTRACTION /
   STORAGE → ALLOWED / BLOCKED / MANUAL_ONLY / UNKNOWN). Each decision records its reason,
   evidence, timestamp and policy version `msource-access/2` (owner correction 2026-10-02).
   - DISCOVERY is metadata only, and no request is made.
   - FETCH follows RFC 9309. robots.txt is one input to the decision and never an authorization
     by itself.
     - Recorded registry restrictions are applied first: NOT_ALLOWED becomes BLOCKED, and
       REQUIRES_PERMISSION becomes MANUAL_ONLY.
     - The robots group for `AutoKeepBot` applies, else the `*` group. A matching Disallow
       BLOCKS. A matching Allow, or no applicable rule or group, ALLOWS.
     - robots.txt 4xx (except 429) means unavailable: no robots rule applies.
     - robots.txt 5xx, 429 or a network failure means unreachable: the fetch is BLOCKED for this
       run and retried on the next run.
   - EXTRACTION needs a permitted fetch or a user-provided document, no registry restriction and
     no `noai` / `tdm-reservation` signal. It keeps structured facts plus excerpts of 30 words
     or fewer.
   - STORAGE of document bytes needs a recorded caching permission or the user's own document.
     Otherwise the bytes are discarded and the sha256 is kept.
   - Login pages, CAPTCHAs, paywalls and 401/403 are detected and never bypassed. An archived copy
     is looked up only for a source that is GONE (404/410), never for a blocked one.
   - Policy v1 (2026-10-02, morning) required an explicit robots permission. The owner replaced it
     the same day with the RFC 9309 semantics above (v2).
5. **SSRF-safe acquisition**: https only, no credentials, default port, and no
   private/loopback/link-local/CGNAT/multicast address in any notation, including IPv6 and
   IPv4-mapped forms.
   - DNS answers are re-checked on the worker host.
   - Redirects are followed manually, and each hop is re-validated and re-authorized. On React
     Native the reported final URL is checked, because the platform follows redirects
     internally.
   - Every request has a time limit, a byte cap and bounded retries, and only certain content
     types are accepted.
   - Requests to the same host are spaced out, and robots.txt is fetched once per host.
   - PDFs are parsed in a time-limited child process with a temporary directory (parser
     isolation).
6. **Fable / research assistant.** Fable is used through a validated `ResearchProvider` port. Its
   output is untrusted model output: it is validated field by field (zod), restricted sources are
   kept as metadata, and snippets are never evidence. Every candidate goes through access →
   acquisition → extraction → matching → resolution. In V1 the provider is a recorded Fable
   research run on the worker host. A live API transport is not wired: that is a paid provider and
   needs gate G3.
7. **Extraction** is deterministic. The existing table and line extractor is complemented by a
   column-aware, multilingual sentence extractor (EN/DE/ES/FR/HE) that recognizes the periodic
   service itself.
   - Regime qualifiers come from the subsection heading.
   - A sentence is skipped when it names competing regimes, several items, a first occurrence
     only, a display or reset, or conditional work.
   - Values are read only after the interval keyword, so a car's age is never read as an
     interval.
   - Every value is re-found on its page (grounding).
8. **Vehicle matching** reads applicability from the document's own text, never from discovery
   metadata. The result is EXACT / STRONG / SUPPORTED / PARTIAL / CONFLICTING / NOT_APPLICABLE /
   INSUFFICIENT.
   - Only a declared scope can exclude a vehicle: titles, headings and "for the <model> …"
     lines. Incidental mentions can only confirm one, and only when the document concerns at
     most two engines. A page listing the whole engine range is generic: engine unstated.
   - Row qualifiers apply on top: engine, fuel and regime.
   - A regime-specific row becomes a conditional item: the owner is asked for the code, and only
     codes the document itself maps are accepted.
9. **Resolution is based on support, never on a percentage.**
   - The most exact applicability tier wins, then the vehicle's market.
   - Copies of a manufacturer document count once.
   - "Official" provenance comes only from owner-approved registry systems.
   - Forum pages never count as support.
   - Different values within a tier are CONFLICTING and are never averaged.
   - Quality (owner correction 2026-10-02, replacing "one non-official source is never
     scheduled"):
     - An approved official source is graded by its applicability: EXACT stays EXACT, STRONG stays
       STRONG, and anything else is SUPPORTED.
     - Two or more agreeing independent sources are graded EXACT, STRONG or SUPPORTED by the best
       applicability among them.
     - ONE independent source is SUPPORTED when it applies STRONGLY or EXACTLY to the vehicle. It
       is never EXACT merely because it is the only source.
     - Generic, weak or partial evidence is INSUFFICIENT.
     - The engine's level T accepts one source at medium confidence.
   - The result maps onto the existing engine's levels (A / B / T). Due dates come from the
     existing deterministic engine and are whichever-comes-first with the "צפי" forecast.
10. **Hosts.** The phone runs the same runner with the guarded fetch, the HTML reader, the
    registry and the upload adapter. It has no PDF reader and no research assistant. PDF evidence
    reaches the phone through the class-level catalog, which the worker host produces as
    structured evidence and provenance only (`tools/build-msource-catalog.mjs`). The phone also
    caches its own structured results per vehicle class.
11. **Persistence** is local SQLite migration v10 (`msource_runs`, `msource_schedules`,
    `msource_evidence_cache`) and is not synced. A shared cloud catalog is deferred: its
    migration needs a staging approval, and the bundled catalog covers V1.
12. **Auto-start**: discovery starts when a vehicle is added (identity confirmed), and resumes
    once for existing vehicles that never ran. An uploaded maintenance document re-runs the same
    pipeline. Retry is offered whenever the schedule is not complete.

## Consequences

### Amendment (owner correction 2026-10-03): item-level applicability, identity, partial schedules

- **Item-level scope.** Each item carries its own scope: EXACT_ENGINE / ENGINE_FAMILY /
  ALL_ENGINES / MODEL_YEAR_RANGE / MODEL_GENERIC. MODEL_VARIANT and GENERATION are defined but not
  derived in V1. The scope comes from the source's structure and wording:
  - the item's own engine code or displacement row;
  - the document's engine code or declared engine;
  - an explicit all-engines statement, which is quoted in the basis;
  - an official owner's manual for the model year whose item is not engine-qualified;
  - otherwise the model years, or the model only.
- **Sufficiency per operation.** Brake fluid, cabin filter and general / brake / battery
  inspections accept any scope with model years. Every other operation is powertrain-dependent:
  it needs an engine-level scope or ALL_ENGINES. An engine list alone is not proof.
- **Section years.** The item's own section can set its years and override the document's years
  (for example "the following servicing schedule is from a 2019 … manual").
- **Trusted metadata.** For official sources only, the manufacturer's model-year designation in
  its official URL or filename ("my12") counts as the document's model year. It is never applied
  to third-party filenames.
- **Identity is separate from access.** A document is official when its host is a registry
  system (not rejected), or when its host is the manufacturer's own brand domain and the document
  is a manufacturer document type. Look-alike and community hosts are not. Access rules are
  unchanged.
- **Conditional and partial schedules.**
  - Regime-specific official items are CONDITIONALLY_APPLICABLE until the owner answers the code
    question; the plan engine then applies them without a new search.
  - Schedule status is READY / READY_PARTIAL / CONDITIONAL / CONFLICTING_EVIDENCE /
    INSUFFICIENT_EVIDENCE / NO_SOURCE_FOUND. Items resolve independently.

- No interval reaches a schedule without a fetched or uploaded document, a grounded location and
  a vehicle match. "No evidence" is a normal, visible outcome.
- On the phone, PDFs uploaded by the user are acquired and checked, but their extraction reports
  `EXTRACTOR_UNAVAILABLE` until an on-device PDF text reader exists (for example pdf.js in a
  WebView). Image uploads are refused as an unsupported format (no OCR provider, gate G1).
- The class catalog is bundled, so new worker results ship with an app update until a shared
  cloud catalog is approved.

### Amendment (owner instruction 2026-10-03): generalization

The Ford Fiesta and SEAT Ibiza are regression vehicles only. They must not shape production
logic.

**Removed from production:**

- **Regime codes:** codes were hard-wired to one manufacturer's `QG\d` PR codes. A service-plan
  code is now any 1–3 capitals + 1–2 digits named in a "code(s)" context. The document's own
  sentences map codes to regimes, whatever the format.
- **Booklet hint:** it branched on `make === 'seat'` / `'ford'`. The hint is now data-driven: the
  code sticker when any applicable source depends on a service-plan code, otherwise generic.
- **Regime question:** its options were fixed to `QG0/QG1/QG2`. They are now the codes the
  applicable sources name, plus "unknown".
- **Two-car research claims:** the claims for exactly two vehicles (`knownSources.ts`) were
  removed from the production requirement path. They remain test fixtures.

A test now fails if production M-SOURCE code mentions the regression vehicles, their engine
codes or `QG` codes.

**Generic by construction:**

- **Fingerprint:** make, model, year, generation, body variant (from registry body words in
  Hebrew or English, never from the model name), cc and litre labels, engine codes, fuel,
  transmission, market, and the manufacturing country.
- **Queries:** levels L1 → L5 are generated from the fingerprint's attributes. A level whose
  attribute is unknown is skipped. Each level is produced in English, Hebrew, and the
  manufacturer's and manufacturing country's languages.
- **Discovery:** adapters (research assistant, search, registry, catalog, uploads, archive, and
  learned source families) are added without core changes.
- **Engine vocabulary:** engine-designation words for all manufacturers are kept as one data
  table.
- **Body variant:** a variant token in an official document's naming is compared with the
  vehicle's registry body.
- **Source knowledge** (`sourceKnowledge.ts`): domain identity, last access outcome, document
  types, extraction methods, tokenized URL patterns ({model}, {Model}, {yyyy}, {yy}) and
  applicability metadata patterns are learned from sources that yielded usable evidence, and are
  reused for other vehicles. Brand-domain patterns are reused only for the same make. Intervals
  are never stored.
