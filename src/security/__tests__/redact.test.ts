import { redact, safeErrorText } from '../redact';

describe('PII redaction (T164)', () => {
  it('keeps only the last four characters of VINs and registration numbers', () => {
    const out = redact('vin JM1BP0000L0000001 plate 12-345-67 and 123-45-678, raw 7393810');
    expect(out).not.toMatch(/JM1BP|12-345|123-45|7393810/);
    expect(out).toMatch(/0001/);
    expect(out).toMatch(/4567/);
    expect(out).toMatch(/5678/);
    expect(out).toMatch(/3810/);
  });

  it('removes emails and phone numbers', () => {
    const out = redact('owner@example.com called 054-1234567 or +972 3 123 4567');
    expect(out).toBe('[email] called [phone] or [phone]');
  });

  it('leaves ordinary numbers (km, years, dates) readable', () => {
    expect(redact('84,250 km in 2026-09-26, year 2019')).toBe('84,250 km in 2026-09-26, year 2019');
  });

  it('turns any error into bounded, redacted text', () => {
    const e = new Error(`lookup failed for ${'x'.repeat(500)} owner@example.com`);
    const t = safeErrorText(e);
    expect(t.length).toBeLessThanOrEqual(300);
    expect(t).not.toMatch(/owner@example\.com/);
  });
});
