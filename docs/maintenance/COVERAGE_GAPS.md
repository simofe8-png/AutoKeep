# Coverage gaps (generated)

Generated with ISRAEL_COVERAGE_MATRIX.md (2026-09-30). Gaps are ranked by the fleet share they block; each
names the deciding standard failure code and what would change it. Nothing here is a
guess: blockers come from the registry evidence (docs/maintenance/data/research/).

## By failure code

| Failure code          | Vehicles  | Share | What would change it                                                                                                      |
| --------------------- | --------- | ----- | ------------------------------------------------------------------------------------------------------------------------- |
| PERMISSION_REQUIRED   | 1,453,547 | 33.2% | written permission from the rights holder (importer/manufacturer), or owner approval of a proposed system as an authority |
| TERMS_OR_RIGHTS_BLOCK | 932,033   | 21.3% | written permission (the terms or robots.txt prohibit automated access)                                                    |
| POLICY_UNKNOWN        | 817,048   | 18.7% | a reviewable terms-of-use decision (terms unreadable or silent) — an owner/legal decision, never a guess                  |
| NO_DIGITAL_SOURCE     | 633,656   | 14.5% | no official digital source known — user upload of the vehicle’s own booklet                                               |
| AUTH_REQUIRED         | 355,208   | 8.1%  | an access agreement with the importer (documents behind a login), or the user supplies the document                       |
| SOURCE_UNAVAILABLE    | 148,094   | 3.4%  | the source exposes no readable document listing (JS app / form); user upload                                              |

## Largest manufacturer gaps

| Manufacturer  | Vehicles | Share | Deciding failure      | Israeli system(s)                                                                              | Global system(s)                                                     |
| ------------- | -------- | ----- | --------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| toyota        | 579,293  | 13.2% | POLICY_UNKNOWN        | il-union-motors-toyota (POLICY_UNKNOWN)                                                        | global-toyota-europe-owners-manuals (POLICY_UNKNOWN)                 |
| hyundai       | 563,974  | 12.9% | PERMISSION_REQUIRED   | il-colmobil-hyundai (PERMISSION_REQUIRED)                                                      | global-hyundai-ownersmanual (POLICY_UNKNOWN)                         |
| kia           | 432,117  | 9.9%  | TERMS_OR_RIGHTS_BLOCK | il-talcar-kia (TERMS_OR_RIGHTS_BLOCK)                                                          | global-kia-ownersmanual (POLICY_UNKNOWN)                             |
| mazda         | 279,517  | 6.4%  | AUTH_REQUIRED         | il-delek-mazda (AUTH_REQUIRED)                                                                 | —                                                                    |
| skoda         | 246,783  | 5.6%  | PERMISSION_REQUIRED   | il-champion-service-routine (PERMISSION_REQUIRED)<br>il-champion-books (TERMS_OR_RIGHTS_BLOCK) | —                                                                    |
| suzuki        | 181,420  | 4.1%  | TERMS_OR_RIGHTS_BLOCK | il-mt-suzuki (TERMS_OR_RIGHTS_BLOCK)                                                           | —                                                                    |
| mitsubishi    | 176,288  | 4.0%  | PERMISSION_REQUIRED   | il-colmobil-mitsubishi (PERMISSION_REQUIRED)                                                   | global-mitsubishi-motors-europe-ownersmanual (TERMS_OR_RIGHTS_BLOCK) |
| nissan        | 143,521  | 3.3%  | NO_DIGITAL_SOURCE     | il-carasso-nissan (NO_DIGITAL_SOURCE)                                                          | —                                                                    |
| seat          | 113,036  | 2.6%  | PERMISSION_REQUIRED   | il-champion-service-routine (PERMISSION_REQUIRED)<br>il-champion-books (TERMS_OR_RIGHTS_BLOCK) | —                                                                    |
| volkswagen    | 107,006  | 2.4%  | PERMISSION_REQUIRED   | il-champion-service-routine (PERMISSION_REQUIRED)<br>il-champion-books (TERMS_OR_RIGHTS_BLOCK) | —                                                                    |
| renault       | 92,684   | 2.1%  | NO_DIGITAL_SOURCE     | il-carasso-renault (NO_DIGITAL_SOURCE)                                                         | global-renault-dacia-eguide (NO_DIGITAL_SOURCE)                      |
| honda         | 92,320   | 2.1%  | TERMS_OR_RIGHTS_BLOCK | il-mayer-honda (TERMS_OR_RIGHTS_BLOCK)                                                         | —                                                                    |
| chevrolet     | 85,160   | 1.9%  | SOURCE_UNAVAILABLE    | il-umi-chevrolet (SOURCE_UNAVAILABLE)                                                          | —                                                                    |
| subaru        | 81,729   | 1.9%  | POLICY_UNKNOWN        | il-japanauto-subaru (POLICY_UNKNOWN)<br>il-samelet-carbooks (PERMISSION_REQUIRED)              | —                                                                    |
| citroen       | 81,384   | 1.9%  | TERMS_OR_RIGHTS_BLOCK | il-lubinski-online-guidebooks (TERMS_OR_RIGHTS_BLOCK)                                          | global-stellantis-servicebox-handbooks (PERMISSION_REQUIRED)         |
| chery         | 76,553   | 1.8%  | NO_DIGITAL_SOURCE     | il-carasso-chery (NO_DIGITAL_SOURCE)                                                           | —                                                                    |
| peugeot       | 71,869   | 1.6%  | TERMS_OR_RIGHTS_BLOCK | il-lubinski-online-guidebooks (TERMS_OR_RIGHTS_BLOCK)                                          | global-stellantis-servicebox-handbooks (PERMISSION_REQUIRED)         |
| ford          | 69,592   | 1.6%  | AUTH_REQUIRED         | il-delek-ford (AUTH_REQUIRED)                                                                  | —                                                                    |
| byd           | 64,561   | 1.5%  | PERMISSION_REQUIRED   | il-shlomo-motors-byd (PERMISSION_REQUIRED)                                                     | global-byd-eu-support (POLICY_UNKNOWN)                               |
| mercedes-benz | 59,083   | 1.4%  | SOURCE_UNAVAILABLE    | il-colmobil-mercedes-benz (SOURCE_UNAVAILABLE)                                                 | global-mercedes-benz-owners-manual (POLICY_UNKNOWN)                  |
| bmw           | 52,092   | 1.2%  | POLICY_UNKNOWN        | il-delek-bmw (POLICY_UNKNOWN)                                                                  | global-bmw-mini-digital-owners-manual (SOURCE_UNAVAILABLE)           |
| audi          | 46,353   | 1.1%  | PERMISSION_REQUIRED   | il-champion-service-routine (PERMISSION_REQUIRED)<br>il-champion-books (TERMS_OR_RIGHTS_BLOCK) | —                                                                    |
| jaecoo        | 45,243   | 1.0%  | PERMISSION_REQUIRED   | il-colmobil-jaecoo-omoda (PERMISSION_REQUIRED)                                                 | —                                                                    |
| mg            | 43,142   | 1.0%  | POLICY_UNKNOWN        | il-car-east-mg (POLICY_UNKNOWN)                                                                | —                                                                    |
| tesla         | 37,266   | 0.9%  | POLICY_UNKNOWN        | il-tesla (POLICY_UNKNOWN)                                                                      | —                                                                    |
| opel          | 33,605   | 0.8%  | TERMS_OR_RIGHTS_BLOCK | il-lubinski-online-guidebooks (TERMS_OR_RIGHTS_BLOCK)                                          | global-stellantis-servicebox-handbooks (PERMISSION_REQUIRED)         |
| yamaha        | 31,844   | 0.7%  | NO_DIGITAL_SOURCE     | il-metro-motor (NO_DIGITAL_SOURCE)                                                             | global-yamaha-owner-manual-library (POLICY_UNKNOWN)                  |
| honda         | 30,752   | 0.7%  | NO_DIGITAL_SOURCE     | il-mayer-honda-motorcycles (NO_DIGITAL_SOURCE)                                                 | global-honda-motopub (PERMISSION_REQUIRED)                           |
| isuzu         | 28,293   | 0.6%  | NO_DIGITAL_SOURCE     | —                                                                                              | —                                                                    |
| dacia         | 27,629   | 0.6%  | NO_DIGITAL_SOURCE     | il-carasso-dacia (NO_DIGITAL_SOURCE)                                                           | global-renault-dacia-eguide (NO_DIGITAL_SOURCE)                      |
