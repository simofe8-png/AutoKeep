# Source adapter specification (M-SOURCE)

Code: `src/discovery/maintenance/adapters/`. Contract tests: `adapters/__tests__/contract.test.ts`.

## What an adapter is

An adapter speaks to one **kind of document system**, never to a vehicle model. Everything
system-specific is **registry data** (`SourceSystem.discovery.entryPoints`):

- URLs with `{model}`, `{modelSlug}`, `{model-slug}`, `{year}` and `{locale}` placeholders;
- link patterns;
- JSON field paths.

Adding a manufacturer or a model never changes adapter code. The UI never sees adapter logic; it
receives normalized results and standard failure codes.

| Adapter id        | Document system                                          | Configuration                                                      |
| ----------------- | -------------------------------------------------------- | ------------------------------------------------------------------ |
| `listing`         | Static HTML listings and XML sitemaps (A, B)             | `{ kind: 'listing', url, follow?, depth?, documents? }`            |
| `url-template`    | Direct document URL patterns (B, C)                      | `{ kind: 'template', url, locales? }`                              |
| `json-manual-api` | Public JSON manual listings (A, B, C)                    | `{ kind: 'json_api', url, items, model, year?, document, title? }` |
| `restricted`      | Type D systems (login, form, JS-only, nothing published) | none: the reason comes from `discovery.mechanism`                  |

`adapterFor(system)` uses `system.adapterId` when it is set; otherwise it derives the adapter from
the entry points. Type D systems always use `restricted`.

## Interface

```ts
interface SourceAdapter {
  readonly id: string;
  findDocuments(run: { system; vehicle; ctx }): Promise<AdapterResult>;
}
type AdapterResult =
  | { status: 'documents'; documents: DocumentRef[]; notes: string[] }
  | {
      status: 'failed';
      failure: AdapterFailureCode;
      detail: string;
      userAction?: UserSourceAction;
    };
interface DocumentRef {
  sourceSystemId;
  url;
  title;
  category;
  modelMatch: 'exact' | 'variant' | 'unstated'; // from the SOURCE's own metadata
  statedYears?: { from; to }; // stated by the source, never inferred
  versionHint?: { etag?; lastModified?; size? };
}
```

`runAdapter(system, vehicle, ctx)` is the only entry point. It never throws: an adapter error
becomes `OTHER`.

## Responsibilities

| Responsibility                     | Where                                                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source discovery                   | `candidateSystems(identity)` (`registry/universe.ts`) orders the systems by runtime priority                                                             |
| Model / year selection             | The adapter, from the source's own listing metadata (`linkNamesVehicle`, JSON `model` / `year` fields). A template-built URL is `modelMatch: 'unstated'` |
| Document discovery                 | The adapter                                                                                                                                              |
| Metadata resolution                | `DocumentRef`, then the document profile read from the document itself (`classify.ts`)                                                                   |
| Fingerprint / version              | The pipeline: sha256 of the bytes → `documentVersions.ts`                                                                                                |
| Maintenance-section targeting      | `findMaintenanceSections` (`classify.ts`)                                                                                                                |
| Retrieval only when policy permits | `acquire` (`automatedFetchAllowed`), after the pipeline checks `automatedExtractionAllowed`                                                              |
| Failure classification             | Standard codes, below                                                                                                                                    |

## Policy gate

Before an adapter reads anything, `accessDecision(url, ctx, activity)` checks the source system's
policy dimension for that activity, then robots.txt:

- `listing` and `json-manual-api` pages → `discoveryAllowed`;
- `url-template` documents → `automatedFetchAllowed`.

Only `ALLOWED` permits the activity. When it is blocked, **no request is made**; the contract
tests assert zero network calls. If the owner has approved the system as an authority, the result
carries a `userAction`: the official page the user may open themselves.

## Failure codes (deterministic)

| Code                          | Produced when                                                                                                                                               |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NO_DIGITAL_SOURCE`           | No registered system, no entry point, or a D system that publishes nothing                                                                                  |
| `AUTH_REQUIRED`               | HTTP 401/403, a login wall or bot wall, or a D system with a `login` mechanism                                                                              |
| `MODEL_YEAR_NOT_LISTED`       | The model is listed only for other years; only a differently named model is listed; no document for the model; or the document never states its model years |
| `VARIANT_AMBIGUOUS`           | The document does not name this exact model, or model / generation / transmission is unresolved                                                             |
| `ENGINE_AMBIGUOUS`            | An engine code / family / displacement / powertrain dimension is unresolved                                                                                 |
| `MARKET_AMBIGUOUS`            | The market dimension is unresolved                                                                                                                          |
| `PDF_PARSE_FAILURE`           | Text extraction failed, or there is no text layer                                                                                                           |
| `MAINTENANCE_TABLE_NOT_FOUND` | No maintenance section, or a section with no readable atomic requirement                                                                                    |
| `TERMS_OR_RIGHTS_BLOCK`       | The policy dimension is `NOT_ALLOWED`, or robots.txt disallows                                                                                              |
| `POLICY_UNKNOWN`              | The policy dimension is `UNKNOWN`                                                                                                                           |
| `PERMISSION_REQUIRED`         | The policy dimension is `REQUIRES_PERMISSION`, or the system is not yet approved as an authority                                                            |
| `SOURCE_UNAVAILABLE`          | HTTP 5xx, a network error, not a document, too large, or a JavaScript-only listing                                                                          |
| `OTHER`                       | Adapter error, conflicting evidence, an unknown regime or usage                                                                                             |

The mapping from access blocks is `failureOfBlock` (a total function, tested). The pipeline and
the coverage engine use the same codes (`FailureClass = AdapterFailureCode`).
