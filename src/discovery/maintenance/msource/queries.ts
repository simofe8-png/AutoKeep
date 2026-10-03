import type { VehicleFingerprint } from './fingerprint';

/**
 * Deterministic, progressively relaxed query generation (M-SOURCE Phase 6; generalized
 * 2026-10-03). Queries are built ONLY from the fingerprint's attributes — never written per
 * model. Specificity relaxes level by level:
 *
 *   L1  make + model + year + engine code + "maintenance schedule"
 *   L2  make + model + generation + engine (code / displacement) + "service intervals"
 *   L3  make + model + year + "maintenance manual"
 *   L4  make + model + generation (or body variant) + "service schedule"
 *   L5  make + model + "maintenance schedule"
 *
 * A level whose attribute is unknown is skipped (never filled in). Each level is also produced in
 * Hebrew for the Israeli market and in the manufacturer's / manufacturing country's language
 * (data tables below — language facts about manufacturers, not vehicle logic).
 */

export type QueryLanguage = 'en' | 'he' | 'de' | 'es' | 'fr' | 'it' | 'cs' | 'ja' | 'ko';

export interface DiscoveryQuery {
  /** Stable id: language + level + index. */
  id: string;
  language: QueryLanguage;
  /** 1 = most specific … 5 = most general. */
  level: 1 | 2 | 3 | 4 | 5;
  text: string;
  intent: 'schedule' | 'manual' | 'engine';
}

/** Manufacturer home language (where its own documents are published). */
const MAKE_LANGUAGE: Record<string, QueryLanguage> = {
  seat: 'es',
  cupra: 'es',
  volkswagen: 'de',
  audi: 'de',
  bmw: 'de',
  'mercedes-benz': 'de',
  opel: 'de',
  porsche: 'de',
  skoda: 'cs',
  renault: 'fr',
  dacia: 'fr',
  peugeot: 'fr',
  citroen: 'fr',
  ds: 'fr',
  fiat: 'it',
  'alfa romeo': 'it',
  toyota: 'ja',
  lexus: 'ja',
  mazda: 'ja',
  honda: 'ja',
  nissan: 'ja',
  suzuki: 'ja',
  mitsubishi: 'ja',
  subaru: 'ja',
  hyundai: 'ko',
  kia: 'ko',
};

const COUNTRY_LANGUAGE: Record<string, QueryLanguage> = {
  DE: 'de',
  ES: 'es',
  FR: 'fr',
  IT: 'it',
  CZ: 'cs',
  JP: 'ja',
  KR: 'ko',
};

/** Hebrew make spellings used by Israeli importers / press (spelling only). */
const MAKE_HE: Record<string, string> = {
  ford: 'פורד',
  seat: 'סיאט',
  toyota: 'טויוטה',
  mazda: 'מאזדה',
  hyundai: 'יונדאי',
  kia: 'קיה',
  skoda: 'סקודה',
  volkswagen: 'פולקסווגן',
  honda: 'הונדה',
  suzuki: 'סוזוקי',
  peugeot: "פיג'ו",
  citroen: 'סיטרואן',
  renault: 'רנו',
  dacia: "דאצ'יה",
  nissan: 'ניסאן',
  mitsubishi: 'מיצובישי',
  bmw: 'ב.מ.וו',
  'mercedes-benz': 'מרצדס',
  audi: 'אאודי',
  opel: 'אופל',
  tesla: 'טסלה',
};

interface Words {
  schedule: string;
  intervals: string;
  manual: string;
  serviceSchedule: string;
}

/** Localized words per language (no machine-translated query is invented at run time). */
const WORDS: Partial<Record<QueryLanguage, Words>> = {
  en: {
    schedule: 'maintenance schedule',
    intervals: 'service intervals',
    manual: 'maintenance manual',
    serviceSchedule: 'service schedule',
  },
  he: {
    schedule: 'לוח טיפולים',
    intervals: 'מרווחי טיפולים',
    manual: 'ספר רכב טיפולים',
    serviceSchedule: 'תוכנית טיפולים',
  },
  de: {
    schedule: 'Wartungsplan',
    intervals: 'Wartungsintervalle',
    manual: 'Betriebsanleitung Wartung',
    serviceSchedule: 'Inspektionsplan',
  },
  es: {
    schedule: 'plan de mantenimiento',
    intervals: 'intervalos de mantenimiento',
    manual: 'manual de instrucciones mantenimiento',
    serviceSchedule: 'programa de mantenimiento',
  },
  fr: {
    schedule: "plan d'entretien",
    intervals: "intervalles d'entretien",
    manual: "notice d'utilisation entretien",
    serviceSchedule: "carnet d'entretien",
  },
  it: {
    schedule: 'piano di manutenzione',
    intervals: 'intervalli di manutenzione',
    manual: 'libretto uso e manutenzione',
    serviceSchedule: 'tagliandi',
  },
  cs: {
    schedule: 'plán údržby',
    intervals: 'servisní intervaly',
    manual: 'návod k obsluze údržba',
    serviceSchedule: 'servisní plán',
  },
};

const join = (...parts: (string | number | undefined | null | false)[]) =>
  parts
    .filter((p) => p !== undefined && p !== null && p !== false && `${p}`.trim() !== '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Languages for a fingerprint: English, Hebrew (IL market), manufacturer, manufacturing country. */
export function queryLanguages(fp: VehicleFingerprint): QueryLanguage[] {
  const langs: QueryLanguage[] = ['en'];
  if (fp.market === 'IL') langs.push('he');
  const home = MAKE_LANGUAGE[fp.make];
  if (home && WORDS[home] && !langs.includes(home)) langs.push(home);
  const made = fp.manufacturerCountry ? COUNTRY_LANGUAGE[fp.manufacturerCountry] : undefined;
  if (made && WORDS[made] && !langs.includes(made)) langs.push(made);
  return langs;
}

export function generateQueries(fp: VehicleFingerprint): DiscoveryQuery[] {
  const out: DiscoveryQuery[] = [];
  const engineCode = fp.engineCodes[0];
  // Marketing labels are usually 0.1-litre steps ("1.5 dCi" for 1461 cc); a 0.05-step label
  // ("1.25" for 1242 cc) is only an additional variant, never the primary one.
  const litre = fp.displacementLabels[0];
  const altLitres = fp.displacementLabels.slice(1);
  const engine = engineCode ?? litre;
  const generationOrBody = fp.generation ?? fp.bodyVariant;
  for (const language of queryLanguages(fp)) {
    const w = WORDS[language]!;
    const make = language === 'he' ? (MAKE_HE[fp.make] ?? fp.makeLabel) : fp.makeLabel;
    const mm = join(make, fp.model);
    const add = (
      level: DiscoveryQuery['level'],
      intent: DiscoveryQuery['intent'],
      text: string,
    ) => {
      if (out.some((q) => q.text.toLowerCase() === text.toLowerCase())) return;
      const n = out.filter((q) => q.language === language && q.level === level).length + 1;
      out.push({ id: `${language}-L${level}-${n}`, language, level, intent, text });
    };
    if (engineCode) add(1, 'engine', join(mm, fp.modelYear, engineCode, w.schedule));
    if (fp.generation && engine) add(2, 'engine', join(mm, fp.generation, engine, w.intervals));
    else if (engine) add(2, 'engine', join(mm, litre ?? engine, w.intervals));
    for (const alt of altLitres) add(2, 'engine', join(mm, alt, w.intervals));
    add(3, 'manual', join(mm, fp.modelYear, w.manual));
    if (generationOrBody) add(4, 'schedule', join(mm, generationOrBody, w.serviceSchedule));
    add(5, 'schedule', join(mm, w.schedule));
  }
  return out.sort((a, b) => a.level - b.level);
}
