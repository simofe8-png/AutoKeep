import type { ManufacturerAliases, OfficialDomainEntry } from './authority';

/**
 * Registry of VERIFIED official manufacturer / official-importer domains.
 *
 * Intentionally empty until entries are verified with evidence (who/when/how) as part of the
 * approved discovery provider setup (see docs/gates/G1-providers.md). AutoKeep never guesses which
 * domain is official — an empty registry means every source is treated as third-party, and the
 * schedule stays unavailable rather than invented.
 */
export const OFFICIAL_DOMAINS: readonly OfficialDomainEntry[] = [];

/** Spelling aliases only (no authority implied). */
export const MANUFACTURER_ALIASES: ManufacturerAliases = {
  טויוטה: 'toyota',
  מאזדה: 'mazda',
  יונדאי: 'hyundai',
  קיה: 'kia',
  הונדה: 'honda',
  ימאהה: 'yamaha',
  קוואסאקי: 'kawasaki',
  סוזוקי: 'suzuki',
  סקודה: 'skoda',
  פולקסווגן: 'volkswagen',
  'סאן יאנג': 'sym',
};
