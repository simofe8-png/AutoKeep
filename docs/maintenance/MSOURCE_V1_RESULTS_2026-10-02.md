# M-SOURCE V1 — implementation and validation (2026-10-02)

Owner instruction: "M-SOURCE V1 Implementation". Design: ADR-0020. Code:
`src/discovery/maintenance/msource/` (engine), `src/features/maintenance/msource/` (app
service, device host, class catalog), `src/persistence/repositories/msource.ts` (SQLite v10).

## Baseline found

- **Starting point:** `bec73cd` on `master`. The working tree held uncommitted vehicle-search
  work from the previous session; it was left intact.
- **Prior maintenance work:**
  - MK engine (evidence levels A–E);
  - M-SOURCE registry (59 systems, 6-dimension policies);
  - M-ACCESS (no new ALLOWED);
  - M-TRIANG (offline-researched, grounded, bundled catalog; 7/12 blind vehicles).
- **What was missing:** a runtime discovery run, per-operation access decisions, SSRF-safe
  acquisition, a vehicle fingerprint, a vehicle matcher, a resolver, run persistence and
  auto-start.
- **Acceptance vehicles:** only unreviewed candidates (`knownSources.ts`).

## What runs

The runner has explicit stages, each with a structured result:
`VEHICLE_VERIFIED → DISCOVERY → SOURCE_CANDIDATES → ACQUISITION → EXTRACTION → VEHICLE_MATCHING
→ CROSS_SOURCE_VALIDATION → SCHEDULE_RESOLUTION → PERSISTENCE → NEXT_SERVICE_CALCULATION`.

| Component      | File                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------ |
| Fingerprint    | `fingerprint.ts`                                                                           |
| Queries        | `queries.ts`: EN, HE and the manufacturer / manufacturing-country language                 |
| Access engine  | `accessEngine.ts`, `robots.ts` (RFC 9309, group-aware)                                     |
| SSRF guard     | `netGuard.ts`                                                                              |
| Adapters       | `adapters.ts`: Fable research, search port, registry, known/catalog, upload, archive (404) |
| Extraction     | the existing table extractor + `sentences.ts` (columns, EN/DE/ES/FR/HE, periodic service)  |
| Matching       | `matcher.ts`                                                                               |
| Resolution     | `resolver.ts`                                                                              |
| Requirements   | `requirements.ts` → the existing engine and the existing next-service computation          |
| Status         | `status.ts`                                                                                |
| Structured log | `log.ts`                                                                                   |
| Worker host    | `node/host.ts` (DNS-checked fetch, isolated pdfjs)                                         |

## Validation vehicles (live, real network, 2026-10-02)

**Discovery:** the recorded Fable research runs (`docs/maintenance/data/msource/fable/`; candidate
URLs only, WebSearch only, no fetching) plus the official registry adapter.

**Access:** every fetch was decided by the access engine. The live test asserts that no
candidate document was requested without an ALLOWED FETCH decision for its URL.

**Full traces:** `docs/maintenance/data/msource/{fiesta,ibiza}-run.json`.

**Diagnosis iterations:** 4 live runs, each followed by a correction:

- extractor coverage (two-column PDFs, periodic service, DE/ES/FR);
- robots in-flight de-duplication and host politeness;
- two wrong readings found and removed (a car's age read as an interval; one item's interval
  attached to another item);
- over-strict exclusion heuristics (declared scope, single-year captures);
- a missing regime-map argument.

### A. Ford Fiesta 2015, 1242 cc, SNJB, manual

- **Class key:** `car|ford|fiesta|2015|1242|SNJB|petrol|manual`.
- **Candidates:** 22 from Fable, 0 from the registry. The Delek Ford system is
  REQUIRES_PERMISSION, so it is never fetched.

| Outcome                                                         | Sources |
| --------------------------------------------------------------- | ------- |
| Fetch not permitted: robots.txt missing or unreadable (UNKNOWN) | 8       |
| Login / 403                                                     | 1       |
| HTTP errors                                                     | 4       |
| No schedule section                                             | 12      |
| Section without readable intervals                              | 2       |
| Evidence-bearing sources                                        | 4       |

The 4 evidence-bearing sources:

| Source                               | Match                                  | What it states                                                                                                                                     |
| ------------------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| whocanfixmycar.com (UK owners guide) | STRONG                                 | Service every 10,000 miles or 12 months; cabin filter 20,000 mi; air filter 30,000 mi; spark plugs 100,000 mi; accessory belt 100,000 / 150,000 mi |
| carwiki.de                           | SUPPORTED                              | Brake fluid and pollen filter every 2 years (30,000 km)                                                                                            |
| repareo.de (timing belt)             | PARTIAL: years not stated              | —                                                                                                                                                  |
| moneysavingexpert forum              | PARTIAL; forums never count as support | —                                                                                                                                                  |

- **Resolution: INSUFFICIENT_EVIDENCE.** Each obligation rests on one non-official publisher.
  The cabin-filter values differ: 20,000 mi vs 30,000 km / 24 months.
- **Unresolved conflicts:** cabin filter (as above). Nothing is scheduled.
- **The Israeli 15,000 km figure:** the Israeli source Fable surfaced (queenoftheroad.co.il) had
  no readable schedule section. The importer's own plan is login-gated or requires permission.

### B. SEAT Ibiza 2012, 1390 cc, CGG

- **Engine identity:** the Ministry registry value `CGG`, as recorded in the project. CGGA / CGGB
  are treated as the same engine family, never as an exact match.
- **Class key:** `car|seat|ibiza|2012|1390|CGG|petrol|`.
- **Candidates:** 26 from Fable, 0 from the registry. Champion Motors is REQUIRES_PERMISSION.

Sources and what they yielded:

- **Official SEAT owner's manuals (seat.co.uk / seat.com, UK English; robots-permitted):** the
  fixed-service statement was extracted from the MY12 edition (p.198, right column): "your
  vehicle must be serviced after a fixed interval of 1 year / 15 000 km (whatever comes first)".
  - Its regime is read from the "Fixed service intervals" heading. The same manual maps that
    regime to PR codes QG0 / QG2, and QG1 to LongLife.
  - Match: PARTIAL. The manual's text does not state which model years it covers, and the car's
    PR code is unknown.
  - SEAT's global site is not an owner-approved registry system, so it cannot count as official.
- **MY14 edition:** NOT_APPLICABLE. Its text gives 2013.
- **MY15 edition:** PARTIAL. It gives no model years and no regime mapping.
- **whocanfixmycar.com (UK):** "interim service every 10,000 miles or 12 months" (STRONG match). It
  is a single non-official publisher.

**Resolution: INSUFFICIENT_EVIDENCE.** No item reached SUPPORTED. The official fixed interval
would become a conditional item, triggering the regime question, once its model-year coverage and
host authority are established and it is corroborated.

## Tests and verification

- `src/discovery/maintenance/msource/__tests__` has 84 tests:
  - fingerprint and queries;
  - security (SSRF in every IP notation, DNS rebinding, redirect hops, the final-URL check, size
    and type limits, robots, per-operation access, log redaction);
  - units, column sentences, and the live regressions;
  - pipeline integration: HTML, a real PDF through the isolated reader, agreeing and conflicting
    sources, an engine mismatch, blocked sources, login walls, archive on 404, duplicates,
    malformed or unsupported files, no source, a Fable candidate through full validation, Fable
    unavailable, an upload in the same pipeline, and cache reuse.
- `src/features/maintenance/msource/__tests__/service.test.ts` has 6 tests on the real SQLite store:
  - start → progress → READY persisted, and the plan schedules a level-T item;
  - no cross-vehicle leakage;
  - cache reuse;
  - NO_SOURCE_FOUND with retry and upload;
  - an upload corroborating a web source;
  - the phone path reusing the worker catalog offline.
- Live: `npm run test:live -- msource` (2/2), opt-in.

## Limitations (V1)

- **PDFs on the phone:** no PDF text reader on the device. Uploaded PDFs are acquired and checked,
  then extraction reports `EXTRACTOR_UNAVAILABLE`. PDF evidence reaches the phone only through
  the worker catalog. Images are not read (no OCR provider, gate G1).
- **Discovery:** the research assistant and web search are not wired at runtime. Fable runs on the
  worker host as recorded research, and a live provider is gate G3 (paid). On the phone,
  discovery uses the registry, the class catalog and uploads.
- **Access standard (owner decision):** FETCH counts robots.txt permission as positive evidence.
  Many publisher sites return 403/429 to unknown bots or have no readable robots.txt, which leaves
  them UNKNOWN.
- **Catalog:** bundled with the app. A shared cloud catalog needs a staging migration (approval
  gate).
- **Home screen:** the duplicate shortcut tiles noted by the owner are recorded for later and not
  changed.

## Correction run (owner instruction, 2026-10-02, evening)

**Changes:**

- **FETCH:** RFC 9309 semantics (access policy `msource-access/2`).
- **Evidence threshold:** one strongly applicable independent source may be SUPPORTED, never
  EXACT.
- **A matcher over-claim found by this run and fixed:** generic owner guides that list every
  engine of a 2008–2017 range (957–1800 cc) were rated STRONG, because the vehicle's displacement
  appeared somewhere in that list. Such pages now count as engine-unstated (SUPPORTED match).
  Under the corrected threshold, a single source with that match is INSUFFICIENT.
- **Live document budget:** raised to 60 documents per vehicle.

Live traces: `fiesta-run.json`, `ibiza-run.json` (overwritten).

### Fiesta: CONFLICTING_EVIDENCE, nothing scheduled

| Operation                   | km                   | Months | Status       | Source                                                             | Applicability                            |
| --------------------------- | -------------------- | ------ | ------------ | ------------------------------------------------------------------ | ---------------------------------------- |
| Engine oil + filter         | 16,093 (10,000 mi)   | 12     | INSUFFICIENT | whocanfixmycar.com/advice/ford-fiesta-owners-guide, p4             | SUPPORTED: Fiesta 2008–2017, all engines |
| Air filter                  | 48,280 (30,000 mi)   | —      | INSUFFICIENT | same                                                               | same                                     |
| Spark plugs                 | 160,934 (100,000 mi) | —      | INSUFFICIENT | same                                                               | same                                     |
| Accessory belt (inspection) | 160,934              | —      | INSUFFICIENT | same                                                               | same                                     |
| Accessory belt (replace)    | 241,402              | —      | INSUFFICIENT | same                                                               | same                                     |
| Brake fluid                 | 30,000               | 24     | INSUFFICIENT | carwiki.de/ford-fiesta-inspektion, p6                              | SUPPORTED                                |
| Cabin / pollen filter       | —                    | —      | CONFLICTING  | whocanfixmycar (20,000 mi = 32,187 km) vs carwiki (30,000 km / 24) | SUPPORTED, both                          |

### Ibiza (CGG): INSUFFICIENT_EVIDENCE, nothing scheduled

| Operation                       | km                 | Months | Status               | Source                                                | Applicability                                                                     |
| ------------------------------- | ------------------ | ------ | -------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| Periodic (interim) service      | 16,093 (10,000 mi) | 12     | INSUFFICIENT         | whocanfixmycar.com/advice/seat-ibiza-owners-guide, p4 | SUPPORTED: Ibiza 2008–2017, all engines; sentence says "for cars aged 3–15 years" |
| Periodic service (fixed regime) | 15,000             | 12     | not usable (PARTIAL) | seat.co.uk MY12 IbizaSC_EN.pdf, p198                  | Model years not stated in the manual; regime QG0/QG2 unknown                      |
| Periodic service (fixed)        | 15,000             | 12     | NOT_APPLICABLE       | seat.com MY14 manual                                  | The text gives 2013                                                               |
| Periodic service (fixed)        | 15,000             | 12     | not usable (PARTIAL) | seat.co.uk MY15 manual                                | No model years; no regime mapping in the text                                     |

### SEAT QG check

- **Where the code is:** the MY12 manual (p.170, p.198 and p.249) says the PR code is printed on
  the vehicle data sticker (spare-wheel well) and on the back cover of the Maintenance Programme
  booklet.
- **Not in project data:** the Ministry record (`vehicleRecord.ts` fields) has no PR or service-plan
  field. The VIN (`VSSZZZ6JZCR…`) encodes the manufacturer, model, year, plant and serial, not
  equipment codes. No other project data holds it.
- **Conclusion:** QG0/QG2 cannot be established from existing data. It is not assumed.
- **What would establish it:** the owner reading the sticker, through the existing
  QG0 / QG1 / QG2 question.
- **Even with QG0/QG2 established,** the MY12 manual row stays PARTIAL, because the manual's text
  never states which model years it covers.

## Applicability and provenance correction (owner instruction, 2026-10-03)

Changes are in ADR-0020 (Amendment). Live traces are overwritten.

### Ford Fiesta 2015 1.25 SNJB — READY_PARTIAL

The Fiesta is READY_PARTIAL: 2 items are SUPPORTED, and nothing is conflicting.

| Operation                        | km                   | Months       | Source                                       | Document applicability                | Item applicability                                                                    | Status                       | Conflict                 |
| -------------------------------- | -------------------- | ------------ | -------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------- | ------------------------ |
| Brake fluid                      | 30,000               | 24           | carwiki.de/ford-fiesta-inspektion p6         | non-official; Fiesta 2008–2017 (text) | ALL_ENGINES — page heading "Serviceplan: Alle Modelle & Motoren"                      | **SUPPORTED**                | —                        |
| Pollen / cabin filter            | 30,000               | 24           | same                                         | same                                  | same                                                                                  | **SUPPORTED**                | none any more (see note) |
| Engine oil + filter              | 16,093 (10,000 mi)   | 12           | whocanfixmycar.com Fiesta guide p4           | non-official; 2008–2017               | section: "The following servicing schedule is from a 2019 Ford Fiesta owner's manual" | NOT_APPLICABLE (2019 ≠ 2015) | —                        |
| Cabin filter                     | 32,187 (20,000 mi)   | —            | same                                         | same                                  | same                                                                                  | NOT_APPLICABLE               | —                        |
| Air filter                       | 48,280 (30,000 mi)   | —            | same                                         | same                                  | same                                                                                  | NOT_APPLICABLE               | —                        |
| Spark plugs                      | 160,934 (100,000 mi) | —            | same                                         | same                                  | same                                                                                  | NOT_APPLICABLE               | —                        |
| Accessory belt (inspection)      | 160,934 (100,000 mi) | —            | same                                         | same                                  | same                                                                                  | NOT_APPLICABLE               | —                        |
| Accessory belt (replacement)     | 241,402 (150,000 mi) | —            | same                                         | same                                  | same                                                                                  | NOT_APPLICABLE               | —                        |
| Timing belt                      | 241,402 (150,000 mi) | —            | same                                         | same                                  | 2019, and the row says 1.0 L & 1.6 L engines                                          | NOT_APPLICABLE               | —                        |
| Timing belt                      | 150,000              | 120          | repareo.de/zahnriemenwechsel-ford-fiesta p21 | non-official; model years not stated  | EXACT_ENGINE (the document names the engine code)                                     | PARTIAL: model years unknown | —                        |
| Periodic / cabin / brake (forum) | 19,312 / 12,875 / —  | 12 / — / 120 | moneysavingexpert forum p3                   | no model years                        | MODEL_GENERIC                                                                         | PARTIAL; forums never count  | —                        |

**Cabin-filter conflict:** it was resolved by evidence, not overridden. The competing value
(20,000 mi) belongs to the 2019 schedule section, which does not apply to a 2015 car. One source
remains.

**Not established:** the engine-oil / periodic service interval and every
powertrain-dependent item.

### SEAT Ibiza 2012 1.4 CGG — CONDITIONAL

The Ibiza is CONDITIONAL: one official item is CONDITIONALLY_APPLICABLE.

| Operation                       | km                 | Months | Source                                                   | Document applicability                                                                                | Item applicability                                                                    | Status                               | Condition                                    |
| ------------------------------- | ------------------ | ------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| Periodic service (fixed regime) | 15,000             | 12     | seat.co.uk …/ibiza_sc/my12_w45/en-uk/IbizaSC_EN.pdf p198 | **OFFICIAL** (brand domain seat.co.uk, owner's manual); **MY12 = 2012 from official metadata "my12"** | ALL_ENGINES (manufacturer's own manual for the model year; item not engine-qualified) | **STRONG, CONDITIONALLY_APPLICABLE** | **QG0 or QG2**, as mapped by the same manual |
| Periodic service (fixed)        | 15,000             | 12     | seat.com …/my14_w45/… p212                               | OFFICIAL; 2014 (metadata)                                                                             | —                                                                                     | NOT_APPLICABLE (2014 ≠ 2012)         | —                                            |
| Periodic service (fixed)        | 15,000             | 12     | seat.co.uk …/my15_w22/… p190                             | OFFICIAL; 2015 (metadata)                                                                             | —                                                                                     | NOT_APPLICABLE                       | —                                            |
| Interim service                 | 16,093 (10,000 mi) | 12     | whocanfixmycar.com Ibiza guide p4                        | non-official; 2008–2017                                                                               | MODEL_YEAR_RANGE, insufficient for a powertrain-dependent operation                   | PARTIAL (not used)                   | —                                            |

**QG0 / QG2 handling:**

- The code is not assumed. The item is stored as a requirement limited to service regime
  QG0/QG2.
- The plan therefore shows no periodic-service item and asks the existing service-plan code
  question (QG0 / QG1 / QG2).
- If the owner answers QG0 or QG2, the next plan computation (on the device, without a search)
  schedules 15,000 km / 12 months, whichever comes first, at evidence level B: the manufacturer's
  manual, with an Israeli-market match not proven. It is shown with that label.
- If the owner answers QG1 (LongLife), the item does not apply.

**Caveat:** the MY12 file is the Ibiza **SC** (3-door) edition. The body variant is not modelled
in V1 (MODEL_VARIANT is not derived).
