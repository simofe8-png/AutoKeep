# Universal maintenance discovery (owner instruction 2026-09-29)

> **Superseded in part by M-SOURCE (2026-09-30):** the one-dimensional host registry
> (`automation` / `reuse`) was replaced by the Israeli Maintenance Source Registry, which has
> source systems, six independent policy dimensions and standard failure codes. See
> `docs/maintenance/ISRAEL_SOURCE_REGISTRY.md`, `SOURCE_ADAPTER_SPEC.md`,
> `ISRAEL_COVERAGE_MATRIX.md` and `COVERAGE_GAPS.md`. The evidence levels, extraction and catalog
> described below are unchanged.

"MAINTENANCE IS NOW THE ONLY PRODUCT PRIORITY": AutoKeep must take an arbitrary supported
vehicle that nobody prepared in advance and automatically try to build its maintenance schedule.

**Status: the engine is implemented and proven on real official documents, but the blind PASS
criterion is NOT met.** 0 of 12 blind vehicles received a usable schedule automatically. The
cause is not the engine: 11 of 12 were stopped by the access policy the owner approved on
2026-09-27. Their official sources are either not yet approved as authorities, or their terms
prohibit or do not clearly permit automation. The 12th has no document on its manufacturer's
permitted site. No interval was fabricated to improve these numbers.

Evidence:

- `docs/release/evidence/maintenance-discovery/BLIND_MATRIX.md`: the blind matrix, committed
  before any research (`5b19311`).
- `BLIND_RESULTS.md` and `results.json`, in the same folder: per-vehicle results, metrics and
  failure classes (generated).
- `docs/sources/MAINTENANCE_SOURCE_RESEARCH_2026-09-29.md`: domains, robots.txt, terms and
  library structure for 16 manufacturers.

## 1. Pipeline (provider-independent, no per-model rules)

```text
vehicle identity (registry facts; plate/VIN never used)
 → reusable knowledge catalog (vehicle-class scope)             src/domain/catalog.ts
 → source discovery adapters                                    src/discovery/maintenance/sources.ts
     RegistryDiscovery: registry DATA entry points (listings, sitemaps, URL templates)
     UploadDiscovery: the user's own documents · WebSearchDiscovery / SecondaryDiscovery: ports
 → access policy (robots.txt AND terms; else no automation)     access.ts
 → acquisition (https, size limits, sha256, redirect re-check)  access.ts
 → document understanding (type, authority, model + variant, years, markets, units,
   regimes, severe schedule, edition)                           classify.ts
 → maintenance sections → atomic extraction → grounding         classify.ts, extract.ts
 → applicability + market → evidence level A–E                  src/engine/requirements.ts
 → per-task AND per-action resolution (precedence, conflicts)   src/engine/requirements.ts
 → due engine (km / months / whichever-first / first / repeats / anchor)
 → plan + UI labels / exact next action                         src/features/maintenance
```

- **Manufacturer knowledge is data.** `sourceRegistry.ts` holds hosts, role, market, approval
  status, automation/reuse policy, entry points and evidence. A new model needs nothing. A new
  manufacturer needs registry entries only.
- **Every failure is classified.** The classes are no source, blocked source, access restriction,
  identity/coverage insufficient, market / engine / regime ambiguity, parsing failure,
  conflicting evidence, unsupported manufacturer and provider not configured. Every stage leaves a
  trace (`VehicleRunTrace`).

## 2. Evidence levels (the correction to the binary model)

| Level | Meaning                                                                                                                                            | Drives the plan?                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A     | verified, applicable, and the source names the vehicle's market (IL)                                                                               | yes                                                                              |
| B     | verified official evidence for the exact vehicle; market not proven Israeli                                                                        | yes, labelled "על פי ספר היצרן לדגם זה" + "טרם אומתה התאמה ספציפית לשוק הישראלי" |
| C     | verified official evidence, but applicability has unresolved dimensions (engine, regime, usage, or source coverage such as model years not stated) | no; the plan asks for the missing fact or document                               |
| D     | secondary / supporting (press, forums, dealers, user reports)                                                                                      | never                                                                            |
| E     | unverified candidate (AI or ungrounded extraction)                                                                                                 | never                                                                            |

**Level rules:**

- **Market caps, it doesn't exclude.** Another market never excludes official evidence; it caps
  it at B.
- **Vehicle dimensions do exclude.** Engine, years, model and powertrain decide applicability.
- **Precedence is per atomic obligation:** task + action, e.g. spark-plug inspection and
  replacement are separate.
  - A beats B.
  - Within B, a source for other markets only ranks below a global one.
  - A foreign importer has no importer privilege.
  - Equal rank with different obligations is a conflict; it is shown, never averaged.
- **Model:** `EvidenceLevel`, `coverageUnknown`, `assessEvidence` and `anchor` in
  `src/domain/requirements.ts` and `src/engine/requirements.ts`.

## 3. Document understanding and extraction (deterministic; AI is not evidence)

- **Tables.** Distance headers are read with units in the cell ("1,000km"), "×1000" scales or
  unit context, plus a months row. Column kinds come from the header words:
  - **milestone** (15 30 45 …): marks are odometer points, so every/first come from their spacing;
  - **every** ("Every 5,000km / 3 Months"): the mark is the interval;
  - **initial** ("NEW 300km"): a one-time first point.
- **Reading rules:**
  - An "I" is read together with "R" (a replacement is also an inspection).
  - The same action in several "every" columns is ambiguous, so it is skipped.
  - Irregular milestone patterns are skipped.
  - "If necessary" work is not scheduled.
  - Leak checks are not fluid services.
- **Notes and footnotes.** Text cells and wrapped note lines attach to the nearest row. Clauses
  are read as sentences ("initial at 1,000km, second at 5,000km and then every 5,000km").
- **Merging.** Statements of one obligation from the same document merge ("every 30,000km" plus
  "every 2 years / 30,000km"). Different values stay separate.
- **Anchor.** An anchor is recorded only when the layout proves it, e.g. first at 1,000 km then
  multiples of 5,000 km versus first + k·interval. The due engine honours it.
- **Grounding.** Every value (row label, mark, printed column values) is found again on the cited
  page of the sha256-pinned edition. An ungrounded requirement is never verified.
- **Model identity.** "Jet 14 EVO" does not name "Jet 14"; "SX 250" does not name "SX 125". A
  displacement token is optional. Near misses are reported.
- **PDF text.** Local pdfjs (`tools/pdf-text.mjs`) produces positioned lines. HTML tables map
  columns to positions.

## 4. Reusable knowledge

- **Domain rules** (`src/domain/catalog.ts`):
  - Verified requirements only.
  - Keyed by a canonical vehicle-class scope, with no plate, VIN, user or account (checked).
  - A new edition from the same host supersedes the old one, which is kept.
  - A different obligation from another source is recorded as a conflict on both.
- **Pipeline:** the catalog is consulted before research, and a vehicle whose tasks resolve at
  A/B from the catalog triggers no network.
- **Local store:** SQLite migration v7 `knowledge_catalog` (no vehicle column) and
  `KnowledgeCatalogRepository`.
- **Cloud:** `supabase/migrations/20260930000002_maintenance_knowledge_catalog.sql` is
  **prepared, verified on local Docker only, not applied to staging** (approval gate). Its rules:
  - service-role writes only;
  - signed-in users can read;
  - anon has no access;
  - a constraint rejects personal keys in the scope.
- **Reuse policy:** requirements from hosts whose terms prohibit reuse are never admitted
  (`reuse` in the registry).

## 5. User experience

- **Level labels:** every plan item shows its level. A reads "לפי מקור רשמי לשוק הישראלי"; B reads
  "על פי ספר היצרן לדגם זה · טרם אומתה התאמה ספציפית לשוק הישראלי".
- **Search first:** when automatic retrieval is not allowed, the plan offers the **exact approved
  official page** for the make ("ספר הרכב הרשמי", a button that opens it) before asking for an
  upload. For example, Hyundai gets hyundaimotors.co.il/maintenance.
- **Proposed hosts** are never offered.
- **Per-action items** keep separate completion links, e.g. inspection versus replacement.
  Earlier completion ids for replacement/other obligations are unchanged.

## 6. Blind test

These are the production results (registry as approved). The full matrix is in
`BLIND_RESULTS.md`.

| #   | Vehicle                 | Result      | Why (failure class)                                                                                              | User input             |
| --- | ----------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------- |
| B1  | Mazda 3 2011 1.6        | no schedule | access restriction: mazda.co.il terms prohibit automation                                                        | official link + upload |
| B2  | Kia Sportage 2023 1.6   | no schedule | access restriction: kia-israel.co.il terms; ownersmanual.kia.com not approved (and terms restrict copying)       | official link + upload |
| B3  | Toyota C-HR 2019 Hybrid | no schedule | access restriction: toyota.co.il terms unreadable; toyota-europe.com not approved                                | official link + upload |
| B4  | Tesla Model 3 2022      | no schedule | access restriction: tesla.com not approved; bot-blocked, anti-scrape terms                                       | upload                 |
| B5  | Škoda Octavia 2018 1.4  | no schedule | access restriction: skoda-auto.com not approved; copyright notice prohibits duplication                          | upload                 |
| B6  | Hyundai i20 2016 1.4    | no schedule | access restriction: hyundaimotors.co.il terms prohibit automation                                                | official link + upload |
| B7  | Yamaha MT-07 2020       | no schedule | access restriction: Yamaha library not approved; terms prohibit copying                                          | upload                 |
| B8  | Honda PCX 125 2019      | no schedule | access restriction: MOTOPUB not approved; licence prohibits copying                                              | upload                 |
| B9  | SYM Jet 14 125 2021     | no schedule | no source: the permitted manufacturer site lists only the newer "Jet 14 EVO", and the engine refuses the variant | upload                 |
| B10 | MG ZS EV 2021           | no schedule | access restriction: MG hosts not approved (unknown/restrictive terms)                                            | upload                 |
| B11 | Suzuki Swift 2019       | no schedule | access restriction: suzuki.co.il terms ban robots                                                                | official link + upload |
| B12 | Peugeot 208 2021        | no schedule | access restriction: Stellantis hosts not approved; reproduction prohibited                                       | upload                 |

**Metrics** (B1–B12, production registry):

| Metric                         | Result                               |
| ------------------------------ | ------------------------------------ |
| Automatic source discovery     | 0/12                                 |
| Exact-vehicle applicability    | 0/12                                 |
| Usable plan                    | 0/12                                 |
| Israeli-market evidence        | 0/12                                 |
| Fallback to the user           | 12/12 (an official link for 5/12)    |
| Unresolved / conflicting tasks | n/a (no document reached extraction) |

With every proposed host approved as well, the results are the same, except that an official
link would be offered for 11/12: every one of those hosts is blocked by terms, not by approval.

**Failure classes:** access restriction 11/12; no source 1/12.

**Regression cases:**

- **SEAT Ibiza 2012 (R1):** seat.com is not approved and its terms restrict copying. The Run-2
  UK-manual candidate stays level E until reviewed.
- **Ford Fiesta 2015 (R2):** ford.co.il is not approved and its terms were not reviewed.
- **Hyundai IONIQ Hybrid 2021 (R3):** hyundaimotors.co.il terms prohibit automation; an official
  link is offered.

## 7. Capability probe (not blind, not in the metrics)

This probe ran on other models listed on the one permitted host (sym-global.com), to prove the
downstream stages on real documents:

- **JET X:** 15 atomic requirements, all deterministic, verified and grounded on p.30. They include:
  - engine oil: replace first at 300 km, then every 3,000 km, counted from zero;
  - spark plugs: replace every 12,000 km or 12 months;
  - transmission oil: replace every 5,000 km or 5 months after 300 km;
  - coolant: replace every 12,000 km or 1 year;
  - brake mechanism: inspect every 1,000 km or 1 month.
- **Joyride S:** 14 requirements (p.28), including a footnote merge: brake fluid every 30,000 km
  or 2 years.
- **Jet 14 EVO:** the model page has no manual.

All of them are **level C**, because the SYM manuals never state which model years they cover.
They are therefore not scheduled, which is correct. The owner would decide whether a
manufacturer's current model page counts as year coverage.

## 8. Tests

- **Engine:** evidence levels (A/B/C/D/E), a US-market document at B, an IL override per task,
  an engine mismatch excluded, per-action resolution.
- **Pipeline** (synthetic host):
  - access policy, including the case where no request is made to a prohibited host;
  - link-outs;
  - model and variant matching;
  - milestone and interval-column tables, initial columns, notes, footnote merge;
  - conditional work;
  - grounding;
  - anchor-aware due dates;
  - level B end-to-end and level A per-task override;
  - coverage-unknown → C;
  - catalog reuse without network;
  - failure classes.
- **Catalog:** verified-only admission, supersession, conflicts, personal-data-free scope, v7
  persistence.
- **UI:** the level-A and level-B labels on the Maintenance tab; official links (approved hosts
  only).
- **Live (opt-in):** `npm run test:live -- blindMatrix`.

## 9. Exact remaining blockers (owner decisions)

1. **Automation policy for official manuals (the dominant blocker, 11/12).** Your P1 decision
   (§8.4–8.5) forbids automated retrieval and storing intervals wherever terms restrict it, and
   nearly every manufacturer's terms do. Zero-cost options:
   - **(a)** request written permission from importers and manufacturers (an external action, yours);
   - **(b)** take a legal position that reading factual intervals from a manual for the user's own
     vehicle, without storing or sharing the document, is acceptable. This would enable per-vehicle
     private processing, not a shared catalog;
   - **(c)** keep "official link + user upload".
2. **Approve the proposed registry hosts.** There are 16 proposed hosts in `sourceRegistry.ts`,
   with evidence in the research doc. Approval gives authority, not automation.
3. **User-uploaded manuals.** Deterministic extraction can read an uploaded official manual now.
   Verification still needs either a hash match to a pinned official edition or a curator. Who
   curates?
4. **Model-year coverage.** Most manuals never state model years. Should an official listing that
   ties a document to a model (without years) count as coverage for current models only? This is
   currently level C.
5. **Runtime placement.** The pipeline runs in Node (it's what the edge function would run).
   Deploying it as a Supabase function, and the cloud catalog migration, are staging gates.
6. **A search provider** is still not approved (zero-cost decision). Without one, discovery
   covers only registry entry points.
