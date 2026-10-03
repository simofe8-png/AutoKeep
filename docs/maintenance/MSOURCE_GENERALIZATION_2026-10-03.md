# M-SOURCE generalization: cross-manufacturer validation (2026-10-03)

Owner instruction: "GENERALIZE M-SOURCE". The Ford Fiesta and SEAT Ibiza are regression vehicles
only. Design: ADR-0020, Amendment "generalization". Live traces:
`docs/maintenance/data/msource/matrix/` (`matrix-summary.json`, `<id>-run.json`,
`source-knowledge.json`).

## Method

- **16 vehicles, 13 manufacturers:** Ford, SEAT, VW, Skoda, Toyota, Hyundai, Kia, Renault, Dacia,
  Peugeot, Citroën, Mazda, Honda, Nissan, BMW. The set covers petrol naturally aspirated, petrol
  turbo and diesel engines, model years 2012–2018, and numeric and alphanumeric model names.
- **Registry-like facts only:** an unknown engine code, transmission or body stays unknown.
- **One pipeline for every vehicle:**
  1. discovery: research-assistant candidates (Fable; WebSearch only, using queries generated
     from the fingerprint), the official registry, and source families learned from the
     vehicles processed earlier;
  2. access decisions (RFC 9309);
  3. SSRF-safe acquisition;
  4. extraction;
  5. item-level matching;
  6. resolution.
- **No per-vehicle code path.**

## Generic defects the matrix found, and their generic fixes

| Found on                 | Defect                                                                                                                                                                          | Fix (generic)                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Renault 1461 cc          | Queries said "1.45"                                                                                                                                                             | The 0.1-step litre label is primary; the 0.05-step label is only a variant             |
| carexpert.com.au         | A comparison-table row ("12 months 6 months 12 months") was read as an interval                                                                                                 | Statements with several competing values are skipped                                   |
| auto-abc.eu              | "Based on practical experience…" was used as a schedule                                                                                                                         | Advisory statements are skipped                                                        |
| whocanfixmycar.com       | Pages listing many generations got one generation's years                                                                                                                       | Several disjoint ranges mean no document-level year; sections and titles decide        |
| Ford blog                | A Mk4 (1995–2002) paragraph was applied to a 2015 car                                                                                                                           | The nearest heading with a year range sets the section's years                         |
| One-sentence blog answer | A single incidental sentence counted as a source                                                                                                                                | A lone non-official source must present a schedule (≥ 2 operations)                    |
| SEAT 5-door MY12 manual  | Not recognized as official: its front pages lack the words "owner's manual"                                                                                                     | On a brand domain, an official manual path also establishes a manufacturer document    |
| Consecutive generations  | Generations sharing a boundary year counted as overlapping                                                                                                                      | A shared boundary year still means distinct generations                                |
| auto-abc.eu titles       | A single title year overrode the page's own range                                                                                                                               | A single title year selects the page range that contains it                            |
| **Learned patterns**     | A pattern with an opaque id (`v20433`) was filled for other makes. The site **echoed the requested make into another vehicle's data**, producing false Nissan and Citroën items | A pattern generalizes only when nothing but tokens varies; opaque ids are never reused |
| carwiki.de               | "Serviceplan: Alle Modelle & Motoren" was ignored for model years                                                                                                               | An explicit all-models statement in the source's own heading gives every model year    |

## Results by manufacturer (final run)

| Id  | Vehicle                        | Status        | Established items (operation, km / months, status, scope, source)                                                                                                            |
| --- | ------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 | Ford Fiesta 2015 1.25 SNJB     | READY_PARTIAL | Brake fluid 30,000 / 24 SUPPORTED; pollen filter 30,000 / 24 SUPPORTED (ALL_ENGINES; carwiki.de "Alle Modelle & Motoren")                                                    |
| S01 | SEAT Ibiza 2012 1.4 CGG 5-door | CONDITIONAL   | Periodic service 15,000 / 12, STRONG, **CONDITIONALLY_APPLICABLE: QG0 or QG2** (official seat.co.uk MY12 Ibiza manual p.199)                                                 |
| M01 | Ford Focus 2016 1.0 EcoBoost   | INSUFFICIENT  | —                                                                                                                                                                            |
| M02 | VW Golf 2015 1.6 TDI           | INSUFFICIENT  | —                                                                                                                                                                            |
| M03 | Skoda Octavia 2018 1.4 TSI     | INSUFFICIENT  | (a timing belt of 60,000 from one source; insufficient)                                                                                                                      |
| M04 | Toyota Corolla 2017 1.6        | READY_PARTIAL | Air filter 30,000; coolant 100,000 / 60; fuel filter 80,000; spark plugs 40,000. All SUPPORTED, ENGINE_FAMILY (auto-abc.eu, "Corolla 1.6 petrol 2016–2018")                  |
| M05 | Hyundai i30 2014 1.6           | READY_PARTIAL | Air filter 45,000; coolant 120,000 / 96; fuel filter 60,000. SUPPORTED. **Spark plugs CONFLICTING (60,000 vs 75,000)**                                                       |
| M06 | Kia Picanto 2018 1.0           | INSUFFICIENT  | —                                                                                                                                                                            |
| M07 | Renault Megane 2016 1.5 dCi    | READY_PARTIAL | Air filter 10,000; coolant 90,000 / 60; timing belt 60,000. SUPPORTED (auto-abc.eu "Megane 1.5 diesel")                                                                      |
| M08 | Dacia Duster 2017 1.6          | READY_PARTIAL | Air filter 15,000; cabin filter 15,000; coolant 90,000 / 60; fuel filter 100,000; manual gearbox oil 45,000; spark plugs 30,000; timing belt 60,000. SUPPORTED (auto-abc.eu) |
| M09 | Peugeot 208 2016 1.2 PureTech  | READY_PARTIAL | Brake fluid — / 24 (whocanfixmycar, model-wide); coolant 120,000 / 60; spark plugs 40,000; timing belt 180,000. SUPPORTED (auto-abc.eu)                                      |
| M10 | Citroën C3 2017 1.2 PureTech   | INSUFFICIENT  | (a timing belt of 180,000 from one incidental source)                                                                                                                        |
| M11 | Mazda 3 2015 2.0               | INSUFFICIENT  | —                                                                                                                                                                            |
| M12 | Honda Civic 2017 1.5T          | INSUFFICIENT  | —                                                                                                                                                                            |
| M13 | Nissan Qashqai 2016 1.2 DIG-T  | INSUFFICIENT  | — (the reflected items were removed)                                                                                                                                         |
| M14 | BMW 318i 2017                  | INSUFFICIENT  | —                                                                                                                                                                            |

**Totals:** 449 candidates, 293 documents acquired, 304 evidence records, 48 usable.

**No core service / oil interval is established for any vehicle.** The Ibiza's is conditional on
its service-plan code. Every non-official item rests on **one publisher**, and none is
corroborated by a second source.

## Where coverage is lost

**Candidate outcomes:**

| Outcome                                  | Candidates |
| ---------------------------------------- | ---------- |
| No schedule section in the page          | 162        |
| Login / 403 / bot wall                   | 61         |
| Section present but no interval readable | 58         |
| Not applicable to the vehicle            | 53         |
| HTTP errors                              | 25         |
| robots.txt unreachable (retry later)     | 22         |
| Gone (404)                               | 17         |

**Extracted evidence not usable:**

| Reason                                                               | Records |
| -------------------------------------------------------------------- | ------- |
| The document does not state its model years                          | 157     |
| The document is for other engines                                    | 55      |
| The document covers other model years                                | 32      |
| The item's scope is too generic for a powertrain-dependent operation | 8       |

**Official sources acquired:** documents from manufacturer domains were acquired for 9 of the 16
vehicles. Their schedules are mostly in separate maintenance booklets that are not published, or
in tables the extractor cannot yet read.

## Re-run after removing engine-code prefix matching (2026-10-03, later the same day)

The owner decided that engine codes match only when identical or listed in `explicitAliases`
(empty), never by prefix. The 16-vehicle matrix was re-run on the same pipeline and research
inputs.

**Attribution check (deterministic, on the committed baseline traces):** no baseline evidence record
had an engine-code verdict of `family`. In this matrix only F01 (SNJB) and S01 (CGG) carry an engine
code, and neither relied on a prefix match. The rule change therefore cannot move any baseline
result. **No vehicle transitioned to `VERIFIED_IDENTITY_ONLY` because of it.**

**Live result:** the resolved items are identical for all 16 vehicles (same operations, values and
statuses). Totals:

|                  | Baseline | Re-run |
| ---------------- | -------- | ------ |
| Candidates       | 449      | 463    |
| Acquired         | 293      | 311    |
| Evidence records | 304      | 266    |
| Usable           | 48       | 48     |

The differences in candidates, acquisitions and evidence come from the network and the sources, not
the matcher:

- M08 had 4 network failures.
- M13 and M12 retrieved fewer pages.
- Several HTTP errors became `SOURCE_GONE`.
- M06 reached 6 previously unreachable hosts, which were then judged not applicable.

**`VERIFIED_IDENTITY_ONLY` (presentation) in the app.** On a registry-identified vehicle, the
vehicles whose run ends `INSUFFICIENT_EVIDENCE` would show this state:

- M01 Focus, M02 Golf, M03 Octavia, M06 Picanto, M10 C3, M11 Mazda 3, M12 Civic, M13 Qashqai,
  M14 BMW 318i: 9 of 16.
- That was already true before the rule change.
- F01 and M04–M09 show partial schedules. S01 shows its conditional (QG0 / QG2) schedule.
