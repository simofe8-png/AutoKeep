import { sanitizeVin } from '../vin';

// VIN values are altered (no real vehicle).
describe('sanitizeVin', () => {
  it('keeps a well-formed 17-character VIN, upper-cased and without separators', () => {
    expect(sanitizeVin('VSSZZZ6JZCR000001')).toBe('VSSZZZ6JZCR000001');
    expect(sanitizeVin(' vsszzz6jzcr000001 ')).toBe('VSSZZZ6JZCR000001');
    expect(sanitizeVin('VSS-ZZZ6JZ CR000001')).toBe('VSSZZZ6JZCR000001');
  });

  it('never repairs or completes a value that is not a VIN', () => {
    expect(sanitizeVin('••••0001')).toBeUndefined();
    expect(sanitizeVin('VSSZZZ6JZCR00000')).toBeUndefined(); // 16
    expect(sanitizeVin('VSSZZZ6JZCR0000011')).toBeUndefined(); // 18
    expect(sanitizeVin('VSSZZZ6JZCR00000O')).toBeUndefined(); // O is not in the alphabet
    expect(sanitizeVin('VSSZZZ6JZCI000001')).toBeUndefined(); // I
    expect(sanitizeVin('')).toBeUndefined();
    expect(sanitizeVin(null)).toBeUndefined();
    expect(sanitizeVin(undefined)).toBeUndefined();
  });
});
