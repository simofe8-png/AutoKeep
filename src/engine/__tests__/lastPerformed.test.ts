import type { IsoDate, ServiceTable } from '@/domain';

import { matchItem, type HistoryItemEvent } from '../lastPerformed';
import { tablePlan, type TableDone } from '../serviceTable';

/**
 * History → latest performed event → maintenance due (2026-10-12): a performed history action that
 * names an item is its latest event; deleting a record falls back to the previous one; a recently
 * replaced item is not recommended again before its own interval.
 */

const d = (s: string) => s as IsoDate;
const TODAY = d('2026-10-12');

// 15,000 km / 12 months per column; the air filter is replaced every second column (30,000 km).
const table: ServiceTable = {
  kmStep: 15_000,
  monthsStep: 12,
  columns: 4,
  footnotes: [],
  rows: [
    {
      id: 'air',
      group: 'מנוע',
      title: 'מסנן אוויר',
      footnote: null,
      cells: [[], ['replace'], [], ['replace']],
      rule: null,
    },
    {
      id: 'oil',
      group: 'מנוע',
      title: 'שמן מנוע',
      footnote: null,
      cells: [['replace'], ['replace'], ['replace'], ['replace']],
      rule: null,
    },
    {
      id: 'brake',
      group: 'בלמים',
      title: 'נוזל בלמים',
      footnote: null,
      cells: null,
      rule: { action: 'replace', everyMonths: 24, everyKm: null, text: 'החלף כל שנתיים' },
    },
  ],
};

const ev = (
  eventId: string,
  date: string,
  km: number,
  title: string,
  actionType: HistoryItemEvent['actionType'] = 'replacement',
): HistoryItemEvent => ({ eventId, date: d(date), km, title, actionType });

const plan = (history: HistoryItemEvent[], done: TableDone[] = [], odometerKm = 296_000) =>
  tablePlan({ table, odometerKm, today: TODAY, done, history });

describe('matching a history action to an item', () => {
  const titles = ['שמן', 'שמן מנוע', 'מסנן אוויר'];
  it('equal titles, the table suffix, or the item inside the title; the longest item wins', () => {
    expect(matchItem('מסנן אוויר', titles)).toBe(2);
    expect(matchItem('שמן מנוע — החלף', titles)).toBe(1);
    expect(matchItem('החלפת שמן מנוע ומסנן', titles)).toBe(1);
    expect(matchItem('בדיקת שמן', titles)).toBe(0);
  });
  it('a partial word never matches (nothing is guessed)', () => {
    expect(matchItem('מסנן אווירה', titles)).toBeNull();
    expect(matchItem('מצבר', titles)).toBeNull();
  });
});

describe('a recently replaced scheduled item', () => {
  it('replaced at 295,000 km is not recommended again at 300,000 km', () => {
    const before = plan([]);
    expect(before.next.km).toBe(300_000);
    expect(before.next.items.map((i) => i.rowId)).toContain('air');

    const after = plan([ev('e1', '2026-09-01', 295_000, 'החלפת מסנן אוויר')]);
    expect(after.next.items.map((i) => i.rowId)).not.toContain('air');
    expect(after.next.recent).toEqual([
      expect.objectContaining({
        rowId: 'air',
        dueKm: 325_000,
        lastDone: expect.objectContaining({ km: 295_000, source: 'history', eventId: 'e1' }),
      }),
    ]);
    // The oil (every column) was not replaced: still recommended.
    expect(after.next.items.map((i) => i.rowId)).toContain('oil');
  });

  it('is recommended again once its interval is reached', () => {
    const p = plan([ev('e1', '2026-09-01', 295_000, 'מסנן אוויר')], [], 329_000);
    expect(p.next.km).toBe(330_000);
    expect(p.next.items.map((i) => i.rowId)).toContain('air');
  });

  it('an inspection does not count as a replacement', () => {
    const p = plan([ev('e1', '2026-09-01', 295_000, 'מסנן אוויר', 'inspection')]);
    expect(p.next.items.map((i) => i.rowId)).toContain('air');
  });
});

describe('rule items take their latest event from history', () => {
  it('history answers "when was it last done": no question asked', () => {
    expect(plan([]).rulesUnknown.map((r) => r.rowId)).toEqual(['brake']);
    const p = plan([ev('e1', '2025-11-01', 280_000, 'נוזל בלמים — החלף')]);
    expect(p.rulesUnknown).toEqual([]);
    // Due 24 months after the recorded replacement, counted from history.
    expect(p.next.rules.concat(p.after.rules)).toEqual([
      expect.objectContaining({
        rowId: 'brake',
        dueDate: '2027-11-01',
        lastDone: expect.objectContaining({ eventId: 'e1', source: 'history' }),
      }),
    ]);
  });

  it('the latest of several records wins; deleting it falls back to the previous one', () => {
    const older = ev('e1', '2024-01-10', 250_000, 'נוזל בלמים');
    const newer = ev('e2', '2026-01-10', 290_000, 'נוזל בלמים');
    const withBoth = plan([older, newer], [], 296_000);
    const rulesOf = (p: ReturnType<typeof plan>) => [...p.next.rules, ...p.after.rules];
    // Latest: 2026-01-10 → due 2028-01-10.
    expect(withBoth.rulesUnknown).toEqual([]);
    expect(rulesOf(withBoth)).toEqual([
      expect.objectContaining({
        dueDate: '2028-01-10',
        lastDone: expect.objectContaining({ eventId: 'e2' }),
      }),
    ]);
    // Without the newer record, 2024-01-10 + 24 months is already due.
    const fallback = plan([older], [], 296_000);
    expect(rulesOf(fallback)).toEqual([
      expect.objectContaining({
        rowId: 'brake',
        dueDate: '2026-01-10',
        lastDone: expect.objectContaining({ eventId: 'e1', source: 'history' }),
      }),
    ]);
  });

  it('a manual date and history never diverge silently: the latest wins, with its source', () => {
    const manual: TableDone = {
      kind: 'rule',
      serviceNo: null,
      rowId: 'brake',
      km: null,
      date: d('2024-06-01'),
    };
    const hist = ev('e1', '2025-01-01', 270_000, 'נוזל בלמים');
    const rules = (p: ReturnType<typeof plan>) => [...p.next.rules, ...p.after.rules];
    expect(rules(plan([hist], [manual]))[0]?.lastDone).toMatchObject({ source: 'history' });
    const newerManual = { ...manual, date: d('2025-06-01') };
    expect(rules(plan([hist], [newerManual]))[0]?.lastDone).toMatchObject({
      source: 'manual',
      date: '2025-06-01',
    });
  });
});
