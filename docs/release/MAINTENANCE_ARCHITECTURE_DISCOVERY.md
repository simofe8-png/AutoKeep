# Maintenance schedule architecture: discovery (2026-09-29)

**Status:** READ-ONLY DISCOVERY. Nothing here is implemented. No database, migration or provider
change was made. The proposal needs owner approval before any implementation.

**Sources:**

- A read-only audit of the current code. Paths are cited below and were spot-checked.
- Web research on the two acceptance vehicles. Every interval quoted here is **evidence found**,
  never a requirement AutoKeep would publish. Confidence is given per claim.

## 1. What exists today

| Area           | Current implementation                                                                                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schedule model | `src/domain/maintenance.ts`: `MaintenanceSchedule {vehicleId, intervals[], evidence[], applicability {matchedOn, exact}, verification}`. Intervals hold items `{title, actionType, manufacturerText, reference}`. `rule` is `earliest_of`, `distance_only` or `time_only`, with `everyKm`, `everyMonths`, `firstAtKm` and `firstAtMonths`. |
| Trust gate     | `src/domain/provenance.ts` `decideVerification`: no evidence → pending; no manufacturer/importer evidence → unverified; not exact → pending; differing `assertedValue` → conflicting; otherwise verified. `createSchedule` computes this; callers cannot inject it.                                                                        |
| Engine         | `src/engine/maintenance.ts` `computeMaintenance` is pure and deterministic. It refuses unverified schedules (`schedule_unavailable`), handles earliest-of, history, deferrals and first service, and labels forecasts as `Forecast` ("צפי"). Missing history is never reported as overdue.                                                 |
| Discovery      | `src/discovery/*`: hybrid (known sources, then a robots/sitemap crawler of registry domains) → authority by HTTPS host → official PDF retrieval with sha256 → document-level `DocumentCoverage` → `matchApplicability`.                                                                                                                    |
| Curated path   | `CuratedSchedule`: a human-curated, hash-pinned schedule, with `tools/curate-check.mjs` checking that each quote is on its cited page (ADR-0017).                                                                                                                                                                                          |
| AI boundary    | `src/intelligence/*`: zod schemas, grounding, confidence thresholds and injection flags. In production `reader`, `extractor` and `invoiceReader` are **null** (G1: no provider approved).                                                                                                                                                  |
| Registries     | `OFFICIAL_DOMAINS = []` and `KNOWN_OFFICIAL_SOURCES = []` (`src/discovery/registry.ts`).                                                                                                                                                                                                                                                   |
| Storage        | SQLite `schedules` stores `intervals_json`, `evidence_json` and `applicability_json` per `vehicle_id`, append-only, and `current()` is the latest row. Supabase mirrors this. **`sources` is not synced** (`SYNC_TABLES`).                                                                                                                 |
| Documents      | Uploads keep the original and its sha256. The authority is `user_report` for manuals, `garage_document` for invoices and `vehicle_document` for registration. No content is ever extracted from an upload.                                                                                                                                 |

**Net effect in production:** `planOfficialSource` returns `not_found` before any network call, so
every vehicle shows "לא נמצא מקור רשמי שניתן לאמת" and the engine returns `schedule_unavailable`.

## 2. What is architecturally correct (keep)

- **Evidence decides:** verification is computed by the domain and cannot be asserted; AI output
  cannot verify.
- **Deterministic engine:** it is fully separated from extraction, and forecasts are typed and
  labelled.
- **Authority from registries:** authority comes from a registry of verified official hosts, never
  from what a document claims about itself. Retrieval is hash-pinned, and redirects are
  re-checked.
- **Unknown stays unknown:** missing applicability facts become `not_proven`, not assumed.
- **Originals stay separate:** the original is kept apart from derived data, with a hash;
  quote-on-page checking is automated.
- **Uploads cannot self-certify:** a user upload can never become manufacturer or importer
  authority by itself.

## 3. What is insufficient

1. **Evidence is per schedule, not per claim.**
   - Each item has a locator but no applicability, authority, market, verification or extraction
     provenance of its own.
   - A document that is 90% verified cannot publish the verified 90%.
2. **No shared catalog.** Each vehicle stores a private JSON copy, so nothing is reused across
   vehicles with the same identity class.
3. **No market model.**
   - `market` is hard-coded to `'IL'`.
   - "Manufacturer (EU)" vs "Israeli importer" is not representable, and neither is an override.
4. **No conflict model.** Conflicts use a single `assertedValue` string that nothing sets.
   `current()` takes the latest row, not the best-supported one.
5. **No conditions.** There is no severe-use or normal-use schedule, and no service regime (SEAT
   LongLife QG1 vs fixed QG0/QG2).
6. **Applicability is too coarse.**
   - Displacement is the only engine key.
   - Engine code, transmission, fuel, generation/model code, power and emission standard are
     ignored.
   - Onboarding does not pass `modelCode` or `engineCode` to discovery.
7. **Time dues rarely compute.** The first-registration date (`moed_aliya_lakvish`) is fetched but
   never persisted or passed as `inServiceDate`, so time-based dues are "time unknown" without
   history.
8. **Units are not preserved.** An interval of 12,500 mi would have to be stored as a km number,
   losing the original unit and the fact that it was converted.
9. **Uploaded manuals are inert.** An uploaded service booklet contributes nothing, which is the
   single most important evidence source for older cars (§11).
10. **No re-discovery after onboarding,** and provenance rows (`sources`) are lost on restore.

## 4. What must be replaced

- **The schedule representation:** `schedules.intervals_json` as the unit of truth is replaced by
  a **claim catalog** plus a per-vehicle **resolved schedule** that points to claims.
- **Schedule-level verification:** replaced by claim-level verification. The existing
  `decideVerification` rules are reused per claim.
- **Market handling:** the hard-coded `'IL'` market and displacement-only engine matching are
  replaced by a structured applicability predicate (§9).

## 5. What can be reused unchanged or nearly

- `decideVerification`, `Evidence` and `SourceReference`, applied per claim.
- `classifyAuthority`, `normalizeManufacturer`, `retrieveOfficial` and the domain registries.
- `DocumentCoverage` and `matchApplicability`, as the **document-level pre-filter**. They are
  extended with dimensions but keep the "missing → not proven" behavior.
- `CuratedSchedule`, `curation.ts` and `tools/curate-check.mjs`, which become the curated-claim
  publishing tool with hash and quote checks.
- `computeMaintenance`: the engine input becomes the resolved schedule. It needs `inServiceDate`
  and per-item provenance passed through.
- `src/intelligence/*`: schemas, grounding and injection flags, for the future AI extraction step.
- The document store: private originals with sha256, and the upload authority rules.
- The reference-image catalog pattern: a shared read-only Supabase table, a fail-closed operator
  tool and an identity-class key. It is the template for the claim catalog.

## 6. Proposed data model (logical; no migration written)

```
source_documents        (shared catalog; one row per document edition)
  id, title, publisher, authority_kind (manufacturer | importer | official_publication |
  vehicle_document | secondary), market_scope[], language, edition/print_no, publication_date,
  retrieved_from, sha256, page_count, terms_note, storage_policy (hash_only | private_original),
  coverage (document-level applicability predicate), status (candidate | verified_authentic | withdrawn)

document_sections       (where claims live)
  id, document_id, locator {page, section, table, row, figure}, heading, applicability (narrows the
  document's), quote_hash (and the quote itself only where terms allow; §17)

maintenance_claims      (atomic, reusable facts)
  id, section_id, task_code (normalized: engine_oil, oil_filter, timing_belt, brake_fluid, …),
  task_text_original, action_type (inspection | replacement | adjust | other),
  interval {every_distance, distance_unit (km|mi), every_months, first_at_distance, first_at_months,
            rule (earliest_of | distance_only | time_only), derived_km (+ derived=true)},
  condition (normal | severe | regime:QG1 | …, with the source's own definition text),
  applicability (claim-level predicate), market_scope[], authority (inherited from document),
  extraction {method: curated | ai_candidate | user_entered, by, model/version, at},
  verification {state, decided_by (rule), reviewed_by, reviewed_at, evidence_refs[]}

vehicle_schedule_resolutions   (per vehicle, synced, recomputable)
  vehicle_id, resolved_at, identity_snapshot (facts + their provenance), per task_code:
  {effective_claim_id | null, candidate_claim_ids[], state (verified | conflicting | pending |
   unable_to_verify), reason (rule id + human text), questions_pending[]}
```

- **Catalog tables** (`source_documents`, `document_sections`, `maintenance_claims`) are shared,
  read-only to the app, and written only by the operator tool, like `vehicle_reference_images`.
- **User-uploaded documents and their user-reviewed claims** are vehicle-scoped private rows with
  the same shape. Every row carries `vehicle_id`; they never enter the shared catalog without an
  explicit, separate decision.

## 7. Document model

- **Documents are editions, not vehicles.**
  - One document can cover many models, years, engines, markets and schedules.
  - Its coverage is a document-level predicate. Sections narrow it (for example "Petrol 1.4 63 kW"
    or "severe conditions").
- **Identity is by sha256.** The same PDF discovered twice, or uploaded by two users, is one edition.
- **Authenticity is separate from authority.**
  - An uploaded file is `vehicle_document` / `user_report` until it is proven to be an official
    edition. It can be proven by a hash match with a verified catalog edition, or by the owner's
    review (V1 quality gate).
- **Storage policy is explicit per edition:** `hash_only`, where the catalog keeps structured facts
  and locators only, or `private_original`, the user's own upload.

## 8. Claim model

- **A claim is the smallest verifiable statement.** For example "engine oil and filter: replace,
  every 15,000 km or 1 year, whichever first, normal conditions, for coverage X, source Y p.12
  table 3".
- **Original units are kept.** Conversions are stored as derived and labelled.
- **Conditions are explicit.**
  - A severe-use claim is a separate claim with the source's own definition of "severe".
  - A regime claim (LongLife vs fixed) is a separate claim conditioned on a vehicle fact (the PR
    code), which may have to be asked for.
- **Each claim carries its own verification.** One unreadable or unverifiable row does not block
  the verified rows next to it.

## 9. Applicability model

**Predicate dimensions:** each dimension is constrained, unconstrained or unknown.

- vehicle kind (car / motorcycle / scooter / …);
- make;
- model family;
- generation / platform code (e.g. 6J);
- model-year range with cut-off rules;
- body;
- engine family;
- **engine code set**;
- displacement;
- power;
- fuel / powertrain (petrol, diesel, hybrid, EV);
- transmission;
- emission standard;
- market / region;
- service regime / PR code;
- VIN range.

**Vehicle facts carry provenance** (registry / user / derived), like `exteriorPhase` today.

**Matching is per dimension:**

- **match:** the claim applies on that dimension;
- **mismatch:** the claim is excluded;
- **not_proven:** the claim is not verified for this vehicle. A resolvable unknown becomes a
  **question to the user**, as with the front-facelift question. For example "Which service
  regime is printed in your booklet: QG0 / QG1 / QG2?", or "Which engine code is on your
  registration?"

**Motorcycles and scooters use the same predicate.** Their intervals often include the first
service at 1,000 km. Engine hours can be added as a distance unit later without a model change.

## 10. Authority and source model (evidence hierarchy)

| Rank | Source                                                                                                         | Can verify a claim?                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1    | Israeli importer official publication for the IL market (e.g. ford.co.il service plan)                         | Yes, for IL-market vehicles within its coverage                                             |
| 2    | Manufacturer documentation for the vehicle's region (owner's manual, maintenance programme, service portfolio) | Yes, within coverage and market                                                             |
| 3    | Manufacturer global or other-region documentation                                                              | Only if the document states it applies to the vehicle's market; otherwise it is a candidate |
| 4    | The vehicle's own official booklet (uploaded by the user)                                                      | Yes **for that vehicle**, once authenticity is established (§7, §15)                        |
| 5    | Official service or regulatory publications                                                                    | Yes, for what they regulate                                                                 |
| 6    | User-entered facts                                                                                             | No. Shown as "דיווח משתמש"                                                                  |
| 7    | Secondary technical sources (Haynes, parts sellers, press, forums)                                             | **Never.** Used only to raise a conflict flag or to prioritize research                     |

## 11. Israel-market override model

- **Per task, not per document.** An applicable **IL importer claim** takes precedence over a
  manufacturer claim **for the same task and condition**, for an IL-market vehicle.
- **Both claims are kept and shown.** The resolution records the rule, for example "R2: IL
  importer claim supersedes manufacturer EU claim for engine_oil; both retained".
- **No over-reach.** An importer claim that covers only the main service (e.g. "15,000 km / 1
  year") does **not** override manufacturer claims for other tasks, such as the timing belt.
  Those resolve on their own evidence.

## 12. Conflict model

- **When two claims conflict:** they are applicable at the same rank, for the same task and
  condition, and give different intervals. The task's state is then **conflicting**.
- **Conflicts are shown, never merged.** The UI shows both claims with their sources. No silent
  "stricter wins".
  - The engine can compute each candidate separately, labelled by source.
  - The user can choose which one to follow; that choice is stored as a user decision, not a
    verification.
- **Resolvable-by-fact conflicts become questions.** If a vehicle fact would resolve the conflict
  (regime, engine code, model year), AutoKeep asks the question instead.
- **Secondary sources only raise a review flag.** When they disagree with a verified claim, the
  verified state does not change.

## 13. AI extraction boundary

**AI may** (once a provider is approved; today there is none, gate G1):

- find relevant passages;
- propose candidate claims with an exact locator and quote;
- normalize task names to `task_code`;
- classify the action and condition;
- propose applicability from the section text;
- flag possible conflicts.

**AI must not:**

- set verification;
- choose the effective requirement;
- convert units without marking it;
- fill in an unknown interval;
- raise an authority rank.

**Every AI claim is `ai_candidate`** until:

- the quote is found on the cited page (deterministic check, reusing `curate-check`);
- the document's authority is established;
- a human reviews it, as a V1 quality gate.

## 14. Deterministic calculation boundary

Pure code performs:

- applicability matching;
- effective-claim resolution (ranked rules with recorded reasons);
- unit conversion (marked as derived);
- next due by km and time;
- earliest-of;
- first service;
- km and days remaining;
- due, upcoming and overdue;
- forecast dates ("צפי") from the driving rate;
- bundling.

`inServiceDate` comes from the registry's first-registration date, stored with provenance.

## 15. User-uploaded document flow

1. **Upload:** the user uploads a booklet, manual pages or stamped service pages. It is stored
   privately with its sha256 and `vehicle_id`, with authority `user_report` (as today).
2. **Hash lookup:** if the hash matches a verified catalog edition, it inherits that edition's
   claims immediately.
3. **Otherwise, candidates:** candidate claims are created by the user entering them with a
   page/photo locator. Later, an approved AI provider can propose them.
4. **Review:** the user confirms each candidate. It becomes a vehicle-scoped claim with authority
   `vehicle_document` and state **"user-confirmed from document"**. It stays visually distinct from
   importer or manufacturer-verified claims.
5. **Promotion to verified official:** an owner or curator review of the document's authenticity
   (for example the SEAT Maintenance Programme booklet with its PR code) promotes it. It then
   becomes a catalog edition that others can reuse. This step needs a separate decision on storing
   user-contributed documents (privacy and terms).

## 16. Source discovery strategy

1. **Verified domain registry:** add manufacturer and **Israeli importer** domains to
   `OFFICIAL_DOMAINS`, each after the documented verification procedure. Examples: seat.com
   datamanual, fordservicecontent.com, ford.co.il, champion-motors / seat.co.il.
2. **Known-document catalog:** curated editions with coverage, for the most common Israeli
   vehicles first (the registry can list the Israeli fleet by `degem_nm` and year).
3. **Crawler:** the existing robots/sitemap crawler, limited to registry domains. It must first be
   made **fail-closed** on unreachable robots.txt (already flagged in P2 §7).
4. **User uploads:** a normal input (§15). For older vehicles this is expected to be the main
   source.
5. **Importer contact:** a documented manual request for vehicles whose schedule is only on paper.
   An operator task, not app code.
6. **Re-discovery:** re-run when vehicle facts change, when the catalog gains a matching edition,
   or on demand. Today discovery runs only once, at onboarding.

## 17. Verification strategy

- **Document:** the host is in the registry, the sha256 is pinned, the edition and coverage are
  recorded, and the terms are noted.
- **Claim:**
  - the quote is found on the cited page (automated);
  - the applicability predicate matches the section;
  - a human reviewer is required for V1, recorded as `reviewed_by`;
  - the claim is verified only when the authority rank allows it (§10).
- **Resolution:** golden fixtures per acceptance vehicle pin the effective claim, the conflict
  state and the reason. Changing a rule breaks a fixture visibly.
- **Terms:**
  - The SEAT manual states "Re-printing, copying or translating … is not allowed unless SEAT
    allows it in written form".
  - The Ford Service Portfolio forbids reproduction "without our written permission".
  - **Proposal:** the catalog stores structured facts, locators and a quote **hash** (not the
    quote text) for such documents. Showing verbatim quotes needs permission.
  - **This is an owner decision** (§20).

## 18. Acceptance cases: evidence required

### Case A: SEAT Ibiza 2012, CGG 1.4 16V 63 kW

**Found:**

| Evidence                                                                                                                                                                                                                                | Authority, market, confidence                                               |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Official 2012 Ibiza owner's manual (seat.com, UK edition 6J4012003DC, 15.12.11): the regime is set by the **PR code on the Maintenance Programme booklet**. QG1 = LongLife; QG0/QG2 = fixed "1 year / 15 000 km (whatever comes first)" | Manufacturer, UK/EU, High                                                   |
| The same manual defers **all other item intervals** (brake fluid etc.) to the paper Maintenance Programme booklet, which is not online                                                                                                  | —                                                                           |
| Israeli press quoting importer-garage steps: 15k oil and filter; 30k + air and cabin filters; 60k + spark plugs                                                                                                                         | Secondary, IL, Medium                                                       |
| Timing belt: 90,000 km / 4 yr, 60k mi / 4 yr, 40k mi / 4 yr and (IL press) 120,000 km / 5 yr                                                                                                                                            | All secondary and conflicting. **Highest risk; no number may be published** |

**Needed for a trustworthy schedule:**

1. The car's own **Maintenance Programme booklet**, uploaded: the PR code (regime) and item
   intervals. This is the only practical official source.
2. Or a curated catalog edition of that booklet: the Champion Motors Israeli edition if one exists,
   otherwise the SEAT EU edition applied to the IL market.
3. An Israeli importer (Champion Motors) statement of the IL regime, or confirmation that IL cars
   are QG0/QG2 fixed. Today this is only inferred.
4. The official CGG timing belt interval (VW erWin is paid, so a purchase decision would be needed;
   not proposed).

**Applicability facts:** make, model, 6J / `degem_nm` 6J52E4, MY 2012, engine code CGG (from the
registry), IL market, and the regime (a question to the user).

### Case B: Ford Fiesta 2015, 1.25 Duratec, SNJB

**Found:**

| Evidence                                                                                                                                                                                                    | Authority, market, confidence                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ford.co.il (Delek Motors) service plan: "whichever first: dashboard warning / 15,000 km / one year", per model and registration year, with parts per service. **Current models only; no 2015 Fiesta entry** | Importer, IL. High for listed models; the 2015 Fiesta is not covered                             |
| Europe: 12,500 mi (≈20,000 km) / 1 yr. Air filter and plugs 37,500 mi / 3 yr; brake fluid 2 yr; belt 100,000 mi / 8 yr (Haynes and a parts site citing Ford)                                                | Secondary, UK, Medium–Low. The official 2015 EU Service and Guarantee booklet was not found free |
| US 2015 Fiesta official manual                                                                                                                                                                              | Manufacturer, US, **not applicable**: it covers 1.0 EcoBoost / 1.6 only, not the 1.25            |
| Engine code: SNJB is documented mainly as Euro 5 (Mk6 / early Mk7); 2013–2017 Euro 6 cars are often SNJC                                                                                                    | **The engine code itself must be confirmed from the registry, VIN or engine plate**              |

**Needed for a trustworthy schedule:**

1. The Delek Motors plan for a 2015 Fiesta 1.25 (importer request or archived page), or
2. the car's Ford Service and Guarantee booklet / service record, uploaded, and
3. a Ford Europe edition covering the 1.25 Sigma with market coverage that includes Israel.

**Expected conflict:** EU about 20,000 km vs IL 15,000 km for the main service. Under §11 the IL
importer claim is effective for the main service, with both claims shown. The belt, coolant and
brake fluid resolve separately.

**Both cases show why "one vehicle → one manual → one table" fails:**

- one SEAT manual covers every engine, with the regime decided by a per-car code;
- one Ford table is keyed by model **and derivative**;
- one US Fiesta manual lists three engines, none of them this car's;
- warranty and service books list the countries they apply to, and Israel is not among them.

## 19. Proposed implementation stages (each a separate approval)

| Stage | Scope                                                                                                                                                                                                                                                                          | Gates                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| M1    | **Pure domain:** claim, applicability predicate, per-dimension matcher, resolution rules (§10–12) and unit handling in `src/domain`. Golden fixtures for Cases A/B built from **synthetic test claims** (clearly labelled), plus a motorcycle and an EV fixture. No DB, no UI. | None (pure, reversible)                         |
| M2    | **Vehicle facts:** persist the first-registration date (`inServiceDate`), engine code, model code, fuel and transmission with provenance; pass them to discovery; add the applicability-question UI pattern                                                                    | Local migration (reversible)                    |
| M3    | **Schema:** catalog tables (read-only, like reference images), vehicle-scoped document claims, resolution rows; sync `sources`; engine adapter from resolution to `computeMaintenance`. Staging only.                                                                          | Staging migration approval                      |
| M4    | **Operator tool:** fail-closed publishing of editions and claims (hash plus quote-on-page check, reviewer), from `curate-check`                                                                                                                                                | None beyond M3                                  |
| M5    | **User-upload claim flow:** manual candidate entry from the user's booklet photo, review, and vehicle-scoped claims with distinct display                                                                                                                                      | UX approval                                     |
| M6    | **Maintenance UI:** per-task source, state, conflict and user choice; re-discovery                                                                                                                                                                                             | UX approval                                     |
| M7    | **Discovery:** populate the registries (manufacturer and IL importer domains); fail-closed crawler                                                                                                                                                                             | Each registry entry per `REGISTRY_PROCEDURE.md` |
| M8    | **AI candidate extraction** into the M4/M5 review queue                                                                                                                                                                                                                        | **Provider approval (cost, privacy)**           |
| M9    | **First real catalog entries** for Cases A/B, which need the owner's booklets or importer documents                                                                                                                                                                            | Owner-provided evidence                         |

## 20. Owner decisions needed

1. **Verbatim quotes:** store and show them from copyrighted manuals, or keep structured facts, a
   locator and a quote hash only.
2. **Promotion of user uploads:** whether a user-uploaded official booklet may be promoted to a
   shared catalog edition. This covers privacy (stamps, plates, names on pages) and terms.
3. **Conflicts:** whether they should default to "show both, user chooses", or to "IL importer
   rule, then ask" (§11–12 propose the latter only for same-task, IL-market claims).
4. **Importer contact:** whether AutoKeep may contact importers (Champion Motors, Delek Motors)
   for official schedules. This is an external, outward-facing action.
