# R3: Israeli importer sources for Carasso, European and Japanese brands (review date 2026-09-30)

Method: read-only curl, WebFetch and WebSearch. No logins, forms, plate numbers or AJAX POSTs.
Importers were confirmed against the Ministry of Transport importer price list (data.gov.il
`mehir_yevuan`, model years 2024–2026, public API returned 200). Two PDFs were downloaded to
check their structure: a Peugeot IL warranty booklet and a Subaru IL warranty booklet. Both were
deleted, and the Stellantis legal-notice PDF was also deleted after reading. No maintenance
intervals are recorded. The full data is in `R3_carasso_european_japanese.json` (17 systems).

## Importers (MoT data confirms each one)

| Brand(s)                       | Importer                                     | Site status                                            |
| ------------------------------ | -------------------------------------------- | ------------------------------------------------------ |
| Renault, Dacia, Nissan         | קרסו מוטורס בע"מ (514065283)                 | renault/nissan 200; dacia Imperva challenge            |
| Volvo                          | מאיר חברה למכוניות ומשאיות                   | volvocars.com/il 403 (Akamai)                          |
| BMW, MINI                      | דלק מוטורס (MINI rows under "ב מ וו אנגליה") | bmw.co.il / mini.co.il time out                        |
| Peugeot, Citroën, Opel, DS     | דוד לובינסקי                                 | online.\* 200; www.\* 403                              |
| Chevrolet                      | יוניברסל מוטורס ישראל (UMI)                  | 200                                                    |
| Subaru                         | יפנאוטו (Samelet group, UNVERIFIED)          | subaru.co.il Imperva challenge                         |
| Fiat, Jeep, Alfa Romeo, Abarth | סמלת מוטורס                                  | samelet.com 200; fiat/alfa .co.il 403; jeep.com/il 200 |
| Suzuki (cars)                  | מכשירי תנועה ומכוניות (2004)                 | 200                                                    |
| Honda (cars)                   | מאיר                                         | 200                                                    |
| Tesla                          | טסלה מוטורס ישראל (direct sales)             | 403                                                    |
| Daihatsu                       | **no current importer** (no MoT rows)        | none                                                   |

## Source types and access verdicts

| System                                                     | Type | Discovery / Fetch      | Extract / Cache / Facts / Redistribute   |
| ---------------------------------------------------------- | ---- | ---------------------- | ---------------------------------------- |
| il-carasso-renault / nissan                                | D    | UNKNOWN / UNKNOWN      | REQ_PERM / NOT / NOT / REQ_PERM          |
| il-carasso-dacia                                           | D    | UNKNOWN (bot wall)     | UNKNOWN                                  |
| il-mayer-volvo                                             | C    | UNKNOWN (403)          | UNKNOWN (IL notice unreadable)           |
| il-delek-bmw / mini                                        | B    | UNKNOWN (timeouts)     | UNKNOWN                                  |
| il-lubinski-online-guidebooks                              | B    | ALLOWED / ALLOWED      | NOT / NOT / NOT / NOT (terms clause 4.2) |
| global-stellantis-servicebox                               | B    | UNKNOWN                | REQ_PERM for all four                    |
| il-umi-chevrolet                                           | D    | UNKNOWN / NOT (\*.pdf) | NOT / UNKNOWN / NOT / NOT                |
| il-samelet-carbooks                                        | B    | REQ_PERM / REQ_PERM    | REQ_PERM for all four                    |
| il-japanauto-subaru                                        | B    | UNKNOWN (bot wall)     | UNKNOWN                                  |
| il-mt-suzuki                                               | B    | NOT / NOT              | REQ_PERM / NOT / REQ_PERM / NOT          |
| il-mayer-honda                                             | B    | ALLOWED / NOT          | UNKNOWN / REQ_PERM / UNKNOWN / REQ_PERM  |
| il-tesla                                                   | C    | UNKNOWN (403)          | UNKNOWN                                  |
| il-daihatsu, global Renault e-guide, global BMW VIN manual | D    | UNKNOWN                | UNKNOWN                                  |

## Findings

- **No type A source.** None of these importers publishes a per-model maintenance schedule page
  or PDF.
- **Samelet** (`samelet.com/car-book/*`, `samelet.com/ebooks/`, an open directory with 251 PDFs)
  is the most structured source. It has Hebrew car books, short guides, warranty booklets and
  appendices for Jeep, Fiat, Alfa, Abarth and Subaru, selectable by model and year in static HTML.
  Its terms require **prior written permission** for crawlers, automated retrieval, storage and
  building a database. One permission request could cover five brands.
- **Lubinski** exposes a public `modelsYears` JSON (model, production-date range, docType, docId)
  on four hosts, and robots.txt explicitly allows crawling. The documents are short guides,
  appendices and multimedia booklets, not schedules. Terms 4.2 flatly bars copying and "any other
  use". The warranty booklets contain a maintenance-routine section (not transcribed).
- **Volvo and Tesla** publish structured Hebrew HTML manuals (Tesla has an explicit
  maintenance-intervals topic). Both return 403 to automated clients.
- **Suzuki** explicitly bans robots, crawlers and any automated means.
- **Honda** has an owner-book selector, but the retrieval path (`/wp-admin/admin-ajax.php`) is
  disallowed by robots.txt.
- **Carasso, Chevrolet and BMW/MINI** have no usable public documents. Their manuals are available
  on request, as sparse old PDFs, or not at all.
- **Corrections to prior notes:**
  - MINI is imported by Delek. MoT lists it under "ב מ וו אנגליה".
  - The MoT dataset spells Suzuki's importer "4002" instead of "2004".
  - Daihatsu has no current importer.
  - Nissan's "maintenance-page" URLs are website-maintenance notices, not vehicle maintenance.
