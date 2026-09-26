import type { AlertVM, VehicleDataBundle } from '@/features/data/types';
import { vehicleDisplayName, type VehicleSummary } from '@/features/vehicles/types';
import { he } from '@/i18n/he';

/**
 * T130: which local notifications should exist — a pure function of the current alerts, so
 * reconciling (cancel all + schedule this plan) is idempotent and never re-fires a reminder:
 * every notification has a deterministic time, and times in the past are simply not scheduled.
 */

export interface PlannedNotification {
  /** Stable id (alert id + purpose). */
  key: string;
  title: string;
  body: string;
  /** Local fire time. */
  at: Date;
  /** Deep link: opens the alert, which switches to its vehicle (T131). */
  url: string;
}

export const QUIET_START_HOUR = 21;
export const QUIET_END_HOUR = 9;
export const UPCOMING_REMINDER_DAYS = 7;

/** Moves a time out of quiet hours (21:00–09:00) to the next 09:00. */
export function outOfQuietHours(t: Date): Date {
  const d = new Date(t);
  if (d.getHours() >= QUIET_START_HOUR) {
    d.setDate(d.getDate() + 1);
    d.setHours(QUIET_END_HOUR, 0, 0, 0);
  } else if (d.getHours() < QUIET_END_HOUR) {
    d.setHours(QUIET_END_HOUR, 0, 0, 0);
  }
  return d;
}

function localDate(iso: string, hour: number): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0, 0);
}

function activeAlerts(bundle: VehicleDataBundle): AlertVM[] {
  return bundle.alerts.filter((a) => !a.handled);
}

export function planNotifications(
  vehicles: readonly VehicleSummary[],
  getBundle: (vehicleId: string) => VehicleDataBundle,
  now: Date,
): PlannedNotification[] {
  const out: PlannedNotification[] = [];
  for (const v of vehicles) {
    if (v.archived) continue;
    const bundle = getBundle(v.id);
    for (const a of activeAlerts(bundle)) {
      const url = `/alerts/${a.id}`;
      const title = `${vehicleDisplayName(v)} · ${he.alerts.kinds[a.kind]}`;
      // 1) Once, shortly after the alert was raised (moved out of quiet hours).
      const raised = a.raisedAt ? new Date(a.raisedAt) : localDate(a.createdAt, QUIET_END_HOUR);
      out.push({
        key: `${a.id}:raised`,
        title,
        body: a.title,
        at: outOfQuietHours(new Date(raised.getTime() + 60_000)),
        url,
      });
      // 2) An upcoming service with a known date: a reminder a week before it.
      const dueDate = a.kind === 'upcoming' ? bundle.schedule.next?.dueDate : undefined;
      if (dueDate) {
        const r = localDate(dueDate, QUIET_END_HOUR);
        r.setDate(r.getDate() - UPCOMING_REMINDER_DAYS);
        out.push({ key: `${a.id}:week-before`, title, body: a.reason, at: r, url });
      }
    }
  }
  return out.filter((n) => n.at.getTime() > now.getTime());
}
