# Verified official-source registry — procedure (ADR-0016)

Entries in `src/discovery/registry.ts` grant **authority**, so they are added only by a person,
with evidence. Nothing is added by AI, from search ranking, or by guessing.

## Adding an official domain (`OFFICIAL_DOMAINS`)

1. Establish that the domain belongs to the vehicle manufacturer, or to its **official importer
   for Israel**. Acceptable evidence includes:
   - the manufacturer's global site linking to the importer;
   - the Ministry of Transport importer list;
   - a registered-company match.
2. Record `manufacturer` (the normalized key), `kind`, `domain`, `market` (importers: `IL`),
   `verifiedBy` and `verifiedAt`.
3. Commit with the evidence links in the commit message or in `docs/sources/evidence/`.

## Adding a known official document (`KNOWN_OFFICIAL_SOURCES`)

1. The URL must be HTTPS and on a domain already in `OFFICIAL_DOMAINS`.
2. Record the models and year range **as stated in the document itself**, plus title,
   `verifiedBy` and `verifiedAt`.
3. The app still re-verifies at runtime: final host after redirects, PDF, hash, coverage read
   from the document, exact applicability, and grounded extraction. A registry entry never
   bypasses those checks.

## Removing or correcting an entry

Remove the entry in a normal commit that states the reason. Schedules already stored keep their
provenance. Re-verification happens the next time the source is retrieved.
