# Blind coverage matrix (fixed 2026-09-29, BEFORE any source research or engine run)

Chosen for material diversity, popularity in Israel and difficulty, not for known source availability.
No schedule for any of these vehicles exists in AutoKeep code or data at the time of selection.
Identities are what a registry lookup (data.gov.il) typically yields; unknown fields are left unknown.

| #   | Class                                          | Kind       | Make    | Model      | Year | Powertrain | cc   | Engine code |
| --- | ---------------------------------------------- | ---------- | ------- | ---------- | ---- | ---------- | ---- | ----------- |
| B1  | older ICE, Japanese                            | car        | Mazda   | 3          | 2011 | petrol     | 1598 | —           |
| B2  | recent ICE, Korean                             | car        | Kia     | Sportage   | 2023 | petrol     | 1598 | —           |
| B3  | hybrid, Japanese                               | car        | Toyota  | C-HR       | 2019 | hybrid     | 1798 | —           |
| B4  | EV, US                                         | car        | Tesla   | Model 3    | 2022 | electric   | —    | —           |
| B5  | European, multiple engine variants             | car        | Skoda   | Octavia    | 2018 | petrol     | 1395 | —           |
| B6  | older ICE, Korean                              | car        | Hyundai | i20        | 2016 | petrol     | 1396 | —           |
| B7  | motorcycle                                     | motorcycle | Yamaha  | MT-07      | 2020 | petrol     | 689  | —           |
| B8  | scooter, Japanese                              | motorcycle | Honda   | PCX 125    | 2019 | petrol     | 125  | —           |
| B9  | scooter, Taiwanese                             | motorcycle | SYM     | Jet 14 125 | 2021 | petrol     | 125  | —           |
| B10 | EV, Chinese (brand not in AutoKeep's registry) | car        | MG      | ZS EV      | 2021 | electric   | —    | —           |
| B11 | recent ICE, Japanese                           | car        | Suzuki  | Swift      | 2019 | petrol     | 1242 | —           |
| B12 | European, French                               | car        | Peugeot | 208        | 2021 | petrol     | 1199 | —           |

Regression cases (not counted as proof of coverage): SEAT Ibiza 2012 CGG, Ford Fiesta 2015 SNJB,
Hyundai IONIQ Hybrid 2021.

Disclosure: SYM (B9) is a brand for which the 2026-09-27 P1 research already found manufacturer
manuals (other models); it is kept because the Jet 14 is a common Israeli scooter, and its result
is reported separately in the metrics.
