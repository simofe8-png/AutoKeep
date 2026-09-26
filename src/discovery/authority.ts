import type { SourceAuthority } from '@/domain';

import type { SourceCandidate } from './types';

/**
 * Source authority classification (T080). Deterministic and conservative:
 *  - Authority comes ONLY from the document's host matching a registry of verified official
 *    domains for that manufacturer / its official importer. Titles, snippets, provider claims
 *    and AI opinions never confer authority (source-poisoning defense).
 *  - HTTPS is required. Lookalike hosts (e.g. "toyota.com.evil.io") never match.
 *  - Everything else is "third_party" and can never verify a maintenance requirement.
 */

export type CandidateAuthority =
  Extract<SourceAuthority, 'manufacturer' | 'official_importer'> | 'third_party';

export interface OfficialDomainEntry {
  /** Normalized manufacturer key, e.g. "toyota". */
  manufacturer: string;
  kind: 'manufacturer' | 'official_importer';
  /** Registrable domain; subdomains are included (docs.example.com matches example.com). */
  domain: string;
  /** Market the importer is official for (manufacturer entries are global). */
  market?: 'IL';
  /** Who verified the entry and when — registry entries must be evidence-backed, never guessed. */
  verifiedBy: string;
  verifiedAt: string;
}

/** Hebrew and Latin spellings map to one key (e.g. "טויוטה" → "toyota"). */
export type ManufacturerAliases = Record<string, string>;

export function normalizeManufacturer(name: string, aliases: ManufacturerAliases): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (aliases[key]) return aliases[key];
  // Registry names can carry a (sometimes truncated) country: "פולקסווגן גרמנ", "קיה ד. קוריאה".
  // Only a whole-word alias prefix counts, longest first ("סאן יאנג" before "סאן").
  const prefix = Object.keys(aliases)
    .filter((a) => key.startsWith(`${a} `))
    .sort((a, b) => b.length - a.length)[0];
  return prefix ? aliases[prefix] : key;
}

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    return u.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  const d = domain.toLowerCase();
  return host === d || host.endsWith(`.${d}`);
}

export interface Classification {
  authority: CandidateAuthority;
  domain: string | null;
  reason: 'official_domain' | 'not_https_or_invalid' | 'not_official_for_manufacturer';
}

export function classifyAuthority(
  candidate: SourceCandidate,
  manufacturer: string,
  registry: readonly OfficialDomainEntry[],
  aliases: ManufacturerAliases,
): Classification {
  const host = hostOf(candidate.url);
  if (!host) return { authority: 'third_party', domain: null, reason: 'not_https_or_invalid' };
  const key = normalizeManufacturer(manufacturer, aliases);
  // Manufacturer entries take precedence over importer entries.
  const matches = registry
    .filter((e) => e.manufacturer === key && hostMatches(host, e.domain))
    .sort((a, b) => (a.kind === 'manufacturer' ? -1 : b.kind === 'manufacturer' ? 1 : 0));
  if (matches.length === 0)
    return { authority: 'third_party', domain: host, reason: 'not_official_for_manufacturer' };
  return { authority: matches[0].kind, domain: host, reason: 'official_domain' };
}
