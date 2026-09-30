# Maintenance access expansion — re-review of 2026-09-30

Standard applied: `ALLOWED` needs documented affirmative evidence that the specific operation is
permitted (terms clause, licence, official API/data terms, explicit machine-access policy).
Absence of a prohibition is not permission; robots.txt alone is not a legal conclusion; UNKNOWN
stays UNKNOWN. Raw research: `data/research/R5_raw_israeli_importers.json` (23 Israeli hosts),
`data/research/R5_raw_global_manufacturers.json` (14 global sites). Applied revisions:
`data/research/R5_access_rereview.json` → policy **version 2** of 13 systems (v1 kept, append-only).

## Result

- **59 / 59** systems reviewed (37 against fresh evidence, the rest re-checked on their recorded
  evidence; no new evidence for D systems that publish nothing).
- **New ALLOWED: none.** No Content-Signal line, open licence, free API or affirmative terms grant
  on any Israeli or global source. Personal, non-commercial use grants (Toyota EU, Mitsubishi EU,
  Renault, Yamaha, Honda, Kawasaki and most Israeli importers) do not cover an automated service.
- **Changed:** 36 dimensions on 13 systems, all `UNKNOWN → NOT_ALLOWED / REQUIRES_PERMISSION`
  with a verbatim quote and URL (Champion books, Carasso Nissan/Renault, Car East MG, UMI
  Chevrolet, Toyota EU, Mitsubishi EU, Mercedes-Benz, Stellantis, Renault e-guide, Honda
  motorcycles, Kawasaki, KTM). Nothing was loosened.
- **MG (mg-israel.co.il):** `ai.txt` says content "may be used for informational summaries and user
  assistance", but terms §4.2 prohibit copying or any other use. Conflicting evidence → extraction
  stays UNKNOWN; discovery/fetch have no permission either. Not enabled.
- **SYM (sym-global.com):** no terms page, empty robots rules, "All rights reserved". Its ALLOWED
  rests only on the owner decision of 2026-09-27 (P1 §8.4–8.6), not on rights-holder evidence.
  Kept as recorded; owner must re-confirm or revoke.
- **Israeli law:** no duty found for importers to publish maintenance schedules publicly
  (Vehicle Services Licensing Law 2016 §80: information on request to garages; §58(b): garage list
  on the website; import regulations r.10: a usage summary to the buyer). Nothing on automated reuse.
- **EU Regulation 2018/858 Art. 61–63 (RMI):** covers service/maintenance information for
  independent operators, against "reasonable and proportionate fees" → a paid channel (approval gate).
- **Manufacturer APIs:** Mercedes Remote Maintenance Support and BMW CarData give per-vehicle
  service-due data only with owner consent and payment → paid provider + personal data (approval gate).
- **data.gov.il:** no maintenance-schedule dataset (CKAN search 2026-09-30).

## Priority sources (by Israeli fleet share)

| Source system                                | Fleet  | A. Technically automatable                                  | B. Affirmative permission              | C. Exact applicability                    | D. Schedule or manual        |
| -------------------------------------------- | ------ | ----------------------------------------------------------- | -------------------------------------- | ----------------------------------------- | ---------------------------- |
| Colmobil (Hyundai, Mitsubishi, Jaecoo/Omoda) | 17.96% | yes: public JSON manual lists (Hyundai) / form (Mitsubishi) | no: prior written consent required     | model level                               | owner manuals                |
| Union Motors Toyota                          | 13.25% | yes: public JSON books app, per model/year PDFs             | no: terms unreadable (Incapsula)       | model + year in titles; powertrain partly | **maintenance schedules**    |
| Champion (Škoda, SEAT, VW, Audi, CUPRA)      | 11.73% | yes: HTML schedule tables (PDFs robots-disallowed)          | no: prior written consent required     | by model, displacement, fuel              | **maintenance schedules**    |
| Talcar Kia                                   | 9.88%  | yes: static links                                           | no: robots/spiders prohibited in terms | model level                               | owner manuals                |
| Delek (Mazda, Ford, BMW, NIO)                | 9.2%   | no: SharePoint login                                        | —                                      | —                                         | service plans (behind login) |
| M.T. Suzuki                                  | 4.15%  | yes: static links                                           | no: robots/crawlers prohibited         | model level                               | owner manuals                |
| Carasso (Nissan, Renault, Dacia, Chery)      | 8.65%  | no documents published                                      | no: collecting/storing prohibited      | —                                         | —                            |
| Geo Mobility Geely                           | 0.62%  | yes: sitemap                                                | no: terms only as PDF, unread          | model level                               | **maintenance schedules**    |

## Where written permission would add the most coverage

1. Union Motors (Toyota; Lexus shares the backend) — 13.25% + 0.52%, per-model/year schedules.
2. Champion Motors — 11.73%, direct schedule tables.
3. Colmobil — 17.96%, manuals (schedules must be extracted).
4. Talcar Kia — 9.88%. 5. Delek account/API access — 9.2%. 6. M.T. Suzuki — 4.15%.

Requesting permission is external communication by the owner (approval gate).
