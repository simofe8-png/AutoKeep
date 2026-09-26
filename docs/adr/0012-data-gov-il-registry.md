# ADR-0012: data.gov.il as the primary Israeli vehicle-data source

- Status: accepted (G1 decision, 2026-09-26)
- Date: 2026-09-26

## Context

Identification should not require re-typing data the state already publishes. The Ministry of Transport publishes vehicle registry datasets on data.gov.il (CKAN DataStore, free, public).

## Decision

- **Port:** `VehicleRegistryProvider.lookup(registration, { consent })`. The implementation is `DataGovIlRegistry`.
- **Datasets:** resolved at runtime from **stable package names**, never hard-coded resource IDs, because the ministry republishes resources (observed 2026-09-26: the main private-vehicle resource was empty while a continuation resource held the data):
  - `private-and-commercial-vehicles`
  - `motorcycle`
  - `degem-rechev-wltp` (code → model catalog)
- **Query:** exact `filters={"mispar_rechev": <digits>}` on each active datastore resource.
- **Mapping:**
  - Rows with names map directly.
  - Code-only rows resolve through the WLTP catalog by `(tozeret_cd, degem_cd, sug_degem)`. Several matching variants (e.g. year unknown) are returned as candidates; the user selects and nothing is guessed.
- **Provenance:** field origin `registry` means official government registry data. It is kept distinct from `scan`, `user` and `catalog`.
- **Privacy:** only the plate number is sent, and only after explicit user consent (`consent: true` is enforced in code). No owner data exists in these datasets. VINs are masked in the UI.
- **Robustness:** bounded timeouts, and resource resolution cached for 24 h. Unreachable or empty results fall back in context to scan or manual entry.

## Consequences

- Unit tests use recorded response shapes with altered plate/VIN values.
- `npm run test:live` performs an opt-in live check against data.gov.il; it isn't part of CI.
