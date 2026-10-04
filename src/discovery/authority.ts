/** Hebrew and Latin spellings map to one key (e.g. "טויוטה" → "toyota"). */
export type ManufacturerAliases = Record<string, string>;

/** A manufacturer name as written (registry, user) → its normalized key. Spelling only. */
export function normalizeManufacturer(name: string, aliases: ManufacturerAliases): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (aliases[key]) return aliases[key];
  // Registry names can carry a (sometimes truncated) country: "פולקסווגן גרמנ", "קיה ד. קוריאה".
  // Only a whole-word alias prefix counts, longest first ("סאן יאנג" before "סאן").
  const prefix = Object.keys(aliases)
    .filter((a) => key.startsWith(`${a} `) || key.startsWith(`${a}-`))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? aliases[prefix] : key;
}
