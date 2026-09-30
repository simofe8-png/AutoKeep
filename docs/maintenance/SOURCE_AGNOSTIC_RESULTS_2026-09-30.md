# Source-agnostic maintenance discovery — blind B1–B12 results (2026-09-30)

Owner instruction 2026-09-30: stop optimizing official-source access; search broadly (official and
non-official), triangulate, resolve applicability and conflicts, produce COMPLETE / PARTIAL
schedules, else the dealer / upload fallback. Source authority and requirement confidence are separate.

## Pipeline

1. **Research** (`data/triangulation/B*.json`): per vehicle, every interval with verbatim quotes, URL,
   publisher, source kind, the document it derives from, and the applicability the source states.
2. **Grounding** (`tools/ground-triangulation.mjs` → `grounding.json`): each cited page re-fetched
   (robots.txt respected, no login); a quote counts only if it is found on the page AND every
   interval value it is cited for is on the page. 332 / 542 cited quotes grounded; the rest
   (quote not found, value not on page, HTTP 403, robots-disallowed) are not counted.
3. **Conversion** (`tools/build-triangulated-catalog.mjs`, `vehicles.json`): identical claims merged;
   claims for other model years, engines or generations excluded (`conversion.json` lists each).
4. **Triangulation** (`src/discovery/maintenance/triangulation.ts`): independence = the manufacturer
   (all its documents, editions, markets and copies) is ONE source; others per underlying document /
   publisher. Confidence: high = manufacturer + ≥ 1 independent, or ≥ 3 independent; medium = the
   manufacturer alone, or 2 independent; low = one non-official source (never scheduled). No
   grounded source naming the model → low; no source stating years / generation → at most medium.
5. **Engine** (level T): A > B > T; within T the vehicle's market first, then the manufacturer, then
   the narrowest stated model-year coverage; otherwise different corroborated intervals → CONFLICTING.
   Across the service family, an Israeli-market service interval hides foreign service / oil intervals.
6. **Plan**: COMPLETE only when every core item is covered by an item that does the work; else
   PARTIAL (labelled). No established service interval → the §24 fallback (message + private upload),
   with any established items shown as PARTIAL.

Evaluation: `src/features/maintenance/knowledge/__tests__/blindSchedules.test.ts` (owner answers
"normal conditions"); results in `data/triangulation/blind_results.json`.

## Results

| #   | Vehicle             | Outcome                                | Usable | Items | High / medium | Fallback + upload |
| --- | ------------------- | -------------------------------------- | ------ | ----- | ------------- | ----------------- |
| B1  | Mazda 3 2011        | INSUFFICIENT                           | no     | 0     | 0 / 0         | yes               |
| B2  | Kia Sportage 2023   | PARTIAL                                | yes    | 14    | 0 / 14        | no                |
| B3  | Toyota C-HR 2019    | PARTIAL                                | yes    | 1     | 1 / 0         | no                |
| B4  | Tesla Model 3 2022  | COMPLETE                               | yes    | 3     | 0 / 3         | no                |
| B5  | Škoda Octavia 2018  | COMPLETE                               | yes    | 9     | 0 / 9         | no                |
| B6  | Hyundai i20 2016    | INSUFFICIENT                           | no     | 0     | 0 / 0         | yes               |
| B7  | Yamaha MT-07 2020   | PARTIAL                                | yes    | 11    | 0 / 11        | no                |
| B8  | Honda PCX 125 2019  | COMPLETE                               | yes    | 11    | 6 / 5         | no                |
| B9  | SYM Jet 14 125 2021 | PARTIAL (no oil interval: CONFLICTING) | no     | 12    | 0 / 12        | yes               |
| B10 | MG ZS EV 2021       | PARTIAL                                | yes    | 5     | 0 / 5         | no                |
| B11 | Suzuki Swift 2019   | INSUFFICIENT                           | no     | 0     | 0 / 0         | yes               |
| B12 | Peugeot 208 2021    | PARTIAL (timing belt only)             | no     | 1     | 0 / 1         | yes               |

Usable schedules: **7 / 12** (3 COMPLETE, 4 PARTIAL). Fallback: 5 / 12. 67 scheduled items: 57 rest
on one independent source (for 54 of them the manufacturer's own document), 10 on two.

## Caveats

- Most confidence is **medium**: for most vehicles only the manufacturer's document survived
  grounding. Foreign-market documents are used when they are the best applicable evidence and are
  labelled (Škoda: Egyptian importer table; Honda: Korean / Philippine manuals; Yamaha: EU manual).
- B5 "COMPLETE" rests largely on one foreign (Egyptian) importer table plus a 15,000 km / 12-month
  service corroborated by two non-official sources.
- B4 brake fluid: the 2-year and 4-year Tesla editions both apply; the edition stating 2017–2023
  coverage was preferred (narrowest stated model years). The owner may prefer to mark it CONFLICTING.
- Official Peugeot plan sheets (forum-peugeot.com) are robots-disallowed and were not grounded.
