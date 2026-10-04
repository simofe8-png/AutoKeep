import { normalizeManufacturer } from '@/discovery/authority';
import { MANUFACTURER_ALIASES } from '@/discovery/registry';

/**
 * Where the owner can find the vehicle's booklet on the official importer's site (owner decision
 * 2026-10-04): a link the OWNER opens in the browser — AutoKeep never downloads or reads the site
 * itself (some importers' terms forbid automated access). The owner then uploads or photographs
 * the booklet, and approves every item.
 *
 * Trial: SEAT and the other Champion Motors brands only.
 */
export interface ImporterBooklet {
  importer: string;
  /** The importer's booklet library. */
  url: string;
}

const CHAMPION: ImporterBooklet = {
  importer: "צ'מפיון מוטורס",
  url: 'https://books.championmotors.co.il/',
};

const BY_MAKE: Record<string, ImporterBooklet> = {
  seat: CHAMPION,
  cupra: CHAMPION,
  volkswagen: CHAMPION,
  skoda: CHAMPION,
  audi: CHAMPION,
};

export function importerBookletFor(manufacturer: string): ImporterBooklet | null {
  const key = normalizeManufacturer(manufacturer, MANUFACTURER_ALIASES).toLowerCase();
  return BY_MAKE[key] ?? null;
}
