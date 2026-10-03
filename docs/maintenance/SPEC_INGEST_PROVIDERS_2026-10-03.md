# Spec: schedule ingestion from user documents, and a vehicle-data provider port (draft, 2026-10-03)

**Status:** decisions taken by the owner on 2026-10-03 (see "Owner decisions" below). Part A step 1 (text PDFs + owner review) is implemented; see "Implementation log".

**Builds on:** ADR-0004 (provider ports), ADR-0013 / 0017 (document intelligence), ADR-0020
(M-SOURCE), `PROVIDER_RESEARCH_2026-10-03.md`.

**Goal:** give a vehicle in `VERIFIED_IDENTITY_ONLY` a working path to a schedule:

- **now:** from the owner's own documents;
- **later:** from a licensed provider, once the DPA and B2C-licence gate is cleared, by adding an
  adapter only.

**Fixed principles:**

- Zero fabrication.
- Every interval cites a located, grounded source.
- OCR and AI never confirm anything themselves.
- One resolution path (M-SOURCE) for every source.
- The UI and the matcher core do not change when a source is added.

## Part A: user-uploaded schedule documents

### A0. Correction to the directive: per vehicle, not `catalogData.ts`

`catalogData.ts` is **generated** (`tools/build-msource-catalog.mjs`) from worker-host results. It
is shared by every installation, keyed by vehicle class, and holds structured evidence from
**published** sources only.

An owner's upload is private and stays on the device (`MaintenanceKnowledgeRepository`,
`RedistributionRights` defaults to `none`). Its result therefore goes to that vehicle's own schedule
(`msource_schedules`, migration v10), not the shared catalog.

Contributing an upload's structured facts to the shared catalog needs three things:

1. the owner's explicit consent;
2. rights of at least `structured_facts_only` (`knowledge.ts` `sharingPolicy`);
3. curator review.

That path is a separate, later decision (**D-A4**).

### A1. What exists

| Step                                                | Exists             | Where                                                                                                                                           |
| --------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Pick a PDF or image, store the original with sha256 | yes                | `useBookletUpload` (`PlanSection.tsx:125`), `localStore.addDocument`, `registerMaintenanceBooklet`                                              |
| Upload becomes an M-SOURCE candidate                | yes                | `msourceLoad` uploads → `UploadDiscoveryAdapter` (`upload:<id>`, `user_upload`)                                                                 |
| PDF text on the device                              | **no**             | `service.ts:154` `pdf: null` → `EXTRACTOR_UNAVAILABLE` (`run.ts:615`)                                                                           |
| PDF text on the worker host                         | yes                | `tools/pdf-text.mjs` (pdfjs, isolated child process)                                                                                            |
| Image OCR for documents                             | **no** (port only) | `intelligence/ports.ts` `OcrProvider`; the native tesseract (heb+eng) in `providers/ocr/localLicenseOcr.ts` is plate-only and needs a dev build |
| Extraction, matching, resolution                    | yes                | M-SOURCE `sentences.ts`, tables, `matchItem`, `resolveSchedule`                                                                                 |
| Review-then-confirm pattern                         | yes                | `service/extract.tsx` (draft → review; never writes history)                                                                                    |

### A2. Pipeline

```
pick (existing) → original stored + sha256 (existing)
  → text layer
      PDF with text: PdfTextReader (device; D-A1)
      scanned PDF / photo: OcrProvider (page images → OcrDocument with per-word boxes; D-A2)
  → M-SOURCE extraction (unchanged: tables + sentences, advisory / multi-value / first-only guards)
  → document applicability (unchanged: model, years, engine code, explicit aliases only)
  → evidence records (provenance: upload id, sha256, page, locator, ≤ 30-word excerpt,
                       extractionMethod 'deterministic_parser' | 'ocr', grounded)
  → OWNER REVIEW screen: each proposed item with its page excerpt; accept / reject / edit
  → resolution (unchanged) → per-vehicle schedule → next-service engine (unchanged)
```

**Rules:**

1. **OCR text is untrusted.**
   - It runs through `wrapUntrusted` (ADR-0013).
   - A value is grounded only if it is found again at the cited page and region.
   - Characters with low OCR confidence make the item `uncertain`. Such an item cannot be accepted
     without an edit, and is never accepted silently (ADR-0017).
2. **No AI reading in this milestone.**
   - `StructuredExtractor` stays null; gate G1 applies.
   - The deterministic M-SOURCE extractors are the only readers.
3. **Owner review is required.**
   - Nothing reaches the schedule until the owner accepts the item.
   - An edited value is recorded as `user_entered`, with the original OCR value kept alongside.
4. **Applicability still applies.**
   - A booklet for another model, years or engine code is shown as such ("המסמך מתאים ל…").
   - It is not applied. The vehicle stays `VERIFIED_IDENTITY_ONLY` with that reason.
5. **Authority and labels (D-A3):**
   - Proposal: an accepted item from the owner's document is `vehicle_document`.
   - It is shown as "מתוך המסמך שהעלית", page cited.
   - It is never labelled manufacturer or importer unless the document's sha256 matches a known
     official edition (`matchOfficialEdition`).
6. **Manual entry of an interval** (no document):
   - The interval is `user_report` and always labelled "הוזן על ידך".
   - It is never mixed with document-backed intervals in corroboration counts.

### A3. Components

| Component                               | New or changed        | Notes                                                                                  |
| --------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `PdfTextReader` (device)                | new                   | D-A1: pdf.js in a WebView (free; no native module), or reading only on the worker host |
| `DocumentOcr` adapter for `OcrProvider` | new                   | D-A2: on-device tesseract (dev build) vs a cloud OCR (gate G1, paid / privacy)         |
| `run.ts` readers for uploads            | changed (config only) | `pdf` reader injected; an `image` reader through OCR                                   |
| `UploadReviewScreen`                    | new UI                | reuses the `extract.tsx` review pattern and shared components                          |
| `MSourceRepository`                     | changed               | stores the owner's decision per evidence id                                            |
| Upload outcome states                   | new strings           | `NO_TEXT`, `NO_SCHEDULE_SECTION`, `OTHER_VEHICLE`, `NEEDS_REVIEW`                      |

### A4. Acceptance

- **Synthetic tests:**
  - A synthetic text PDF yields the expected items after owner review.
  - A synthetic scanned image, through a mock OCR, does the same.
  - A booklet for another engine code is not applied.
- **Uncertain values:** an OCR value with low confidence cannot be accepted unedited.
- **Nothing before review:** no requirement exists until the owner accepts the item.
- **Privacy:** no document leaves the device unless the D-A2 choice says so, with consent.
- **No regressions:** `npm run verify` passes, and the guard tests (no vehicle-specific logic, no
  prefix matching) still pass.

## Part B: vehicle-data provider port (`VehicleDataProvider`)

The port is named `VehicleDataProvider` in `src/providers/vehicleData/`, following ADR-0004
(no `I` prefix in this codebase).

### B1. Interface

```ts
/** What the signed contract allows: enforced by the core, never by the adapter alone. */
interface ProviderContract {
  providerId: string;
  dataVersion: string;
  markets: string[]; // licensed countries, e.g. ['IL']
  consumerDisplay: boolean; // B2C display licensed
  persist: 'indefinite' | { maxDays: number } | 'none';
  vinDispatchAllowed: boolean; // true only after a signed DPA (owner decision)
  aiProcessingAllowed: boolean; // e.g. false for TecRMI GTC §1.6.6
  attribution?: string; // e.g. a required logo / text
}

interface VehicleDataProvider {
  readonly contract: ProviderContract;
  /** Provider vehicle candidates; each states its own attributes (never assumed). */
  identify(q: {
    fingerprint: VehicleFingerprint;
    vin?: SanitizedVin; // present only when contract + consent allow it
  }): Promise<
    | { status: 'found'; candidates: ProviderVehicle[] }
    | { status: 'not_found' | 'unavailable' | 'not_licensed'; reason: string }
  >;
  /** The structured schedule of ONE provider vehicle, as returned (raw kept for provenance). */
  schedule(
    ref: ProviderVehicleRef,
  ): Promise<
    | { status: 'ok'; raw: Uint8Array; items: ProviderScheduleItem[]; retrievedAt: string }
    | { status: 'unavailable' | 'not_licensed'; reason: string }
  >;
}

interface ProviderVehicle {
  ref: ProviderVehicleRef; // provider's own id (KType, carTypeId, …)
  make: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  engineCodes: string[];
  displacementCc?: number;
  fuel?: string;
  regimes?: string[]; // maintenance systems the provider distinguishes
}

interface ProviderScheduleItem {
  operationText: string; // provider's own wording
  intervalKm: number | null;
  intervalMonths: number | null;
  rule: 'whichever_first' | 'distance_only' | 'time_only' | 'inspection';
  condition: 'normal' | 'severe' | 'unspecified';
  regime?: string; // fixed / flexible / provider code
  locator: string; // path inside the raw response
}
```

`SanitizedVin` is a branded string. It can only come from `sanitizeVin`, through a consent and
contract check in the core.

### B2. How it plugs into M-SOURCE (UI and matcher core unchanged)

1. **`ProviderDiscoveryAdapter`** (one generic adapter, not one per provider):
   - It implements the existing `DiscoveryAdapter`.
   - For each registered provider, it calls `identify`, then `schedule`.
   - It turns the result into a `CachedSource`, with provenance as follows:
     - `sourceType: 'licensed_data'` (a new `SourceType`);
     - `sourceName` = provider and data version;
     - `contentSha256` of the raw response;
     - `retrievedAt`;
     - `statedApplicability` from `ProviderVehicle`, the provider's own attribute statement.
2. **Evidence:** each `ProviderScheduleItem` becomes an `EvidenceRecord` through the existing
   `canonicalOperation` / `toEvidenceRecord`. The excerpt is the provider's operation text and the
   locator is the response path.
3. **Matching is unchanged.** `matchDocument` / `matchItem` compare the provider's stated vehicle
   with the fingerprint. Engine codes match exactly or through `explicitAliases`, so a provider
   vehicle that does not match the registry facts is `NOT_APPLICABLE`.
4. **Resolution is unchanged:**
   - Provider evidence is one independent source group.
   - Conflicts with manufacturer or web evidence are kept, never averaged.
   - Grading is decision D-B2.
5. **Contract enforcement in the core** (tested once for every adapter):
   - **Storage:** the cache records `expiresAt` from `persist`. Expired provider evidence drops out
     of resolution and triggers a re-fetch. With `'none'`, nothing is stored, and the schedule is
     shown only while online.
   - **VIN:** never passed unless `vinDispatchAllowed` and the owner's consent are both true.
   - **AI:** when `aiProcessingAllowed` is false, provider evidence is never given to any AI
     component. Today none consumes evidence, and this rule keeps it that way.
   - **Display:** when `consumerDisplay` is false or the market is not licensed, the adapter
     returns `not_licensed` and nothing is shown.
   - **Attribution:** `attribution` is carried into the item's source label, which is an existing
     generic field.
6. **Where it runs (D-B1):** provider credentials must not ship in the app bundle. The adapter runs
   behind a backend proxy (worker host / edge function), which is the hosted-resource gate. The
   device sees only the proxy, with a per-user identifier where the contract requires one
   (TecRMI §3.1.2.5).

### B3. Deliverables in this milestone (no real provider)

| Item                                               | Notes                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/providers/vehicleData/types.ts`               | Port, contract, result types, `SanitizedVin` brand                                                                                                           |
| `MockVehicleDataProvider`                          | Clearly labelled SYNTHETIC data. Never reported as a real integration (ADR-0004)                                                                             |
| `ProviderDiscoveryAdapter` + contract enforcement  | Generic; no provider names in core code (guard test)                                                                                                         |
| Contract test suite                                | Every adapter must pass it: applicability mismatch → not applied; expired cache → dropped; VIN withheld without the DPA flag; `not_licensed` → nothing shown |
| `SourceType 'licensed_data'` + Hebrew source label | One string                                                                                                                                                   |

### B4. Acceptance

- **Mock provider:** for a synthetic vehicle, the mock returns a schedule that resolves through the
  unchanged matcher and resolver. The UI shows it with its attribution.
- **Wrong vehicle:** a mock vehicle with a different engine code is not applied.
- **Contract rules:** an expired cache is dropped and re-fetched. With the VIN flag off, the
  adapter never receives a VIN.
- **Isolation:** no provider-specific code outside its adapter file, enforced by a guard test.
- **Hermetic:** no network calls in tests.

## Owner decisions (2026-10-03)

- D-A1 approved: pdf.js inside a WebView.
- D-A2: on-device OCR only (ML Kit / tesseract); no cloud OCR. Low-confidence values always need the owner's confirmation.
- D-A3 approved: "Owner Vehicle Document", page cited, local to that device only.
- D-A4: out of scope. No network sharing of uploads.
- D-B1 / D-B2 approved: keep the mock-provider architecture. Provider data is never "official" without an exact, verified engine-code match.

### Decisions as proposed

| Id   | Decision                                                                                                                                                                    | Gate                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| D-A1 | Device PDF text: pdf.js in a WebView (free dependency), or worker-host reading (uploads leave the device)                                                                   | Free dependency is allowed; worker host = privacy |
| D-A2 | Image OCR: on-device tesseract (dev build, heb+eng) or a cloud OCR                                                                                                          | G1 / provider / paid / privacy                    |
| D-A3 | An owner-accepted item from their own document counts as `vehicle_document` (verified for that vehicle, page cited)                                                         | Product rule                                      |
| D-A4 | Contributing structured facts from uploads to the shared catalog (consent + rights + curator)                                                                               | Personal data / rights                            |
| D-B1 | Backend proxy for provider calls                                                                                                                                            | Hosted resource                                   |
| D-B2 | Grading of licensed provider data. Proposal: one independent group; at most STRONG unless the provider vehicle matches the engine code exactly; never "official" by default | Product rule                                      |

## Proposed order

1. A1–A4 with D-A1 = WebView pdf.js. This handles text PDFs and the owner review screen, and makes
   the fallback live for most manufacturer PDFs.
2. B1–B4: the port, mock and contract tests. These are hermetic and need no provider.
3. OCR for photos, after D-A2.
4. A real provider adapter, after the DPA + B2C licence + D-B1 are in place.

## Implementation log

### Part A, step 1: text PDFs + owner review (2026-10-03)

**Implemented:**

- **On-device PDF reader:**
  - `assets/pdfjs/pdf-reader.html`, generated by `tools/build-pdf-webview.mjs`: pdf.js 6.3.289
    legacy build plus its worker, embedded and loaded from blob: URLs.
  - CSP `default-src 'none'`: no network.
  - The page logic is shared with the worker-host reader (`tools/pdf-pages.mjs`).
- **App side:**
  - `PdfReaderHost` (hidden WebView, mounted only while reading) and `pdfBridge` (base64 chunks,
    zod-validated reply, timeouts, 25 MB limit).
  - The runner uses it for the owner's uploads only (`readers.uploadPdf`). Web PDFs are still not
    read on the phone.
- **Owner review:**
  - The runner option `holdUploadsForOwnerReview` keeps upload evidence out of automatic
    resolution.
  - `ownerProposals` turns grounded upload evidence into proposals. A document that states
    another vehicle is never proposed.
  - Decisions are stored in `msource_owner_reviews` (migration v11, local only).
  - Accepted items become `vehicle_document` requirements, page cited and owner-reviewed.
  - UI: a plan card plus the `/maintenance-review` screen.
- **`catalogData.ts`:** unchanged, and never fed by uploads.

**Verification:**

- **Real Chromium (headless Edge):** the reader page extracts the positioned text of a synthetic
  PDF sent in two base64 chunks, and its CSP blocks `fetch` and image loads.
- **Bridge:** unit tests against a fake page.
- **Owner review:** a service test (held → accept/reject → stable across re-runs → no
  cross-vehicle leakage) and an end-to-end screen test.
- **Pending:** a check on the physical Android phone (Expo Go). In headless Chromium, pdf.js ran
  on its main-thread fallback because the browser refused the blob worker; it still extracted
  correctly.

**Step 2 (2026-10-03, owner directive):**

- **Scanned PDFs:** an upload whose PDF has no text layer now shows the owner's explanatory notice, on
  the plan card and on the review screen. It never fails silently.
- **Editing before approval:**
  - The owner can correct the km, months or description of an item before approving it.
  - Migration v12 adds `edit_json`.
  - An edited item is recorded as `user_entered` by the owner, with the document's original reading
    kept in `extraction.ownerEdit`. It is labelled "מסמך הבעלים (נערך על ידי המשתמש)".
  - The document reference (page, the document's own words) is unchanged.

**Not yet:** photo OCR (D-A2).
