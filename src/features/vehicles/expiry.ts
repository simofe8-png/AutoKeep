/**
 * Test / insurance expiry (owner decision 2026-10-04): days left from today and a tone — soon
 * within 30 days, expired once the date has passed. Pure; dates are ISO (YYYY-MM-DD).
 */
export type ExpiryTone = 'ok' | 'soon' | 'expired';

export const SOON_DAYS = 30;

const utc = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

export function expiryStatus(until: string, today: string): { days: number; tone: ExpiryTone } {
  const days = Math.round((utc(until) - utc(today)) / 86_400_000);
  return { days, tone: days < 0 ? 'expired' : days <= SOON_DAYS ? 'soon' : 'ok' };
}

/**
 * A date as the owner types it: DD.MM.YYYY, DD/MM/YYYY or YYYY-MM-DD → ISO; undefined when it is
 * not a real calendar date. '' → null (cleared).
 */
export function parseUserDate(raw: string): string | null | undefined {
  const t = raw.trim();
  if (!t) return null;
  const il = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const [y, m, d] = il
    ? [Number(il[3]), Number(il[2]), Number(il[1])]
    : iso
      ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
      : [NaN, NaN, NaN];
  if (!y || !m || !d) return undefined;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return undefined;
  }
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ISO → the owner's format (DD.MM.YYYY) for editing. */
export function toUserDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}
