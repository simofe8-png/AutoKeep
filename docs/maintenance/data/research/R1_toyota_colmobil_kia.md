# R1: Israeli importer sources for Toyota/Lexus, Colmobil brands and Kia (reviewed 2026-09-30)

The full record is in `R1_toyota_colmobil_kia.json`. Access was read-only. No forms, logins or plate numbers were used, and no PDFs were saved.

## Colmobil brands (colmobil.co.il, 200)

Colmobil's brands are Hyundai, Genesis, Mitsubishi, Mercedes-Benz, smart, JAECOO, OMODA and ORA. Genesis, smart, JAECOO, OMODA and ORA were not researched.

## Systems

| id                        | Type                                                       | Discovery                                                                                    | Terms: disc/fetch/extract/cache/facts/redistribute                                                    |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| il-union-motors-toyota    | **A** (fileType `maintenance_schedule` per model and year) | Public JSON at books.union-motors.co.il/app/api (models, years, search, files/{id}/download) | All six UNKNOWN (terms page is an Incapsula challenge)                                                |
| il-union-motors-lexus     | B (car/multimedia/quick guide; no schedule in samples)     | Same JSON API under /LexusApp/                                                               | All six REQUIRES_PERMISSION (lexus.co.il/legal §2.1)                                                  |
| il-colmobil-hyundai       | B (63 owner manuals + service/warranty booklet)            | Static Next.js page with embedded JSON `carbooks[{year,file}]`                               | All six REQUIRES_PERMISSION                                                                           |
| il-colmobil-mitsubishi    | B (manuals by year range)                                  | Static listing; delivery by **e-mail form** (not used)                                       | All six REQUIRES_PERMISSION                                                                           |
| il-colmobil-mercedes-benz | D                                                          | Embedded Mercedes-Benz AG JS widget only                                                     | All six REQUIRES_PERMISSION                                                                           |
| il-talcar-kia             | B (35 manuals + warranty booklets)                         | Static `<option value=PDF>` with free-text year labels                                       | Discovery and fetch **NOT_ALLOWED** (unconditional robots clause); the other four REQUIRES_PERMISSION |

The global libraries are described only briefly: Toyota Europe (B, UNKNOWN), Kia ownersmanual (C, IL he_IL available), Hyundai ownersmanual (C, no IL models today), Mitsubishi Motors Europe (B, not reviewed) and Mercedes-Benz online owner's manual (C, not verified).

## Corrections to prior research

- **Toyota.** The "לוחות אחזקה" are separate per-model, per-year PDFs. They are served by Union's own books app, not by a Toyota Europe selector.
- **Colmobil terms.** Hyundai, Mitsubishi and Mercedes-Benz share one terms template. It prohibits these activities "without prior written permission", which maps to REQUIRES_PERMISSION, not to a flat ban.
- **Kia importer.** Talcar is now named directly on the site ("טלקאר יבואנית קיה בישראל"). kia.co.il is unrelated: it belongs to the Kibbutz Industries Association.
- **Mitsubishi domain.** Mitsubishi Israel is mitsubishi-israel.co.il. mitsubishi-motors.co.il does not resolve.

## Open (UNVERIFIED)

- The contents of the Toyota terms of use.
- Whether the Lexus terms govern books.union-motors.co.il.
- Whether the Hyundai booklet, Mitsubishi manuals and Lexus car books contain schedules.
- The Mercedes-Benz widget's data endpoint.
- Talcar's registered legal name.
