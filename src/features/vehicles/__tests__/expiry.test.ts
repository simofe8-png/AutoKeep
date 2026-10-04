import { expiryStatus, parseUserDate, toUserDate } from '../expiry';

/** Test / insurance expiry (owner decision 2026-10-04): days left and the warning tone. */
describe('expiryStatus', () => {
  it('days left, soon within 30 days, expired once passed', () => {
    expect(expiryStatus('2026-12-30', '2026-10-04')).toEqual({ days: 87, tone: 'ok' });
    expect(expiryStatus('2026-11-03', '2026-10-04')).toEqual({ days: 30, tone: 'soon' });
    expect(expiryStatus('2026-10-04', '2026-10-04')).toEqual({ days: 0, tone: 'soon' });
    expect(expiryStatus('2026-09-29', '2026-10-04')).toEqual({ days: -5, tone: 'expired' });
  });
});

describe('parseUserDate', () => {
  it('reads DD.MM.YYYY, DD/MM/YYYY and YYYY-MM-DD; empty clears; nonsense is invalid', () => {
    expect(parseUserDate('30.12.2026')).toBe('2026-12-30');
    expect(parseUserDate('3/1/2027')).toBe('2027-01-03');
    expect(parseUserDate('2027-01-03')).toBe('2027-01-03');
    expect(parseUserDate('  ')).toBeNull();
    expect(parseUserDate('31.02.2027')).toBeUndefined();
    expect(parseUserDate('next year')).toBeUndefined();
    expect(toUserDate('2026-12-30')).toBe('30.12.2026');
  });
});
