import {
  asId,
  createSchedule,
  isoDate,
  newMeta,
  type DeferredItem,
  type IsoDate,
  type MaintenanceInterval,
  type MaintenanceSchedule,
  type OdometerReading,
  type ServiceEvent,
} from '@/domain';
import { sequentialIds, T0 } from '@/domain/testing';

import { computeMaintenance, drivingRate, type EngineInput, type ItemDue } from '../maintenance';

const ids = sequentialIds(1000);
const vehicleId = asId<'Vehicle'>('00000000-0000-4000-8000-0000000000aa');
const OIL = asId<'MaintenanceItem'>('00000000-0000-4000-8000-00000000a001');
const BRAKES = asId<'MaintenanceItem'>('00000000-0000-4000-8000-00000000a002');
const COOLANT = asId<'MaintenanceItem'>('00000000-0000-4000-8000-00000000a003');

const ref = { sourceId: asId<'Source'>('00000000-0000-4000-8000-00000000cccc'), page: 412 };
const item = (id: typeof OIL, title: string) => ({
  id,
  title,
  actionType: 'replacement' as const,
  manufacturerText: title,
  reference: ref,
});

function schedule(
  intervals: Omit<MaintenanceInterval, 'id'>[],
  verified = true,
): MaintenanceSchedule {
  const r = createSchedule(
    {
      vehicleId,
      intervals: intervals.map((i) => ({ ...i, id: ids.next() })),
      evidence: [{ authority: 'manufacturer', exactApplicability: verified }],
      applicability: { matchedOn: ['model'], exact: verified },
    },
    ids,
    T0,
  );
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
}

const oilEvery15k12m = (): Omit<MaintenanceInterval, 'id'> => ({
  label: 'Oil',
  rule: 'earliest_of',
  everyKm: 15000,
  everyMonths: 12,
  items: [item(OIL, 'שמן מנוע')],
});

function service(
  date: string,
  km: number,
  performed: { id: typeof OIL | null; done: boolean; title?: string }[],
): ServiceEvent {
  return {
    id: ids.next(),
    vehicleId,
    date: isoDate(date),
    odometerKm: km,
    garageName: null,
    notes: null,
    origin: 'manual',
    actions: performed.map((p) => ({
      id: ids.next(),
      title: p.title ?? 'x',
      actionType: 'replacement',
      performed: p.done,
      maintenanceItemId: p.id,
      unlisted: p.id === null,
    })),
    documentIds: [],
    extractionId: null,
    authority: 'user_report',
    verification: { state: 'unverified', evidence: [], decidedAt: T0 },
    confirmedAt: T0,
    ...newMeta(T0),
  };
}

function reading(date: string, km: number): OdometerReading {
  return {
    id: ids.next(),
    vehicleId,
    valueKm: km,
    measuredAt: isoDate(date),
    source: 'user',
    ...newMeta(T0),
  };
}

function run(over: Partial<EngineInput>) {
  const r = computeMaintenance({
    today: isoDate('2026-09-25'),
    schedule: schedule([oilEvery15k12m()]),
    history: [],
    readings: [reading('2026-09-10', 84250)],
    deferred: [],
    ...over,
  });
  if (r.status !== 'computed') throw new Error(`not computed: ${r.reason}`);
  return r;
}
const byItem = (r: ReturnType<typeof run>, id: typeof OIL): ItemDue =>
  r.items.find((i) => i.item.id === id)!;

describe('schedule gate', () => {
  it('no schedule / unverified schedule → no professional recommendations', () => {
    const base = { today: isoDate('2026-09-25'), history: [], readings: [], deferred: [] };
    expect(computeMaintenance({ ...base, schedule: null })).toEqual({
      status: 'schedule_unavailable',
      reason: 'no_schedule',
    });
    expect(computeMaintenance({ ...base, schedule: schedule([oilEvery15k12m()], false) })).toEqual({
      status: 'schedule_unavailable',
      reason: 'not_verified',
    });
  });
});

describe('T095/T096/T097 mileage, time and earliest-of', () => {
  it('from the last service: due km and due date, both remainders, status ok', () => {
    const r = run({ history: [service('2025-12-10', 75120, [{ id: OIL, done: true }])] });
    expect(byItem(r, OIL)).toMatchObject({
      basis: 'last_service',
      dueKm: 90120,
      dueDate: '2026-12-10',
      remainingKm: 5870,
      remainingDays: 76,
      status: 'ok',
    });
  });

  it('time limit reached first (low mileage driver) → overdue by time', () => {
    const r = run({
      history: [service('2025-08-01', 80000, [{ id: OIL, done: true }])],
      readings: [reading('2026-09-10', 84250)],
    });
    expect(byItem(r, OIL)).toMatchObject({
      dueKm: 95000,
      dueDate: '2026-08-01',
      status: 'overdue',
    });
    expect(byItem(r, OIL).remainingDays).toBeLessThan(0);
    expect(byItem(r, OIL).remainingKm).toBeGreaterThan(0);
  });

  it('distance limit reached first (high mileage driver) → overdue by distance', () => {
    const r = run({
      history: [service('2026-06-01', 69000, [{ id: OIL, done: true }])],
      readings: [reading('2026-09-20', 84500)],
    });
    expect(byItem(r, OIL)).toMatchObject({ dueKm: 84000, remainingKm: -500, status: 'overdue' });
  });

  it('upcoming within the km or day window', () => {
    const km = run({
      history: [service('2026-01-01', 70000, [{ id: OIL, done: true }])],
      readings: [reading('2026-09-20', 84000)],
    });
    expect(byItem(km, OIL)).toMatchObject({ remainingKm: 1000, status: 'upcoming' });
    const days = run({ history: [service('2025-10-10', 80000, [{ id: OIL, done: true }])] });
    expect(byItem(days, OIL)).toMatchObject({ remainingDays: 15, status: 'upcoming' });
  });

  it('distance_only and time_only rules use a single dimension', () => {
    const s = schedule([
      { label: 'Brakes', rule: 'distance_only', everyKm: 20000, items: [item(BRAKES, 'בלמים')] },
      {
        label: 'Coolant',
        rule: 'time_only',
        everyMonths: 24,
        items: [item(COOLANT, 'נוזל קירור')],
      },
    ]);
    const r = run({
      schedule: s,
      history: [
        service('2025-01-15', 70000, [
          { id: BRAKES, done: true },
          { id: COOLANT, done: true },
        ]),
      ],
    });
    expect(byItem(r, BRAKES)).toMatchObject({ dueKm: 90000, dueDate: null, remainingDays: null });
    expect(byItem(r, COOLANT)).toMatchObject({
      dueKm: null,
      dueDate: '2027-01-15',
      remainingKm: null,
    });
  });

  it('month arithmetic clamps to month end (Jan 31 + 1 month)', () => {
    const s = schedule([
      { label: 'X', rule: 'time_only', everyMonths: 1, items: [item(OIL, 'x')] },
    ]);
    const r = run({
      schedule: s,
      today: isoDate('2026-02-01'),
      history: [service('2026-01-31', 1000, [{ id: OIL, done: true }])],
      readings: [],
    });
    expect(byItem(r, OIL).dueDate).toBe('2026-02-28');
  });
});

describe('no history: honest baselines', () => {
  it('first-service values apply to a new vehicle', () => {
    const s = schedule([
      {
        label: 'First',
        rule: 'earliest_of',
        everyKm: 15000,
        everyMonths: 12,
        firstAtKm: 1000,
        firstAtMonths: 1,
        items: [item(OIL, 'x')],
      },
    ]);
    const r = run({
      schedule: s,
      readings: [reading('2026-09-20', 400)],
      inServiceDate: isoDate('2026-09-01'),
    });
    expect(byItem(r, OIL)).toMatchObject({
      basis: 'first_service',
      dueKm: 1000,
      dueDate: '2026-10-01',
      remainingKm: 600,
      status: 'upcoming',
    });
  });

  it('without history: next schedule milestone, never "overdue", time unknown without in-service date', () => {
    const r = run({});
    expect(byItem(r, OIL)).toMatchObject({
      basis: 'schedule_milestone',
      dueKm: 90000,
      remainingKm: 5750,
      historyMissing: true,
      timeUnknown: true,
      dueDate: null,
    });
    expect(byItem(r, OIL).status).not.toBe('overdue');
  });

  it('with an in-service date the next time milestone is computed', () => {
    const r = run({ inServiceDate: isoDate('2019-03-15') });
    expect(byItem(r, OIL)).toMatchObject({ timeUnknown: false, dueDate: '2027-03-15' });
  });
});

describe('T098 history reconciliation', () => {
  it('uses the latest performed, id-linked action only', () => {
    const r = run({
      history: [
        service('2025-06-01', 60000, [{ id: OIL, done: true }]),
        service('2026-03-01', 78000, [{ id: OIL, done: false }]), // not performed
        service('2026-05-01', 80000, [{ id: null, done: true, title: 'שמן מנוע' }]), // unlisted, same title
        service('2025-12-10', 75120, [{ id: OIL, done: true }]),
      ],
    });
    expect(byItem(r, OIL).lastPerformed).toMatchObject({ date: '2025-12-10', odometerKm: 75120 });
  });
});

describe('T101 deferred items', () => {
  const deferral = (at: string, resolved: string | null = null): DeferredItem => ({
    id: ids.next(),
    vehicleId,
    maintenanceItemId: OIL,
    deferredAt: isoDate(at),
    serviceEventId: null,
    reason: 'נדחה',
    resolvedByServiceEventId: resolved as DeferredItem['resolvedByServiceEventId'],
    ...newMeta(T0),
  });

  it('an open deferral makes the item due now', () => {
    const r = run({
      history: [service('2025-12-10', 75120, [{ id: OIL, done: false }])],
      deferred: [deferral('2025-12-10')],
    });
    expect(byItem(r, OIL)).toMatchObject({ basis: 'deferred', status: 'overdue' });
  });

  it('a later service that performs the item closes the deferral', () => {
    const r = run({
      history: [service('2026-02-01', 76000, [{ id: OIL, done: true }])],
      deferred: [deferral('2025-12-10')],
    });
    expect(byItem(r, OIL).basis).toBe('last_service');
  });
});

describe('T100 driving-rate forecast', () => {
  it('forecast is a separately typed value with its basis', () => {
    const r = run({
      history: [service('2025-12-10', 75120, [{ id: OIL, done: true }])],
      readings: [reading('2026-03-10', 78000), reading('2026-09-10', 84250)],
    });
    expect(r.drivingRate).toMatchObject({ kind: 'forecast', basis: { readings: 3 } });
    const f = byItem(r, OIL).kmDueForecast!;
    expect(f.kind).toBe('forecast');
    // Rate: 9,130 km over 274 days = 33.32 km/day. 5,870 km left → ceil(176.2) = 177 days after 2026-09-10.
    expect(f.value).toBe('2027-03-06');
  });

  it('no forecast from insufficient data', () => {
    expect(drivingRate([{ date: isoDate('2026-09-01'), km: 100 }], 30)).toBeNull();
    expect(
      drivingRate(
        [
          { date: isoDate('2026-09-01'), km: 100 },
          { date: isoDate('2026-09-10'), km: 500 },
        ],
        30,
      ),
    ).toBeNull();
    expect(
      drivingRate(
        [
          { date: isoDate('2026-01-01'), km: 500 },
          { date: isoDate('2026-09-10'), km: 500 },
        ],
        30,
      ),
    ).toBeNull();
  });
});

describe('T099 next service & odometer staleness', () => {
  it('bundles items due close together into one visit, most urgent first', () => {
    const s = schedule([
      oilEvery15k12m(),
      { label: 'Brakes', rule: 'distance_only', everyKm: 30000, items: [item(BRAKES, 'בלמים')] },
      { label: 'Coolant', rule: 'distance_only', everyKm: 60000, items: [item(COOLANT, 'נוזל')] },
    ]);
    const r = run({
      schedule: s,
      history: [
        service('2025-12-10', 75120, [{ id: OIL, done: true }]),
        service('2025-12-10', 75120, [{ id: BRAKES, done: false }]),
        service('2024-01-01', 60500, [
          { id: BRAKES, done: true },
          { id: COOLANT, done: true },
        ]),
      ],
    });
    expect(r.next?.items.map((i) => i.item.id)).toEqual([OIL, BRAKES]);
    expect(r.next).toMatchObject({ dueKm: 90120, status: 'ok' });
  });

  it('flags a stale odometer reading', () => {
    const r = run({ readings: [reading('2026-06-02', 18420)] });
    expect(r.odometer).toMatchObject({ km: 18420, stale: true, ageDays: 115 });
  });

  it('is deterministic and does not mutate its input', () => {
    const input: EngineInput = {
      today: isoDate('2026-09-25'),
      schedule: schedule([oilEvery15k12m()]),
      history: [service('2025-12-10', 75120, [{ id: OIL, done: true }])],
      readings: [reading('2026-09-10', 84250)],
      deferred: [],
    };
    const snapshot = JSON.stringify(input);
    expect(computeMaintenance(input)).toEqual(computeMaintenance(input));
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('never produces NaN across generated inputs', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let n = 0; n < 200; n++) {
      const km = Math.floor(rnd() * 300000);
      const day = (d: number) =>
        isoDate(new Date(Date.UTC(2020, 0, 1) + d * 86400000).toISOString().slice(0, 10));
      const r = computeMaintenance({
        today: day(2000),
        schedule: schedule([oilEvery15k12m()]),
        history:
          rnd() > 0.5
            ? [
                service(day(Math.floor(rnd() * 1900)), Math.floor(km * rnd()), [
                  { id: OIL, done: true },
                ]),
              ]
            : [],
        readings: [reading(day(1990), km)],
        deferred: [],
        inServiceDate: rnd() > 0.5 ? day(0) : null,
      });
      expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity|null,"dueDate":"Invalid/);
    }
  });
});

// Keep the IsoDate import used for readability in helpers above.
export type _Unused = IsoDate;
