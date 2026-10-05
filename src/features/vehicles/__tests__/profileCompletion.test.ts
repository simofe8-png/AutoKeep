import { profileCompletion } from '../profileCompletion';

/** "השלמת פרופיל הרכב" (owner decision 2026-10-05). SYNTHETIC values. */

describe('profile completion', () => {
  const none = { hasSchedule: false, hasPhoto: false };

  it('a car with the registry test: details, odometer, schedule, insurance count', () => {
    const c = profileCompletion({ testUntil: '2027-10-01', testSource: 'registry' }, none);
    expect(c.items.map((i) => i.key)).toEqual([
      'details',
      'odometer',
      'schedule',
      'insurance',
      'pressure',
      'photo',
    ]);
    expect(c.percent).toBe(50);
    expect(c.complete).toBe(false);
  });

  it('no registry test (two-wheelers): the test is an item of its own', () => {
    const c = profileCompletion({}, none);
    expect(c.items.find((i) => i.key === 'test')).toMatchObject({ done: false, required: true });
    expect(c.percent).toBe(40);
  });

  it('optional items never lower the percentage; required ones complete it', () => {
    const c = profileCompletion(
      {
        testUntil: '2027-10-01',
        testSource: 'registry',
        insurance: { compulsoryUntil: '2027-08-31' },
      },
      { hasSchedule: true, hasPhoto: false },
    );
    expect(c).toMatchObject({ percent: 100, complete: true });
    expect(c.items.filter((i) => !i.done).map((i) => i.key)).toEqual(['pressure', 'photo']);
  });
});
