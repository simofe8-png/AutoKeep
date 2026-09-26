import {
  daysBetween,
  type AlertBasis,
  type AlertKind,
  type DeferredItem,
  type IsoDate,
  type MaintenanceSchedule,
  type OdometerReading,
} from '@/domain';

import { DEFAULT_THRESHOLDS, type EngineResult } from './maintenance';

/**
 * Alert candidates (M13 wiring, extended in M17). Pure: derives the alerts the CURRENT data
 * justifies. Each candidate has a stable `key` so a persisted alert keeps its identity/status
 * (handled, snoozed) while its condition holds; when the condition changes the key changes.
 * Maintenance alerts exist only for a verified, computed schedule (never invented).
 */

export interface AlertCandidate {
  key: string;
  kind: AlertKind;
  basis: AlertBasis;
}

export interface AlertInput {
  today: IsoDate;
  result: EngineResult;
  schedule: MaintenanceSchedule | null;
  deferred: readonly DeferredItem[];
  latestReading: OdometerReading | null;
  staleOdometerDays?: number;
}

type Facts = AlertBasis['facts'];

/** Drops null/undefined so facts stay `Record<string, number | string>`. */
function facts(entries: Record<string, number | string | null | undefined>): Facts {
  const out: Facts = {};
  for (const [k, v] of Object.entries(entries)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

export function alertCandidates(input: AlertInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  const { result, schedule } = input;

  if (result.status === 'computed' && schedule && result.next && result.next.status !== 'ok') {
    const next = result.next;
    const first = next.items[0];
    const last = next.items.find((i) => i.lastPerformed)?.lastPerformed ?? null;
    const kind: AlertKind = next.status === 'overdue' ? 'overdue' : 'upcoming';
    const key = `${kind}:${first.intervalId}:${next.dueKm ?? ''}:${next.dueDate ?? ''}`;
    out.push({
      key,
      kind,
      basis: {
        scheduleId: schedule.id,
        intervalId: first.intervalId,
        maintenanceItemId: first.item.id,
        odometerReadingId: input.latestReading?.id,
        lastServiceEventId: last?.serviceEventId,
        facts: facts({
          key,
          label: next.label,
          // How the lead item's due point was established (e.g. an open deferral).
          dueBasis: first.basis,
          dueKm: next.dueKm,
          dueDate: next.dueDate,
          remainingKm: next.remainingKm,
          remainingDays: next.remainingDays,
          lastDate: last?.date,
          lastKm: last?.odometerKm,
          odometerKm: result.odometer?.km,
          odometerDate: result.odometer?.measuredAt,
        }),
      },
    });
  }

  for (const d of input.deferred) {
    if (d.resolvedByServiceEventId) continue;
    const key = `deferred:${d.id}`;
    out.push({
      key,
      kind: 'deferred',
      basis: {
        deferredItemId: d.id,
        maintenanceItemId: d.maintenanceItemId,
        lastServiceEventId: d.serviceEventId ?? undefined,
        facts: facts({ key, deferredAt: d.deferredAt, reason: d.reason }),
      },
    });
  }

  const r = input.latestReading;
  const staleDays = input.staleOdometerDays ?? DEFAULT_THRESHOLDS.staleOdometerDays;
  if (r) {
    const ageDays = daysBetween(r.measuredAt, input.today);
    if (ageDays > staleDays) {
      const key = `stale_odometer:${r.id}`;
      out.push({
        key,
        kind: 'stale_odometer',
        basis: {
          odometerReadingId: r.id,
          facts: facts({ key, odometerKm: r.valueKm, odometerDate: r.measuredAt, ageDays }),
        },
      });
    }
  }
  return out;
}
