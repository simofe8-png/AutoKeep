/**
 * Explicit engine-code equivalences (owner decision 2026-10-03). Engine codes are compared
 * exactly; a different code — including one that only adds or drops a suffix letter (CGG vs
 * CGGB) — is a DIFFERENT engine unless it is listed here. Suffixes can mark compression,
 * injection, timing-drive or emissions differences, so no prefix / substring rule is ever used.
 *
 * An entry may be added only for OEM-equivalent variants whose maintenance schedules are
 * verified identical, with the evidence (document, page) cited in a comment next to the entry.
 * The table is empty: no such equivalence has been verified yet. A vehicle whose code is not
 * matched stays without a schedule (VERIFIED_IDENTITY_ONLY) rather than receive another
 * engine's schedule.
 */
export const explicitAliases: Record<string, string[]> = {};

/** Same engine: identical codes, or listed as equivalent (in either direction). */
export function equivalentEngineCodes(
  a: string,
  b: string,
  aliases: Record<string, string[]> = explicitAliases,
): boolean {
  return a === b || (aliases[a]?.includes(b) ?? false) || (aliases[b]?.includes(a) ?? false);
}
