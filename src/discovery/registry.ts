import type { ManufacturerAliases, OfficialDomainEntry } from './authority';
import type { KnownOfficialDocument } from './hybrid';

/**
 * Registry of VERIFIED official manufacturer / official-importer domains.
 *
 * Intentionally empty until entries are verified with evidence (who/when/how) as part of the
 * approved discovery provider setup (see docs/gates/G1-providers.md). AutoKeep never guesses which
 * domain is official — an empty registry means every source is treated as third-party, and the
 * schedule stays unavailable rather than invented.
 */
export const OFFICIAL_DOMAINS: readonly OfficialDomainEntry[] = [];

/**
 * Known official documents (ADR-0016): direct manual/schedule URLs published by an entry above.
 * Added only through docs/sources/REGISTRY_PROCEDURE.md (evidence: who, when, how verified).
 */
export const KNOWN_OFFICIAL_SOURCES: readonly KnownOfficialDocument[] = [];

/** Spelling aliases only (no authority implied). */
export const MANUFACTURER_ALIASES: ManufacturerAliases = {
  טויוטה: 'toyota',
  מאזדה: 'mazda',
  // Ministry of Transport spelling (data.gov.il importer price list).
  מזדה: 'mazda',
  יונדאי: 'hyundai',
  קיה: 'kia',
  הונדה: 'honda',
  ימאהה: 'yamaha',
  קוואסאקי: 'kawasaki',
  סוזוקי: 'suzuki',
  סקודה: 'skoda',
  פולקסווגן: 'volkswagen',
  'סאן יאנג': 'sym',
  // Acceptance vehicles of the maintenance run (registry spellings, e.g. "סיאט ספרד").
  סיאט: 'seat',
  פורד: 'ford',
};
