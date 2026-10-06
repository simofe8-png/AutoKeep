import type { ServiceTable, ServiceTableRow, TableAction, TableRule } from '@/domain';

/**
 * The maintenance table of the owner's own Ford Fiesta 2012 booklet ("תכנית טיפולים תקופתיים",
 * pages 143–144), transcribed from the owner's scan (owner decision 2026-10-06). Offered only to a
 * Ford Fiesta of model year 2012, as a proposal the owner approves — never applied by itself.
 */

const A = (a: TableAction | TableAction[]) => (Array.isArray(a) ? a : [a]);
const all = (a: TableAction | TableAction[]) => Array.from({ length: 16 }, () => A(a));

let seq = 0;
const grid = (
  group: string,
  title: string,
  cells: TableAction[][],
  footnote: number | null = null,
): ServiceTableRow => ({ id: `r${++seq}`, group, title, footnote, cells, rule: null });
const rule = (
  group: string,
  title: string,
  r: TableRule,
  footnote: number | null = null,
): ServiceTableRow => ({ id: `r${++seq}`, group, title, footnote, cells: null, rule: r });

const driveBelt = all('check');
driveBelt[7] = ['replace']; // 120,000 km / 96 months

const ENGINE = 'מנוע';
const CHASSIS = 'מערכת שלדה ומרכב';

export const FIESTA_2012_TABLE: ServiceTable = {
  kmStep: 15_000,
  monthsStep: 12,
  columns: 16,
  rows: [
    rule(ENGINE, 'מרווח שסתומים', {
      action: 'check',
      everyMonths: 60,
      everyKm: 120_000,
      text: 'בדוק כל 5 שנים או 120,000 ק״מ, כוונן במידת הצורך בדגם 1.6L Ti-VCT בלבד',
    }),
    rule(ENGINE, 'רצועת תזמון', {
      action: 'replace',
      everyMonths: 60,
      everyKm: 120_000,
      text: 'החלף כל 5 שנים או 120,000 ק״מ',
    }),
    grid(ENGINE, 'רצועת הנעה', driveBelt, 1),
    grid(ENGINE, 'שמן מנוע', all('replace'), 2),
    grid(ENGINE, 'מסנן שמן מנוע', all('replace')),
    grid('מערכת קירור', 'מערכת קירור', all('check'), 3),
    rule('מערכת קירור', 'נוזל קירור', {
      action: 'replace',
      everyMonths: 120,
      everyKm: null,
      text: 'החלף נוזל קירור כל 10 שנים',
    }),
    rule(
      'מערכת הדלק',
      'מסנן אוויר',
      {
        action: 'replace',
        everyMonths: 36,
        everyKm: 60_000,
        text: 'החלף מסנן אוויר כל 3 שנים או 60,000 ק״מ, המוקדם מביניהם, אם לא קודם',
      },
      4,
    ),
    grid('מערכת הדלק', 'צנרת דלק קשיחים וגמישים', all('check')),
    rule('מערכת הצתה', 'מצתים', {
      action: 'replace',
      everyMonths: 36,
      everyKm: 60_000,
      text: 'החלף מצתים כל 3 שנים או 60,000 ק״מ, המוקדם מביניהם, אם לא קודם',
    }),
    grid('מערכת בקרת פליטת מזהמים', 'מערכת אידוי דלק (EVAP)', all('check')),
    grid('מערכת בקרת פליטת מזהמים', 'מערכת הפליטה, מגני חום', all('check')),
    grid('מערכות חשמל', 'כמות נוזל וריכוז אלקטרוליט במצבר וחיבוריו', all('check')),
    grid('מערכות חשמל', 'כל מערכות החשמל', all('check'), 5),
    grid('מערכות חשמל', 'אורות ראשיים', all('adjust')),
    grid(CHASSIS, 'דוושת הבלם', all('check')),
    rule(
      CHASSIS,
      'נוזל בלמים',
      { action: 'replace', everyMonths: 24, everyKm: null, text: 'החלף כל שנתיים' },
      6,
    ),
    grid(CHASSIS, 'דוושת מצמד', all('check')),
    rule(
      CHASSIS,
      'נוזל מצמד',
      { action: 'replace', everyMonths: 24, everyKm: null, text: 'החלף כל שנתיים' },
      6,
    ),
    grid(CHASSIS, 'בלמים צנרת וחיבורים', all('check')),
    grid(CHASSIS, 'בלם חניה פעולה וכוונון', all('adjust')),
    grid(CHASSIS, 'מגבר בלם והצינורות הגמישים', all('check')),
    grid(CHASSIS, 'בלמי דיסק (קדמי ו/או אחורי)', all('check')),
    grid(CHASSIS, 'בלמי תוף', all('check')),
    grid(CHASSIS, 'מיכלי נוזל שטיפה', all('check')),
    grid(CHASSIS, 'מערכת היגוי ומפרקים', all('check')),
    grid(CHASSIS, 'מסבי גלגלים', all('check')),
    grid(CHASSIS, 'מתלים קדמיים ואחוריים', all('check'), 7),
    rule(CHASSIS, 'שמן תיבת הילוכים ידנית', {
      action: 'none',
      everyMonths: null,
      everyKm: null,
      text: 'ללא החלפה',
    }),
    rule(CHASSIS, 'נוזל תיבת הילוכים אוטומטית', {
      action: 'none',
      everyMonths: null,
      everyKm: null,
      text: 'ללא החלפה',
    }),
    grid(CHASSIS, 'גומיות לציריות', all('check')),
    grid(CHASSIS, 'ברגים ואומים בשלדה ובמרכב', all(['check', 'tighten'])),
    grid(CHASSIS, 'מצב מרכב (חלודה, קורוזיה כללי)', all('check')),
    grid(CHASSIS, 'צמיגים + רזרבי (מצב הצמיג ולחץ אוויר)', all('check')),
    grid(CHASSIS, 'צירים, תפסים ומנעולים', all(['check', 'lube'])),
    grid(CHASSIS, 'נסיעת מבחן', all('check')),
    grid('מערכת מיזוג אוויר', 'מדחס מזגן', all('check')),
    grid('מערכת מיזוג אוויר', 'מסנן מזגן', all('replace')),
  ],
  footnotes: [
    { n: 1, text: 'בדוק את רצועה/ות האביזרים של המנוע לייבוש, חריצים וחופש.' },
    { n: 2, text: 'החלף שמן מנוע ומסנן שמן בתדירות גבוהה יותר אם הרכב מופעל בתנאים קשים.' },
    {
      n: 3,
      text: 'אם הרכב מופעל בתנאים קשים, בדוק צנרת וחיבורים לנזק, שפשוף ודליפות בתדירות גבוהה יותר.',
    },
    { n: 4, text: 'אם הרכב פועל בתנאים מאובקים וחוליים, בדוק והחלף בתדירות גבוהה יותר.' },
    { n: 5, text: 'בדוק את תפקוד מערכות החשמל (תאורה, נורות אזהרה, מגבים וכו׳).' },
    {
      n: 6,
      text: 'אם מערכת הבלמים ברכב מופעלת באופן מוגבר יחסית (למשל נסיעה באזור הררי), החלף את נוזל הבלמים בתדירות גבוהה יותר (אחת לשנה).',
    },
    {
      n: 7,
      text: 'במידה והרכב מופעל בתנאי עבודה מיוחדים, בדוק בתדירות גבוהה יותר את המתלה הקדמי והאחורי.',
    },
  ],
};

/** A Ford Fiesta of model year 2012 (the booklet's vehicle). */
export function isFiesta2012(v: { manufacturer: string; model: string; year: number }): boolean {
  return v.year === 2012 && /פורד|ford/i.test(v.manufacturer) && /fiesta|פיאסטה/i.test(v.model);
}
