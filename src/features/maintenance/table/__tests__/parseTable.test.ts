import { lettersOf } from '@/domain';

import { FIESTA_2012_TABLE, isFiesta2012 } from '../fiesta2012';
import {
  cleanTitle,
  fitStep,
  parseFootnotes,
  parseRule,
  parseTablePages,
  type RawTablePage,
} from '../parseTable';
import scan from './fiesta-scan.json';

describe('reading the owner’s booklet table (Ford Fiesta 2012 scan, pages 143–144)', () => {
  const parsed = parseTablePages(scan as RawTablePage[]);

  it('finds the shape: every 15,000 km / 12 months, 16 columns, all 38 items', () => {
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.table.kmStep).toBe(15_000);
    expect(parsed.table.monthsStep).toBe(12);
    expect(parsed.table.columns).toBe(16);
    expect(parsed.table.rows).toHaveLength(FIESTA_2012_TABLE.rows.length);
    // Rule rows are rule rows, grid rows are grid rows, in the booklet's order.
    expect(parsed.table.rows.map((r) => r.rule != null)).toEqual(
      FIESTA_2012_TABLE.rows.map((r) => r.rule != null),
    );
  });

  it('every cell either matches the booklet or is marked for the owner to check', () => {
    if (!parsed.ok) throw new Error(parsed.reason);
    const missed: string[] = [];
    let flaggedWrong = 0;
    parsed.table.rows.forEach((row, i) => {
      const truth = FIESTA_2012_TABLE.rows[i];
      if (!row.cells || !truth.cells) return;
      row.cells.forEach((cell, k) => {
        if (lettersOf(cell) === lettersOf(truth.cells![k])) return;
        if (parsed.unsure.includes(`${row.id}:${k}`)) flaggedWrong++;
        else missed.push(`${truth.title}:${k}`);
      });
    });
    // Every misread cell of the scan is marked for the owner; none is wrong without a mark.
    expect(missed).toEqual([]);
    expect(flaggedWrong).toBeGreaterThan(0);
  });

  it('rule rows are always for the owner to check', () => {
    if (!parsed.ok) throw new Error(parsed.reason);
    const rules = parsed.table.rows.filter((r) => r.rule);
    expect(rules.map((r) => parsed.unsure.includes(r.id))).toEqual(rules.map(() => true));
    // "ללא החלפה" is read as such.
    expect(rules.filter((r) => r.rule!.action === 'none')).toHaveLength(2);
  });

  it('keeps the booklet footnotes by number', () => {
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.table.footnotes.map((f) => f.n)).toEqual(expect.arrayContaining([3, 4, 5]));
  });
});

describe('table parsing rules', () => {
  it('the interval is what most header columns agree on; misreads never set it', () => {
    expect(fitStep(['15', '30', '45', '0', '75', '0', '108', '120'])).toBe(15);
    expect(fitStep(['12', '4', '6', '48', '0', '72'])).toBe(12);
    expect(fitStep(['15', '7', '0'])).toBeNull();
  });

  it('cleans footnote markers out of item names', () => {
    expect(cleanTitle('רצועת הנעה )1%(')).toEqual({ title: 'רצועת הנעה', footnote: 1 });
    expect(cleanTitle("מערכת קירור ('3)")).toEqual({ title: 'מערכת קירור', footnote: 3 });
    expect(cleanTitle('מסנן אוויר (*4)')).toEqual({ title: 'מסנן אוויר', footnote: 4 });
    expect(cleanTitle('מתלים קדמים ואחורים (*)').title).toBe('מתלים קדמים ואחורים');
  });

  it('reads rules written across the columns', () => {
    expect(parseRule('החלף כל שנתיים')).toMatchObject({ action: 'replace', everyMonths: 24 });
    expect(parseRule('בדוק כל 5 שנים או 120,000 ק"מ')).toMatchObject({
      action: 'check',
      everyMonths: 60,
      everyKm: 120_000,
    });
    expect(parseRule('ללא החלפה')).toMatchObject({ action: 'none' });
  });

  it('joins footnote lines and drops the page number', () => {
    expect(parseFootnotes(['*1) בדוק את הרצועה', 'וחופש.', '144'])).toEqual([
      { n: 1, text: 'בדוק את הרצועה וחופש.' },
    ]);
  });

  it('the transcribed table is offered to a Ford Fiesta 2012 only', () => {
    expect(isFiesta2012({ manufacturer: 'פורד גרמניה', model: 'FIESTA', year: 2012 })).toBe(true);
    expect(isFiesta2012({ manufacturer: 'פורד גרמניה', model: 'FIESTA', year: 2013 })).toBe(false);
    expect(isFiesta2012({ manufacturer: 'מאזדה', model: 'FIESTA', year: 2012 })).toBe(false);
  });
});
