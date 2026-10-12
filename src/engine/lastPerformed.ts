import type { IsoDate, TableAction } from '@/domain';

/**
 * History is the source of truth for when an item was last performed (owner decision 2026-10-12).
 * Pure: a performed history action counts for an item when its title names the item; the latest
 * valid event wins; a deleted record simply is no longer in the input. Nothing is guessed — an item
 * no performed action names stays unknown.
 */

export type HistoryActionType = 'inspection' | 'replacement' | 'other';

/** One performed action of a history record. */
export interface HistoryItemEvent {
  eventId: string;
  date: IsoDate;
  km: number;
  title: string;
  actionType: HistoryActionType;
}

export interface LastPerformed {
  date: IsoDate;
  km: number | null;
  /** 'history': a service record; 'manual': a date the owner entered without a record. */
  source: 'history' | 'manual';
  eventId: string | null;
}

/** Title without the table's action suffix ("שמן מנוע — החלף"), case, quotes and extra spaces. */
export function normalizeTitle(title: string): string {
  return title
    .split(' — ')[0]
    .toLowerCase()
    .replace(/["'״׳`.,:;()[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The one item (of `titles`) an action names: equal titles, or the item's whole words inside the
 * action's title ("החלפת מסנן אוויר" → "מסנן אוויר"); the longest such item wins, so "שמן מנוע"
 * beats "שמן". Null when none matches.
 */
export function matchItem(actionTitle: string, titles: readonly string[]): number | null {
  const a = ` ${normalizeTitle(actionTitle)} `;
  let best: number | null = null;
  titles.forEach((t, i) => {
    const n = normalizeTitle(t);
    if (!n || !a.includes(` ${n} `)) return;
    if (best === null || n.length > normalizeTitle(titles[best]).length) best = i;
  });
  return best;
}

/** Whether a performed action of this type satisfies the table's action for the item. */
export function covers(type: HistoryActionType, action: TableAction): boolean {
  if (type === 'replacement') return true;
  if (type === 'inspection') return action === 'check';
  return action !== 'replace';
}

const later = (a: LastPerformed, b: LastPerformed) =>
  a.date > b.date || (a.date === b.date && (a.km ?? -1) > (b.km ?? -1));

/** The latest of several "last performed" candidates (null when there are none). */
export function latestOf(xs: readonly (LastPerformed | null)[]): LastPerformed | null {
  return xs.reduce<LastPerformed | null>(
    (best, x) => (x && (!best || later(x, best)) ? x : best),
    null,
  );
}

/**
 * The latest performed history event per item: `titles[i]` → its latest event, counting only
 * actions that name it (and, when `action` is given for the item, satisfy that action).
 */
export function lastFromHistory(
  titles: readonly string[],
  history: readonly HistoryItemEvent[],
  actionOf?: (index: number) => TableAction | null,
): (LastPerformed | null)[] {
  const out: (LastPerformed | null)[] = titles.map(() => null);
  for (const e of history) {
    const i = matchItem(e.title, titles);
    if (i === null) continue;
    const action = actionOf?.(i) ?? null;
    if (action && !covers(e.actionType, action)) continue;
    out[i] = latestOf([out[i], { date: e.date, km: e.km, source: 'history', eventId: e.eventId }]);
  }
  return out;
}
