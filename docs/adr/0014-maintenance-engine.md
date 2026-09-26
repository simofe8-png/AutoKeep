# ADR-0014: Deterministic maintenance engine

- Status: accepted
- Date: 2026-09-26

## Decision

`src/engine/maintenance.ts` is a pure function `computeMaintenance(input)`: no I/O, no clock (`today` injected), and deterministic. Purity is enforced by lint.

- **Gate:** it only uses a schedule whose domain verification is `verified`. Otherwise it returns `schedule_unavailable` (no professional recommendations).
- **Per item:**
  - due km = last _performed, id-linked_ service + `everyKm` (T095);
  - due date = last service date + `everyMonths`, with month-end clamping (T096);
  - `earliest_of`: whichever limit is reached first sets the status (T097).
- **Reconciliation (T098):** only performed actions linked to the manufacturer item count. Unlisted actions with a similar title never do.
- **Baselines without history:**
  - first-service values if the schedule defines them;
  - otherwise the next schedule milestone above the current odometer.
  - With no history, time is unknown unless an in-service date is known (e.g. from the registry). Missing history is **never** reported as `overdue`: absence of records isn't evidence of skipped maintenance.
- **Deferred (T101):** an open deferral makes the item due now, until a later service performs it.
- **Forecast (T100):** km/day from dated readings and services (at least 30 days of span, positive distance), returned as a `Forecast<T>` with its basis. It's never merged into facts, and the UI labels it צפי.
- **Next service (T099):** the most urgent item, with items due within 1,500 km / 45 days bundled into one garage visit.
- **Odometer:** readings older than 60 days are flagged `stale`.

## Consequences

The engine is fully fixture-tested (19 tests, including randomized NaN checks). M13 adapters map its output to the frozen UI view-models.
