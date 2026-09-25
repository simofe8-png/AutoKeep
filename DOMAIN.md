# AutoKeep Domain Model

Derived from AUTOKEEP_V1_SPEC.md §21 and MASTER_EXECUTION.md core invariants. The code lives in `src/domain`.

## Entities

| Entity               | Scope          | Notes                                                                                              |
| -------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| LocalProfile / User  | device/account | Local identity before an account exists; adopted on account creation (M08)                         |
| Vehicle              | owner          | type: `car` \| `motorcycle` \| `scooter`; lifecycle: `active` \| `archived`                        |
| VehicleIdentifier    | vehicle_id     | registration number, VIN; masked in UI (last 4 visible)                                            |
| OdometerReading      | vehicle_id     | value + unit + measuredAt + source; independent per vehicle                                        |
| Document             | vehicle_id     | original file (immutable) + kind (manual, schedule, invoice, registration, other)                  |
| DerivedExtraction    | document_id    | OCR/AI output, separate from the original; status draft/validated                                  |
| Source               | global/vehicle | authority: manufacturer \| official_importer \| vehicle_document \| garage_document \| user_report |
| SourceReference      | fact → source  | page / section / table locator                                                                     |
| VerificationRecord   | fact           | state: `verified` \| `pending` \| `unable_to_verify` (internal: `conflicting`, `unverified`)       |
| MaintenanceSchedule  | vehicle_id     | verified only when evidence-backed with exact applicability                                        |
| MaintenanceInterval  | schedule       | distance and/or time; earliest-of semantics defined by manufacturer                                |
| MaintenanceItem      | schedule       | actionType: `inspection` \| `replacement` \| `other`; SourceReference required                     |
| ServiceEvent         | vehicle_id     | date, odometer, garage?, notes?, origin (manual / document-confirmed)                              |
| ServiceAction        | service_event  | performed: boolean; actionType independent; optional link to MaintenanceItem; unlisted allowed     |
| GarageRecommendation | vehicle_id     | never becomes a manufacturer requirement                                                           |
| Alert                | vehicle_id     | upcoming \| overdue \| deferred \| stale_odometer; explainable basis                               |
| SyncOperation        | entity         | stable id, version, status                                                                         |
| DossierSnapshot      | vehicle_id     | generated from source-of-truth data, not a competing history                                       |

## Invariants

1. Every vehicle-scoped record has a non-null `vehicle_id`. Queries require it.
2. `performed` (checkbox) and `actionType` are independent fields.
3. User-reported facts never become `verified` without independent evidence.
4. A MaintenanceSchedule without verified evidence produces no professional recommendations. The engine reports `schedule_unavailable`.
5. Forecast values are typed `Forecast<T>` and rendered with `צפי`.
6. Extraction output can only create drafts. Confirmed ServiceEvents require an explicit user confirmation command.
7. Archive sets lifecycle state and deletes nothing. Permanent delete is a separate command that requires confirmation.
8. The engine never emits "healthy". The empty result is "no maintenance tasks currently identified".
