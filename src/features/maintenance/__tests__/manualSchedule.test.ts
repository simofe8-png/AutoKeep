import { isoDate, type IsoDate } from '@/domain';
import { parseUserDate } from '@/features/vehicles/expiry';
import type { ManualScheduleItem } from '@/persistence';

import { buildMaintenancePlan, taskCompletionId } from '../knowledge/plan';
import {
  isCustom,
  manualLastDone,
  manualRequirement,
  validateManualItem,
  type ManualItemForm,
} from '../manualSchedule';

/** The owner's own schedule items (owner decision 2026-10-04). SYNTHETIC values. */

const TODAY = isoDate('2026-10-04') as IsoDate;
const form = (over: Partial<ManualItemForm> = {}): ManualItemForm => ({
  task: 'engine_oil',
  title: '',
  action: 'replacement',
  km: '10,000',
  months: '12',
  lastDate: '01.06.2026',
  lastKm: '30000',
  ...over,
});
const valid = (f: ManualItemForm) => validateManualItem(f, TODAY, parseUserDate);

describe('validateManualItem', () => {
  it('a full entry: interval and last done parsed', () => {
    expect(valid(form())).toEqual({
      ok: true,
      value: {
        task: 'engine_oil',
        action: 'replacement',
        title: '',
        intervalKm: 10000,
        intervalMonths: 12,
        lastDoneDate: '2026-06-01',
        lastDoneKm: 30000,
      },
    });
  });

  it('requires an item, a name for a custom item, and km and / or months', () => {
    expect(valid(form({ task: null }))).toMatchObject({ ok: false, errors: { task: true } });
    expect(valid(form({ task: 'custom' }))).toMatchObject({ ok: false, errors: { title: true } });
    expect(valid(form({ km: '', months: '' }))).toMatchObject({
      ok: false,
      errors: { interval: true },
    });
    expect(valid(form({ km: '50', months: '300' }))).toMatchObject({
      ok: false,
      errors: { km: true, months: true },
    });
  });

  it('"last done" is optional, but states what the interval counts from; never in the future', () => {
    expect(valid(form({ lastDate: '', lastKm: '' })).ok).toBe(true);
    expect(valid(form({ lastDate: '' }))).toMatchObject({ errors: { lastDate: true } });
    expect(valid(form({ lastKm: '' }))).toMatchObject({ errors: { lastKm: true } });
    expect(valid(form({ months: '', lastDate: '' })).ok).toBe(true);
    expect(valid(form({ lastDate: '01.01.2027' }))).toMatchObject({ errors: { lastDate: true } });
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
