/**
 * Plate-number formatting while typing: digits only (max 8), grouped with hyphens as they are
 * entered — 2-3-2 for up to 7 digits (12-345-67), 3-2-3 once an 8th digit is typed (123-45-678).
 */
export const MAX_PLATE_DIGITS = 8;

export function plateDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, MAX_PLATE_DIGITS);
}

export function formatPlateInput(raw: string): string {
  const d = plateDigits(raw);
  if (d.length === 8) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  if (d.length > 5) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length > 2) return `${d.slice(0, 2)}-${d.slice(2)}`;
  return d;
}
