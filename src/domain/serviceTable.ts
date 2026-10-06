/**
 * The owner's maintenance table, built exactly like the booklet's "תכנית טיפולים תקופתיים" (owner
 * decision 2026-10-06): items in rows, the periodic services in columns (every `kmStep` km or
 * `monthsStep` months), and in every cell the action letters of that service. Items the booklet
 * states as a rule written across the columns ("החלף כל שנתיים") are rule rows.
 *
 * Pure data; the table is the owner's (entered, or read from the owner's own booklet and approved).
 */

/** The booklet's action letters: ב בדוק · כ כוונן · ה החלף · ס סוך · ח חזק · נ נקה. */
export type TableAction = 'check' | 'adjust' | 'replace' | 'lube' | 'tighten' | 'clean';

export const TABLE_ACTIONS: readonly TableAction[] = [
  'replace',
  'adjust',
  'lube',
  'tighten',
  'clean',
  'check',
];

export const ACTION_LETTER: Record<TableAction, string> = {
  check: 'ב',
  adjust: 'כ',
  replace: 'ה',
  lube: 'ס',
  tighten: 'ח',
  clean: 'נ',
};

const LETTER_ACTION: Record<string, TableAction> = Object.fromEntries(
  Object.entries(ACTION_LETTER).map(([a, l]) => [l, a as TableAction]),
);

/** "ב/ח" → ['check', 'tighten']; unknown letters → null. */
export function actionsFromLetters(text: string): TableAction[] | null {
  const parts = text.split('/').map((p) => p.trim());
  const out: TableAction[] = [];
  for (const p of parts) {
    const a = LETTER_ACTION[p];
    if (!a) return null;
    if (!out.includes(a)) out.push(a);
  }
  return out;
}

export const lettersOf = (actions: readonly TableAction[]) =>
  actions.map((a) => ACTION_LETTER[a]).join('/');

/** A rule written across the columns: the action, every N months and/or every N km. */
export interface TableRule {
  /** 'none' = "ללא החלפה" (stated; nothing to do). */
  action: TableAction | 'none';
  everyMonths: number | null;
  everyKm: number | null;
  /** The rule as the booklet states it (shown to the owner). */
  text: string;
}

export interface ServiceTableRow {
  id: string;
  /** The booklet's system heading ("מנוע", "מערכת קירור"…). */
  group: string;
  title: string;
  /** The booklet's footnote number on this item, if any. */
  footnote: number | null;
  /** One entry per service column ([] = nothing at that service); null for a rule row. */
  cells: TableAction[][] | null;
  rule: TableRule | null;
  /** The owner's own note on this item (e.g. a part number); absent = none. */
  note?: string | null;
}

export interface ServiceTable {
  /** Service n is due at n × kmStep km or n × monthsStep months. */
  kmStep: number;
  monthsStep: number;
  /** Columns in the table; after the last one the table starts again from the first. */
  columns: number;
  rows: ServiceTableRow[];
  /** The booklet's footnotes, by number. */
  footnotes: { n: number; text: string }[];
}

export const DEFAULT_TABLE_SHAPE = { kmStep: 15_000, monthsStep: 12, columns: 16 } as const;

export interface TableIssue {
  code: 'shape' | 'no_rows' | 'row_title' | 'row_cells' | 'rule';
  rowId?: string;
}

/** What makes a table unusable (an empty cell is fine: nothing at that service). */
export function tableIssues(t: ServiceTable): TableIssue[] {
  const issues: TableIssue[] = [];
  const okInt = (n: number, max: number) => Number.isInteger(n) && n > 0 && n <= max;
  if (!okInt(t.kmStep, 200_000) || !okInt(t.monthsStep, 120) || !okInt(t.columns, 40)) {
    issues.push({ code: 'shape' });
  }
  if (!t.rows.length) issues.push({ code: 'no_rows' });
  for (const r of t.rows) {
    if (!r.title.trim()) issues.push({ code: 'row_title', rowId: r.id });
    if (r.cells) {
      if (r.cells.length !== t.columns) issues.push({ code: 'row_cells', rowId: r.id });
    } else if (!r.rule) {
      issues.push({ code: 'row_cells', rowId: r.id });
    } else if (r.rule.action !== 'none' && r.rule.everyMonths == null && r.rule.everyKm == null) {
      issues.push({ code: 'rule', rowId: r.id });
    }
  }
  return issues;
}

/** The km of service n (1-based). */
export const serviceKm = (t: Pick<ServiceTable, 'kmStep'>, n: number) => n * t.kmStep;

/** The table column (0-based) of service n: after the last column the table starts again. */
export const serviceColumn = (t: Pick<ServiceTable, 'columns'>, n: number) =>
  (((n - 1) % t.columns) + t.columns) % t.columns;
