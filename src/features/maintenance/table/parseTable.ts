import {
  actionsFromLetters,
  DEFAULT_TABLE_SHAPE,
  type ServiceTable,
  type ServiceTableRow,
  type TableAction,
  type TableRule,
} from '@/domain';

/**
 * Turns what the on-device reader found on the owner's booklet pages (tools/ocr/table-reader.js:
 * cells' text by position) into a table PROPOSAL for the owner's review. Deterministic; nothing is
 * guessed silently — every cell or rule the reading was not sure of is listed in `unsure`, and the
 * owner approves the whole table before it counts.
 */

export interface RawTableRow {
  group: string;
  label: string[];
  data: (string | null)[];
  merged: string | null;
  numbers?: boolean;
  unsure?: number[];
}

export interface RawTablePage {
  dataColumns: number;
  rtl: boolean;
  rows: RawTableRow[];
  below: string[];
}

export type ParsedTable =
  | {
      ok: true;
      table: ServiceTable;
      /** "rowId:column" of cells, or "rowId" of rules, the owner should check. */
      unsure: string[];
    }
  | { ok: false; reason: 'no_table' | 'no_intervals' };

const num = (s: string | null) => (s && /^\d+$/.test(s) ? Number(s) : null);

/** The step v / (k+1) most columns agree on (the header row of 15, 30, 45… or 12, 24, 36…). */
export function fitStep(values: (string | null)[]): number | null {
  const votes = new Map<number, number>();
  values.forEach((v, k) => {
    const n = num(v);
    if (n == null || n <= 0 || n % (k + 1) !== 0) return;
    const step = n / (k + 1);
    votes.set(step, (votes.get(step) ?? 0) + 1);
  });
  let best: number | null = null;
  let bestN = 0;
  for (const [step, n] of votes) {
    if (n > bestN) {
      best = step;
      bestN = n;
    }
  }
  // At least three columns must agree (a misread number never sets the interval).
  return bestN >= 3 ? best : null;
}

const FOOTNOTE = /[(（)]\s*['`*%°]?\s*\*?\s*(\d)\s*['`*%°]?\s*\*?\s*[)(（]/;

/** "רצועת הנעה )1%(" → title "רצועת הנעה", footnote 1. */
export function cleanTitle(raw: string): { title: string; footnote: number | null } {
  let footnote: number | null = null;
  let t = raw.replace(FOOTNOTE, (_m, d: string) => {
    footnote = Number(d);
    return ' ';
  });
  // A marker read without its digit ("(*)") or as a stray digit at the end.
  t = t.replace(/[(（]\s*\*\s*[)）]/g, ' ').replace(/\s+\d$/, ' ');
  t = t.replace(/[‎‏]/g, '').replace(/\s+/g, ' ').trim();
  return { title: t, footnote };
}

const WORD_ACTIONS: [RegExp, TableAction][] = [
  [/בד[וי]?ק/, 'check'],
  [/החל[ףפ]|הח.?ף/, 'replace'],
  [/כוונ/, 'adjust'],
  [/נק[הי]/, 'clean'],
  [/חז[קן]/, 'tighten'],
  [/סו[ךכ]|שימון|סיכה/, 'lube'],
];

/** A rule written across the columns, as far as the reading allows (always reviewed). */
export function parseRule(text: string): TableRule {
  const t = text.replace(/[‎‏]/g, '');
  if (/ללא|ל.?א\s*ו?ה?ח.?ל/.test(t)) {
    return { action: 'none', everyMonths: null, everyKm: null, text: t };
  }
  const found = WORD_ACTIONS.map(([re, a]) => ({ a, at: t.search(re) }))
    .filter((x) => x.at >= 0)
    .sort((x, y) => x.at - y.at);
  const action: TableAction = found[0]?.a ?? 'replace';
  let everyMonths: number | null = null;
  const years = /(\d{1,2})\s*(?:שנ|ש')/.exec(t);
  if (/שנתיים/.test(t)) everyMonths = 24;
  else if (years) everyMonths = Number(years[1]) * 12;
  else if (/כל\s*שנה/.test(t)) everyMonths = 12;
  const months = /(\d{1,3})\s*חודש/.exec(t);
  if (months) everyMonths = Number(months[1]);
  const km = /(\d{1,3})[,.](\d{3})(?!\d)/.exec(t);
  const everyKm = km ? Number(km[1] + km[2]) : null;
  return { action, everyMonths, everyKm, text: t };
}

/** Footnotes under the table: "1*) …", "(*2 …", continuation lines joined. */
export function parseFootnotes(lines: string[]): { n: number; text: string }[] {
  const out: { n: number; text: string }[] = [];
  for (const raw of lines) {
    const line = raw.replace(/[‎‏]/g, '').trim();
    if (!line || /^\d{1,4}$/.test(line) || /CamScanner|נסרק/.test(line)) continue;
    const m = /^[(*°'\s]*(\d)\s*[*°'%]*\s*[)(]?\s*(.*)$/.exec(line);
    if (m && m[2] && !out.some((f) => f.n === Number(m[1]))) {
      out.push({ n: Number(m[1]), text: m[2].trim() });
    } else if (out.length) {
      out[out.length - 1].text = `${out[out.length - 1].text} ${line}`.trim();
    }
  }
  return out;
}

export function parseTablePages(pages: RawTablePage[]): ParsedTable {
  const usable = pages.filter((p) => p && p.rows.length);
  if (!usable.length) return { ok: false, reason: 'no_table' };
  const columns = usable[0].dataColumns;
  let kmStep: number | null = null;
  let monthsStep: number | null = null;
  const rows: ServiceTableRow[] = [];
  const unsure: string[] = [];
  let group = '';

  for (const page of usable) {
    if (page.dataColumns !== columns) continue;
    const headerAt = page.rows.findIndex((r) => r.numbers);
    // Rows above the header (the legend line) are not items.
    const body = headerAt >= 0 ? page.rows.slice(headerAt) : page.rows;
    let headerRows = 0;
    for (const r of body) {
      if (r.numbers) {
        // On every page the first header row is the distance (thousands of km), the second the
        // months.
        const months = /חודש/.test(r.label.join(' ')) || headerRows > 0;
        headerRows++;
        const step = fitStep(r.data);
        if (step == null) continue;
        if (!months) kmStep ??= step < 1_000 ? step * 1_000 : step;
        else monthsStep ??= step;
        continue;
      }
      const { title, footnote } = cleanTitle(r.label[0] ?? '');
      const g = r.group.replace(/[‎‏]/g, '').replace(/\s+/g, ' ').trim();
      if (g) group = g;
      if (!title && !r.merged && r.data.every((c) => !c)) continue;
      const id = `r${rows.length + 1}`;
      if (r.merged != null) {
        rows.push({ id, group, title, footnote, cells: null, rule: parseRule(r.merged) });
        unsure.push(id);
        continue;
      }
      const cells = r.data.map((c, k) => {
        if (!c) return [];
        const a = c === '?' ? null : actionsFromLetters(c);
        if (!a) {
          unsure.push(`${id}:${k}`);
          return [];
        }
        return a;
      });
      for (const k of r.unsure ?? []) {
        if (!unsure.includes(`${id}:${k}`)) unsure.push(`${id}:${k}`);
      }
      rows.push({ id, group, title, footnote, cells, rule: null });
    }
  }
  if (!rows.length) return { ok: false, reason: 'no_table' };
  if (kmStep == null && monthsStep == null) return { ok: false, reason: 'no_intervals' };
  return {
    ok: true,
    table: {
      kmStep: kmStep ?? DEFAULT_TABLE_SHAPE.kmStep,
      monthsStep: monthsStep ?? DEFAULT_TABLE_SHAPE.monthsStep,
      columns,
      rows,
      footnotes: parseFootnotes(usable.flatMap((p) => p.below)),
    },
    unsure,
  };
}
