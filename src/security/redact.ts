/**
 * T164: redaction for anything that leaves the UI's controlled rendering — dev logs, technical
 * error details, crash text. Vehicle identifiers keep only their last four characters (spec §4);
 * emails and phone numbers are removed. Pure and conservative: when in doubt, redact.
 */

const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Israeli phone numbers (mobile/landline, with or without country code / separators).
const PHONE = /(?:\+972[-\s]?|\b0)(?:[23489]|5\d|7\d)[-\s]?\d{3}[-\s]?\d{4}\b/g;
// Registration numbers: 12-345-67 / 123-45-678 / 1234567 / 12345678.
const PLATE = /\b(?:\d{2}-\d{3}-\d{2}|\d{3}-\d{2}-\d{3}|\d{7,8})\b/g;

const keepLast4 = (s: string) => `${'•'.repeat(Math.max(s.length - 4, 0))}${s.slice(-4)}`;

export function redact(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(VIN, (v) => keepLast4(v))
    .replace(PHONE, '[phone]')
    .replace(PLATE, (p) => keepLast4(p.replace(/-/g, '')));
}

/** Redacted, bounded text of an unknown error (never the raw object). */
export function safeErrorText(e: unknown, max = 300): string {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return redact(raw).slice(0, max);
}
