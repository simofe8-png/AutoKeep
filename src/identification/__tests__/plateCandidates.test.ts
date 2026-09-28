import { extractPlateCandidates, type OcrTextLine } from '../plateCandidates';

const L = (...texts: string[]): OcrTextLine[] => texts.map((text) => ({ text, confidence: 0.8 }));

/** SYNTHETIC lines only (no real license data). */
describe('registration-number candidates from OCR lines', () => {
  it('a dashed 2-3-2 plate is a single strong candidate', () => {
    const r = extractPlateCandidates(L('רישיון רכב', 'מספר רכב 12-345-67', 'שנת ייצור 2012'));
    expect(r).toMatchObject({ kind: 'single', plate: '1234567' });
  });

  it('a dashed 3-2-3 plate, OCR spacing around the dashes, and the Hebrew maqaf', () => {
    expect(extractPlateCandidates(L('123 - 45 - 678'))).toMatchObject({
      kind: 'single',
      plate: '12345678',
    });
    expect(extractPlateCandidates(L('12־345־67'))).toMatchObject({ plate: '1234567' });
  });

  it('a bare run is strong only next to a plate label', () => {
    expect(extractPlateCandidates(L("מס' רכב", '1234567'))).toMatchObject({
      kind: 'single',
      plate: '1234567',
    });
    expect(extractPlateCandidates(L('1234567'))).toEqual({
      kind: 'ambiguous',
      candidates: [{ plate: '1234567', strength: 'weak', occurrences: 1 }],
    });
  });

  it('never proposes an ID number, a date, a VIN fragment or a year/displacement', () => {
    const r = extractPlateCandidates(
      L(
        '123456789', // 9-digit ID-like run
        'תוקף 12.03.2027',
        'מספר שלדה VSSZZZ6JZCR1221180',
        'שנת ייצור 2012 נפח 1390',
        'WVWZZZ1234567', // digits inside an alphanumeric token
      ),
    );
    expect(r).toEqual({ kind: 'none' });
  });

  it('owner / ID / address lines are ignored even if they contain a plate-shaped number', () => {
    expect(extractPlateCandidates(L('ת.ז. 12-345-67', 'כתובת 123-45-678'))).toEqual({
      kind: 'none',
    });
  });

  it('one letter confused for a digit yields only a weak candidate', () => {
    expect(extractPlateCandidates(L('12-3O5-67'))).toEqual({
      kind: 'ambiguous',
      candidates: [{ plate: '1230567', strength: 'weak', occurrences: 1 }],
    });
    // Two confusions: not a candidate at all.
    expect(extractPlateCandidates(L('I2-3O5-67'))).toEqual({ kind: 'none' });
  });

  it('two different strong plates are ambiguous; repeats are counted', () => {
    const r = extractPlateCandidates(L('12-345-67', '12-345-67', '76-543-21'));
    expect(r).toEqual({
      kind: 'ambiguous',
      candidates: [
        { plate: '1234567', strength: 'strong', occurrences: 2 },
        { plate: '7654321', strength: 'strong', occurrences: 1 },
      ],
    });
  });

  it('nothing recognizable → none (manual entry fallback)', () => {
    expect(extractPlateCandidates([])).toEqual({ kind: 'none' });
    expect(extractPlateCandidates(L('רישיון רכב', '---'))).toEqual({ kind: 'none' });
  });
});
