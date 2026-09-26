# ADR-0016: Hybrid official-source discovery

- Status: accepted (G2, 2026-09-26)

## Decision

`HybridDiscoveryProvider` (a `DiscoveryProvider`) queries, in order:

1. **Known official sources.** AutoKeep's verified registry (`KNOWN_OFFICIAL_SOURCES`) holds
   manufacturer and official-importer domains, and optionally direct document URLs per
   make/model/year range. Each entry records who verified it and when. An entry is added only
   through the verification procedure (`docs/sources/REGISTRY_PROCEDURE.md`); nothing is guessed.
2. **Web discovery, only if (1) yields no candidate.** This is a `WebSearchPort` (search API,
   AI-assisted browsing and similar); the vendor is a separate approval.

Every result is only a **candidate**. The unchanged M10/M11 pipeline then applies:

- authority comes only from the verified registry, by host match (search rank, titles and AI claims
  confer nothing);
- retrieval (HTTPS, official final host after redirects, PDF, size, hash);
- document coverage read from the document itself;
- exact vehicle/version applicability;
- grounded extraction with injection flags;
- domain verification.

The outcomes:

- The result is **verified** only for an official, exactly applicable, unflagged document.
- It is **pending** when the source is official but applicability isn't proven.
- It is **not found / unable to verify** otherwise.

Provenance (URL, final host, retrieval time, hash, edition, page/section/table) is persisted with
the retrieved original.

## Consequences

- Web discovery can widen coverage but can never lower the trust bar.
- With an empty registry and no web provider configured, the app honestly reports "no verified
  official source".

## Amendment (G3, 2026-09-26): zero-cost web tier

There's no paid search API. The web tier is `OfficialSiteDiscoveryProvider`, which crawls only the
**verified official domains** of the vehicle's manufacturer:

- through their public `robots.txt` and sitemaps (including sitemap indexes), respecting robots
  rules;
- bounded to 6 sitemaps, 20,000 URLs and 10 candidates, with a 10 s timeout and a size cap per
  fetch.

It proposes on-domain PDF documents that name the model or look like a manual or maintenance
document. The results are candidates only, and the unchanged verification chain decides.
