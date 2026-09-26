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

## Adding a curated, hash-pinned schedule (`curated`, zero-cost path, G3)

V1 has no OCR/AI provider, so a verified maintenance schedule comes from a person's transcription
of the official document. The transcription is pinned to the exact bytes it was taken from.

1. Transcribe the schedule from the document into the entry's `curated` block
   (`src/discovery/hybrid.ts`). Record:
   - coverage (models, years, engines, markets) **as the document states it**;
   - each interval (rule, km, months);
   - each item's action type, manufacturer text, page, section/table and a **verbatim quote**.
     Transcribe; never infer.
2. Run the checker. It downloads the PDF, prints its SHA-256 and checks every quote on its cited
   page:

   ```
   npm run curate:check -- entry.json          # or: -- entry.json --pdf local.pdf
   ```

   Put the printed hash in `curated.sha256`, then re-run until it exits 0. A PDF with no text layer
   (a scan) cannot be machine-checked, so the checker fails. Such a schedule needs a second person
   to check every item against the page images, and that check is recorded in the evidence file.

3. A person approves the entry. `curatedBy` / `curatedAt` record who transcribed it; the evidence
   file under `docs/sources/evidence/` records the checker output and the approval.
4. At runtime the app still retrieves the document. It uses the curated schedule **only** when the
   retrieved bytes have exactly the pinned hash; after that, applicability and the domain's
   verification decide as usual. If the publisher changes the file, the hash no longer matches, so
   the app reports "unable to verify" until the entry is re-curated.

## Removing or correcting an entry

Remove the entry in a normal commit that states the reason. Schedules already stored keep their
provenance. Re-verification happens the next time the source is retrieved.
