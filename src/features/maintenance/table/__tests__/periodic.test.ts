import type { IsoDate } from '@/domain';
import { tablePlan, type TableDone } from '@/engine/serviceTable';

import { FIESTA_2012_TABLE } from '../fiesta2012';

const d = (s: string) => s as IsoDate;
const table = FIESTA_2012_TABLE;
const ruleRow = (title: string) => table.rows.find((r) => r.title === title)!.id;

describe('periodic services from the owner’s table', () => {
  it('next = the table column for its km; due at that km or 12 months after the last service', () => {
    const plan = tablePlan({
      table,
      odometerKm: 158_300,
      today: d('2026-10-06'),
      done: [{ kind: 'periodic', serviceNo: 10, rowId: null, km: 150_400, date: d('2026-03-10') }],
    });
    expect(plan.next.n).toBe(11);
    expect(plan.next.km).toBe(165_000);
    expect(plan.next.dueDate).toBe('2027-03-10');
    expect(plan.next.remainingKm).toBe(6_700);
    expect(plan.next.status).toBe('later');
    expect(plan.after.km).toBe(180_000);
    expect(plan.after.dueDate).toBe('2028-03-10');
    // Column "165": oil and filters replaced, headlights adjusted, bolts checked and tightened.
    const oil = plan.next.items.find((i) => i.title === 'שמן מנוע');
    expect(oil?.actions).toEqual(['replace']);
    expect(plan.next.items.find((i) => i.title === 'אורות ראשיים')?.actions).toEqual(['adjust']);
    expect(plan.next.items.find((i) => i.title.startsWith('ברגים'))?.actions).toEqual([
      'check',
      'tighten',
    ]);
    // Rule rows are never cells.
    expect(plan.next.items.some((i) => i.title === 'נוזל בלמים')).toBe(false);
  });

  it('the drive belt is replaced at 120,000 — and again at 360,000 (the table starts over)', () => {
    const at = (n: number) =>
      tablePlan({
        table,
        odometerKm: n * 15_000 - 100,
        today: d('2026-10-06'),
        done: [],
      }).next.items.find((i) => i.title === 'רצועת הנעה')!.actions;
    expect(at(8)).toEqual(['replace']);
    expect(at(9)).toEqual(['check']);
    expect(at(24)).toEqual(['replace']);
  });

  it('without a recorded service: the next column after the odometer, and no invented date', () => {
    const plan = tablePlan({ table, odometerKm: 158_300, today: d('2026-10-06'), done: [] });
    expect(plan.next.km).toBe(165_000);
    expect(plan.next.dueDate).toBeNull();
    expect(plan.next.remainingDays).toBeNull();
    expect(plan.lastPeriodic).toBeNull();
  });

  it('overdue by distance or by time', () => {
    const done: TableDone[] = [
      { kind: 'periodic', serviceNo: 10, rowId: null, km: 150_000, date: d('2025-01-01') },
    ];
    expect(
      tablePlan({ table, odometerKm: 158_000, today: d('2026-10-06'), done }).next.status,
    ).toBe('overdue');
    expect(
      tablePlan({ table, odometerKm: 166_000, today: d('2025-06-01'), done }).next.status,
    ).toBe('overdue');
    expect(
      tablePlan({ table, odometerKm: 164_000, today: d('2025-06-01'), done }).next.status,
    ).toBe('soon');
  });

  it('rule items count from when they were last done; unknown stays unknown', () => {
    const plan = tablePlan({
      table,
      odometerKm: 158_300,
      today: d('2026-10-06'),
      done: [
        { kind: 'periodic', serviceNo: 10, rowId: null, km: 150_000, date: d('2026-03-10') },
        {
          kind: 'rule',
          serviceNo: null,
          rowId: ruleRow('נוזל בלמים'),
          km: 140_000,
          date: d('2025-02-01'),
        },
        {
          kind: 'rule',
          serviceNo: null,
          rowId: ruleRow('מצתים'),
          km: 120_000,
          date: d('2024-05-01'),
        },
        {
          kind: 'rule',
          serviceNo: null,
          rowId: ruleRow('רצועת תזמון'),
          km: 150_000,
          date: d('2026-03-10'),
        },
      ],
    });
    const next = plan.next.rules.map((r) => r.title);
    // Brake fluid: every 2 years from 2025-02 → 2027-02, before the next service's 2027-03-10.
    expect(next).toContain('נוזל בלמים');
    // Plugs: 120,000 + 60,000 = 180,000 km, or 2027-05 → the service after.
    expect(next).not.toContain('מצתים');
    expect(plan.after.rules.map((r) => r.title)).toContain('מצתים');
    // Timing belt: 2031 / 270,000 → in neither.
    expect([...next, ...plan.after.rules.map((r) => r.title)]).not.toContain('רצועת תזמון');
    // Never recorded: listed as unknown (no invented due), "ללא החלפה" never.
    const unknown = plan.rulesUnknown.map((r) => r.title);
    expect(unknown).toEqual(
      expect.arrayContaining(['מרווח שסתומים', 'נוזל קירור', 'מסנן אוויר', 'נוזל מצמד']),
    );
    expect(unknown).not.toContain('שמן תיבת הילוכים ידנית');
  });
});
