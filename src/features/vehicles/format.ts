import { he } from '@/i18n/he';

const numberFormat = new Intl.NumberFormat('he-IL');

/** No-break space keeps a value and its unit on the same line. */
export const NBSP = String.fromCharCode(0x00a0);

/** A number in Hebrew grouping without a unit (tiles show the unit on its own line). */
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

export function formatKm(km: number): string {
  return `${numberFormat.format(km)}${NBSP}${he.common.km}`;
}

/**
 * Inline "·" separator for mixed Hebrew/numeric metadata. A neutral separator between two numeric
 * runs would be resolved LTR by the bidi algorithm and visually swap the runs (device-verified);
 * RIGHT-TO-LEFT MARKs on both sides pin it to the RTL paragraph direction.
 */
const RLM = String.fromCharCode(0x200f);
export const SEP = `${RLM} · ${RLM}`;

export function joinParts(parts: readonly (string | number | null | undefined | false)[]): string {
  return parts.filter((p) => p !== null && p !== undefined && p !== false && p !== '').join(SEP);
}

const dateFormat = new Intl.DateTimeFormat('he-IL', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
});

/** Formats an ISO date (YYYY-MM-DD) as a Hebrew short date without timezone drift. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return dateFormat.format(new Date(Date.UTC(y, m - 1, d, 12)));
}

/**
 * Masks an identifier leaving only the final `visible` characters (spec §4: support masking so
 * that only the last four characters of a VIN are exposed).
 */
export function maskIdentifier(value: string, visible = 4): string {
  const clean = value.trim();
  if (clean.length <= visible) return clean;
  return `${'•'.repeat(Math.min(clean.length - visible, 6))}${clean.slice(-visible)}`;
}

/** Parses a user-entered odometer value (digits, optional thousands separators). */
export function parseOdometer(raw: string): number | undefined {
  const digits = raw.replace(/[,\s.]/g, '');
  if (!/^\d{1,7}$/.test(digits)) return undefined;
  const n = Number(digits);
  return n > 0 ? n : undefined;
}

/** Today's date as ISO YYYY-MM-DD in local time. */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
