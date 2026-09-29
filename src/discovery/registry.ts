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
  // Blind maintenance-coverage matrix brands (spellings only).
  טסלה: 'tesla',
  "פיג'ו": 'peugeot',
  "אם ג'י": 'mg',
  // Ministry of Transport fleet spellings (data.gov.il vehicle datasets, `tozeret_nm` prefixes;
  // M-SOURCE fleet universe 2026-09-30). Spellings only — no authority implied.
  'מ.ג': 'mg',
  לקסוס: 'lexus',
  "ג'נסיס": 'genesis',
  מיצובישי: 'mitsubishi',
  'מרצדס בנץ': 'mercedes-benz',
  סמארט: 'smart',
  'ניאו רכב': 'nio',
  אאודי: 'audi',
  אודי: 'audi',
  קופרה: 'cupra',
  גילי: 'geely',
  'בי ווי די': 'byd',
  "צ'רי": 'chery',
  "ג'אקו": 'jaecoo',
  אומודה: 'omoda',
  אורה: 'ora',
  ימהה: 'yamaha',
  'קואנג יאנג': 'kymco',
  קימקו: 'kymco',
  "פיאג'ו": 'piaggio',
  ווספה: 'vespa',
  'סי.אף.מוטו': 'cfmoto',
  אפריליה: 'aprilia',
  הסקוורנה: 'husqvarna',
  'ב מ וו': 'bmw',
  מיני: 'mini',
  'קי.טי.אמ': 'ktm',
  'קי.טי.אם': 'ktm',
  'הארלי דיוידסון': 'harley-davidson',
  זונטס: 'zontes',
  ווג: 'voge',
  רנו: 'renault',
  "דאצ'יה": 'dacia',
  דאציה: 'dacia',
  ניסאן: 'nissan',
  וולבו: 'volvo',
  סיטרואן: 'citroen',
  'די אס': 'ds',
  אופל: 'opel',
  שברולט: 'chevrolet',
  סובארו: 'subaru',
  דייהטסו: 'daihatsu',
  פיאט: 'fiat',
  "ג'יפ": 'jeep',
  'אלפא רומיאו': 'alfa-romeo',
  'מרוטי סוזוקי': 'suzuki',
  איסוזו: 'isuzu',
  אקספנג: 'xpeng',
  זיקר: 'zeekr',
  'לינק אנד קו': 'lynk-co',
  ליפמוטור: 'leapmotor',
  קרייזלר: 'chrysler',
  קאדילאק: 'cadillac',
  לנדרובר: 'land-rover',
  פורשה: 'porsche',
  מקסוס: 'maxus',
  דונגפנג: 'dongfeng',
  // Latin multi-word names normalize to the same keys.
  'mercedes benz': 'mercedes-benz',
  'alfa romeo': 'alfa-romeo',
  'harley davidson': 'harley-davidson',
  'land rover': 'land-rover',
  'moto guzzi': 'moto-guzzi',
};
