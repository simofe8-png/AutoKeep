# M-SOURCE — Step 1 audit of the existing implementation (2026-09-30)

Baseline: `51407e6`. This audit came before any M-SOURCE code.

## What exists

| Area                              | Where                                                                                                                                                                  | State                                                                                                                            |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Source catalog (maintenance)      | `src/discovery/maintenance/sourceRegistry.ts` (`SOURCE_REGISTRY`, 30 host entries)                                                                                     | Host-level records: `status` (owner approval), a **one-dimensional** `automation` and `reuse`, `entryPoints`, free-text evidence |
| Older discovery catalog (M10)     | `src/discovery/registry.ts` (`OFFICIAL_DOMAINS`, `KNOWN_OFFICIAL_SOURCES`, both empty; `MANUFACTURER_ALIASES` in use)                                                  | Aliases reused. The empty M10 lists are legacy, used only by the M10 image/manual pipeline                                       |
| Source candidates                 | `SourceLead`, `DiscoveryOutcome`, `UserSourceAction` in `src/discovery/maintenance/types.ts`                                                                           | Reusable                                                                                                                         |
| Access policy                     | `access.ts` `accessDecision`: registry approval → `automation` → robots.txt                                                                                            | **Conflicts with M-SOURCE:** one boolean-like field stands in for discovery, fetch, extraction and storage                       |
| Evidence model                    | `src/domain/requirements.ts` (`EvidenceLevel` A–E, `coverageUnknown`, `anchor`), `src/engine/requirements.ts` (`assessEvidence`, per task+action resolution)           | Satisfies M-SOURCE. Keep unchanged                                                                                               |
| Document pipeline                 | `pipeline.ts`, `classify.ts`, `extract.ts`, `htmlText.ts`, `tools/pdf-text.mjs`                                                                                        | Reusable. Extraction must additionally be gated by an extraction permission                                                      |
| Upload / knowledge claims (Run 2) | `src/domain/knowledge.ts` (`documentFromUpload`, `matchOfficialEdition`, `reviewClaim`, `requirementFromClaim`, `sharingPolicy`)                                       | Reusable for Step 10. The reviewer is claim-level; M-SOURCE needs a requirement-level reviewer (Step 11)                         |
| Reusable knowledge                | `src/domain/catalog.ts` (`admitToCatalog`, scope keys), SQLite v7 `knowledge_catalog`, `KnowledgeCatalogRepository`                                                    | Reusable. Supersession is by host + sha256; it has no document-version entity and no "unchanged hash → skip extraction"          |
| Versioning                        | `src/discovery/retrieval.ts` `recordVersion` (M10)                                                                                                                     | A useful precedent; not wired into the maintenance pipeline                                                                      |
| Prepared cloud migrations         | `supabase/migrations/20260930000001_maintenance_knowledge.sql` (vehicle-scoped private knowledge), `20260930000002_maintenance_knowledge_catalog.sql` (shared catalog) | Both local-only. The catalog has no source-system / document-version / policy / review relations                                 |
| Blind test                        | `src/discovery/maintenance/__live__/blindMatrix.live.test.ts`, `tools/maintenance-blind-report.mjs`, matrix `5b19311`                                                  | Reusable. Failure classes need the standardized M-SOURCE codes                                                                   |
| Docs                              | `docs/release/MAINTENANCE_DISCOVERY.md`, `docs/sources/*`                                                                                                              | Superseded in part by `docs/maintenance/*`                                                                                       |

## Satisfies M-SOURCE already

- Atomic requirements with independent applicability, authority, market, evidence, interval and conditions.
- Per-item precedence: an Israeli override applies per task + action.
- Conflicts stay `conflicting`; UNKNOWN stays unknown.
- Evidence levels A–E, kept structurally separate from source types (source types do not exist yet).
- Engine code is first-class (`factsOf` takes the registry `degem_manoa`; it is never derived from displacement).
- Coverage-unknown dimensions keep a requirement at C.
- Reusable knowledge is keyed by vehicle class, never by plate, VIN or user.

## Conflicts / gaps

1. The one-dimensional `automation` / `reuse` fields must become six independent policy dimensions, with evidence and an append-only history.
2. The registry is **host-level**. M-SOURCE needs **source systems**: importer or manufacturer, brands, market, origin, source type A–D, discovery mechanism, document categories, adapter id and version metadata.
3. There is no mapping from the Ministry fleet universe (`tozeret_nm` values such as "טויוטה טורקיה") to source systems, and no runtime source-priority ordering.
4. There is no adapter contract and no standardized failure codes.
5. There is no document-version entity and no reuse of unchanged documents without re-extraction.
6. There is no requirement-level reviewer (APPROVE / CORRECT / REJECT).
7. There is no coverage engine with separate metrics and a documented denominator.
8. The fallback UI gives a generic "official source" text, not the precise reason.

## Minimal change plan

- **Evolve, don't duplicate.** `sourceRegistry.ts` is replaced by typed **source systems** (`registry/`), and the host view used by `access.ts` / `sources.ts` / `classify.ts` / `plan.ts` is derived from them. The M10 `registry.ts` stays for its aliases only.
- **Access gates:** `accessDecision(url, activity)` checks the dimension for that activity (discovery vs fetch); extraction checks `automatedExtractionAllowed`; catalog admission checks `structuredFactsStorageAllowed`. Documents are never cached (bytes are discarded after extraction), so caching is never exercised.
- **New modules:** `registry/policy.ts`, `registry/sourceSystem.ts`, `registry/israel.ts` (data), `registry/universe.ts`, `adapters/*`, `documentVersions.ts`, `src/domain/review.ts`, `coverage.ts`.
- **Evidence engine:** unchanged; only the applicability dimensions M-SOURCE needs are added.
- **Migrations:** a new prepared migration `20260930000003` adds source systems, policy versions, document versions and review state to the shared catalog. It is additive and local only.
