import { asId, newMeta, type Alert } from '@/domain';
import { T0 } from '@/domain/testing';
import { planAlerts, type AlertCandidate } from '@/engine/alerts';
import { emptyBundle } from '@/features/data/DataContext';
import type { AlertVM, VehicleDataBundle } from '@/features/data/types';
import type { VehicleSummary } from '@/features/vehicles/types';

import { outOfQuietHours, planNotifications } from '../notificationPlan';

const vehicleId = asId<'Vehicle'>('00000000-0000-4000-8000-0000000000aa');

function alert(key: string, status: Alert['status'], snoozedUntil: string | null = null): Alert {
  return {
    id: asId<'Alert'>(`00000000-0000-4000-8000-${key.padStart(12, '0')}`),
    vehicleId,
    kind: 'stale_odometer',
    status,
    basis: { facts: { key } },
    raisedAt: T0,
    snoozedUntil: snoozedUntil as Alert['snoozedUntil'],
    ...newMeta(T0),
  };
}
const cand = (key: string): AlertCandidate => ({
  key,
  kind: 'stale_odometer',
  basis: { facts: { key } },
});

describe('alert lifecycle (T126)', () => {
  it('creates new, resolves cleared, reactivates expired snoozes, leaves handled alone', () => {
    const plan = planAlerts(
      [
        alert('1', 'active'), // condition still holds → untouched
        alert('2', 'active'), // condition cleared → resolved
        alert('3', 'handled'), // user handled it while the condition holds → stays handled
        alert('4', 'deferred', '2026-09-20'), // snooze over, still justified → active again
        alert('5', 'deferred', '2026-10-20'), // still snoozed → untouched
      ],
      [cand('1'), cand('3'), cand('4'), cand('5'), cand('6')],
      '2026-09-26' as never,
    );
    expect(plan.create.map((c) => c.key)).toEqual(['6']);
    expect(plan.resolve.map((a) => a.basis.facts.key)).toEqual(['2']);
    expect(plan.reactivate.map((a) => a.basis.facts.key)).toEqual(['4']);
  });
});

const moto: VehicleSummary = {
  id: 'v-moto',
  kind: 'motorcycle',
  manufacturer: 'הונדה',
  model: 'CB500F',
  year: 2021,
  registration: '123-45-678',
  odometerKm: 18420,
  odometerMeasuredAt: '2026-06-02',
  archived: false,
};

function vm(p: Partial<AlertVM>): AlertVM {
  return {
    id: 'a1',
    vehicleId: 'v-moto',
    kind: 'upcoming',
    title: 'טיפול מתקרב',
    reason: 'נותרו 800 ק״מ',
    basis: 'x',
    createdAt: '2026-09-26',
    handled: false,
    ...p,
  };
}

function bundle(alerts: AlertVM[], dueDate?: string): VehicleDataBundle {
  return {
    ...emptyBundle(),
    alerts,
    schedule: {
      status: 'verified',
      upcoming: [],
      next: dueDate
        ? { title: 't', intervalLabel: 'i', status: 'upcoming', items: [], dueDate }
        : undefined,
    },
  };
}

describe('notification plan (T130)', () => {
  it('never schedules in quiet hours', () => {
    expect(outOfQuietHours(new Date(2026, 8, 26, 23, 30)).toString()).toBe(
      new Date(2026, 8, 27, 9, 0).toString(),
    );
    expect(outOfQuietHours(new Date(2026, 8, 26, 6, 0)).getHours()).toBe(9);
    expect(outOfQuietHours(new Date(2026, 8, 26, 14, 5)).getHours()).toBe(14);
  });

  it('one notice per new alert, a week-before reminder for a dated upcoming service, vehicle named', () => {
    const now = new Date(2026, 8, 26, 10, 0);
    const raisedAt = new Date(2026, 8, 26, 10, 0).toISOString();
    const plan = planNotifications(
      [moto],
      () => bundle([vm({ raisedAt })], '2026-10-20'),
      new Date(now.getTime() - 1),
    );
    expect(plan.map((p) => p.key)).toEqual(['a1:raised', 'a1:week-before']);
    expect(plan[0].title).toMatch(/הונדה CB500F 2021/);
    expect(plan[0].url).toBe('/alerts/a1');
    expect(plan[1].at.toString()).toBe(new Date(2026, 9, 13, 9, 0).toString());
  });

  it('is idempotent over time: a delivered (past) notice is not scheduled again', () => {
    const raisedAt = new Date(2026, 8, 20, 10, 0).toISOString();
    const plan = planNotifications(
      [moto],
      () => bundle([vm({ raisedAt })]),
      new Date(2026, 8, 26, 10, 0),
    );
    expect(plan).toEqual([]);
  });

  it('handled alerts and archived vehicles get no notifications', () => {
    const raisedAt = new Date(2030, 0, 1, 10, 0).toISOString();
    const now = new Date(2026, 8, 26);
    expect(planNotifications([moto], () => bundle([vm({ raisedAt, handled: true })]), now)).toEqual(
      [],
    );
    expect(
      planNotifications([{ ...moto, archived: true }], () => bundle([vm({ raisedAt })]), now),
    ).toEqual([]);
  });
});
