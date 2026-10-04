import { isoDate, type IsoDate } from '@/domain';
import type { ManualScheduleItem } from '@/persistence';

import { buildMaintenancePlan, taskCompletionId } from '../knowledge/plan';
import { isCustom, manualLastDone, manualRequirement, tableToRows } from '../manualSchedule';

/** The owner's own schedule items (owner decision 2026-10-04). SYNTHETIC values. */

const TODAY = isoDate('2026-10-04') as IsoDate;
describe("tableToRows (the owner's table)", () => {
  const row = (title: string, km = '', months = '', key = title) => ({ key, title, km, months });

  it('item / every km / every months; an empty row is ignored; a suggestion keeps its task', () => {
    expect(
      tableToRows([
        row('שמן מנוע ומסנן שמן', '15,000', '12'),
        row('', '', '', 'empty'),
        row('נוזל בלמים', '', '24'),
        row('שימון צירים', '5000'),
        row('בדיקת לחץ אוויר', '', '1'),
      ]),
    ).toEqual({
      ok: true,
      rows: [
        {
          task: 'engine_oil',
          action: 'replacement',
          title: 'שמן מנוע ומסנן שמן',
          intervalKm: 15000,
          intervalMonths: 12,
        },
        {
          task: 'brake_fluid',
          action: 'replacement',
          title: 'נוזל בלמים',
          intervalKm: null,
          intervalMonths: 24,
        },
        {
          task: 'custom',
          action: 'replacement',
          title: 'שימון צירים',
          intervalKm: 5000,
          intervalMonths: null,
        },
        {
          task: 'custom',
          action: 'inspection',
          title: 'בדיקת לחץ אוויר',
          intervalKm: null,
          intervalMonths: 1,
        },
      ],
    });
  });

  it('a row needs a name and every km and / or months; values in range', () => {
    expect(tableToRows([row('שמן', '', '')])).toEqual({
      ok: false,
      errors: { שמן: { interval: true } },
    });
    expect(tableToRows([row('', '15000', '', 'k')])).toEqual({
      ok: false,
      errors: { k: { title: true } },
    });
    expect(tableToRows([row('שמן', '50', '300')])).toEqual({
      ok: false,
      errors: { שמן: { km: true, months: true } },
    });
  });
});

describe('the owner item in the plan', () => {
  const item = (over: Partial<ManualScheduleItem> = {}): ManualScheduleItem => ({
    id: 'm1',
    vehicleId: 'v1',
    task: 'engine_oil',
    action: 'replacement',
    title: 'שמן מנוע',
    intervalKm: 10000,
    intervalMonths: 12,
    lastDoneDate: '2026-06-01',
    lastDoneKm: 30000,
    ...over,
  });
  const plan = (items: ManualScheduleItem[], history: { km: number; date: string }[] = []) =>
    buildMaintenancePlan({
      vehicle: { id: 'v1', kind: 'car', manufacturer: 'Synthcar', model: 'Alpha', year: 2019 },
      profile: null,
      requirements: [],
      history: history.map((h, i) => ({
        id: `s${i}`,
        date: h.date as IsoDate,
        odometerKm: h.km,
        actions: [
          {
            performed: true,
            maintenanceItemId: taskCompletionId('v1', 'engine_oil', 'replacement'),
          },
        ],
      })),
      readings: [{ date: TODAY, km: 35000 }],
      today: TODAY,
      manual: items.map((m) => ({
        id: m.id,
        custom: isCustom(m),
        requirement: manualRequirement(m, m.title, TODAY),
        lastDone: manualLastDone(m),
      })),
    });

  it("due from the last time the owner stated; labelled as the owner's", () => {
    const p = plan([item()]);
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ level: 'O', manualId: 'm1', task: 'engine_oil' });
    expect(p.items[0].due).toMatchObject({ nextKm: 40000, nextDate: '2027-06-01' });
  });

  it('a recorded service later than the stated one moves the item on', () => {
    const p = plan([item()], [{ km: 36000, date: '2026-09-01' }]);
    expect(p.items[0].due).toMatchObject({ nextKm: 46000, nextDate: '2027-09-01' });
  });

  it('a custom item is tracked on its own, beside a known one', () => {
    const p = plan([
      item(),
      item({
        id: 'm2',
        task: 'custom',
        title: 'שימון צירים',
        intervalKm: null,
        intervalMonths: 6,
        lastDoneKm: null,
      }),
    ]);
    expect(p.items.map((i) => i.requirement.taskText)).toEqual(['שמן מנוע', 'שימון צירים']);
    expect(new Set(p.items.map((i) => i.completionId)).size).toBe(2);
  });
});
