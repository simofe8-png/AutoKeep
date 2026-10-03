/**
 * VIN handling for the Ministry `misgeret` field. The raw value is stored as published (registry
 * record + vehicle identity); the UI shows only the last four characters (RegistryFacts `factText`). A
 * request to an external provider may only carry the sanitized form below: a well-formed
 * 17-character VIN, or nothing. Nothing is repaired or completed — a value that is not a valid
 * VIN is never "fixed" into one. Pure: no I/O.
 */

/** ISO 3779 VIN alphabet: digits and capital letters except I, O and Q. */
const VIN = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * "vsszzz6jzcr000001" → "VSSZZZ6JZCR000001"; separators and surrounding spaces are removed.
 * Masked ("••••0001"), short, long or out-of-alphabet values → undefined.
 */
export function sanitizeVin(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const v = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[\s\-_.]/g, '');
  return VIN.test(v) ? v : undefined;
}
