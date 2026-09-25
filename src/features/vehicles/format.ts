import { he } from '@/i18n/he';

const numberFormat = new Intl.NumberFormat('he-IL');

export function formatKm(km: number): string {
  return `${numberFormat.format(km)} ${he.common.km}`;
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
