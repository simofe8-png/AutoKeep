import { normalizeManufacturer } from '@/discovery/authority';
import { MANUFACTURER_ALIASES } from '@/discovery/registry';
import type { Powertrain, Transmission, VehicleType } from '@/domain';

/**
 * M-SOURCE vehicle fingerprint (ADR-0020). The normalized identity of ONE confirmed vehicle that
 * every later stage (queries, applicability matching, resolution) is based on. Only facts that
 * were confirmed (registry / user) enter it; an absent field means UNKNOWN and is never filled
 * from another field (no engine code from the displacement, no generation from the year).
 *
 * Privacy: no plate, no full VIN. At most the masked VIN prefix the app already displays
 * (WMI + VDS: manufacturer / model information, not the serial).
 */

export interface VehicleFingerprint {
  kind: VehicleType;
  /** Normalized make key ("ford", "seat"). */
  make: string;
  /** Display spelling of the make for queries ("Ford", "SEAT"). */
  makeLabel: string;
  /** Normalized model ("Fiesta", "Ibiza"). */
  model: string;
  modelYear: number;
  generation?: string;
  trim?: string;
  displacementCc?: number;
  /** Marketing litre labels derived from the cc ("1242" → ["1.2", "1.25"]); for queries only. */
  displacementLabels: string[];
  /** Upper-case, separator-free engine codes; several when the source of the fact lists several. */
  engineCodes: string[];
  fuelType?: Powertrain;
  transmission?: Transmission;
  /** WMI + VDS only (first 9 characters at most); never the serial part. */
  vinPrefix?: string;
  /** Market whose schedule applies: AutoKeep vehicles are Israeli-registered. */
  market: string;
  country: string;
  /** Country of the manufacturing entity as the Ministry names it ("פורד גרמניה" → DE). */
  manufacturerCountry?: string;
  /** Normalized body variant when the registry states it (never derived from the model name). */
  bodyVariant?: BodyVariant;
}

export type BodyVariant =
  'hatchback' | 'sedan' | 'estate' | 'coupe' | 'convertible' | 'suv' | 'mpv' | 'van' | 'pickup';

export interface FingerprintInput {
  kind: VehicleType;
  /** Ministry / user spelling ("פורד גרמניה", "SEAT"). */
  manufacturer: string;
  model: string;
  year: number;
  generation?: string | null;
  /** Registry / catalog body words ("הצ'בק", "סטיישן", "Hatchback", "Estate"). */
  body?: string | null;
  trim?: string | null;
  /** "1242 סמ״ק", "1242 cc", 1242. A bare litre label ("1.4") is NOT converted to cc. */
  engine?: string | number | null;
  engineCode?: string | null;
  fuel?: string | null;
  transmission?: string | null;
  /** Masked or full VIN: only the first 9 characters are kept. */
  vin?: string | null;
  market?: string;
}

export type FingerprintResult =
  { ok: true; fingerprint: VehicleFingerprint } | { ok: false; missing: string[] };

/** Make display spellings where the plain capitalized key is wrong. */
const MAKE_LABELS: Record<string, string> = {
  seat: 'SEAT',
  bmw: 'BMW',
  mg: 'MG',
  byd: 'BYD',
  sym: 'SYM',
  'mercedes-benz': 'Mercedes-Benz',
  ds: 'DS',
};

/** Model spellings that differ only by punctuation / casing in sources. */
const MODEL_ALIASES: Record<string, string> = {
  chr: 'C-HR',
  'c-hr': 'C-HR',
  cx5: 'CX-5',
  'cx-5': 'CX-5',
};

/** Ministry `tozeret_nm` country suffixes → ISO country. */
const COUNTRY_WORDS: [RegExp, string][] = [
  [/גרמנ/, 'DE'],
  [/ספרד/, 'ES'],
  [/צרפת/, 'FR'],
  [/איטלי/, 'IT'],
  [/צ'כ|צכיה/, 'CZ'],
  [/יפן/, 'JP'],
  [/קוריא/, 'KR'],
  [/סין/, 'CN'],
  [/טורקי/, 'TR'],
  [/ארה"ב|ארצות/, 'US'],
  [/אנגלי|בריטני/, 'GB'],
  [/רומני/, 'RO'],
  [/מקסיק/, 'MX'],
  [/הודו/, 'IN'],
  [/תאילנד/, 'TH'],
  [/סלובקי/, 'SK'],
  [/פולין/, 'PL'],
  [/הונגרי/, 'HU'],
];

const HEBREW = /[֐-׿]/;
const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function makeKey(manufacturer: string): string | null {
  const n = normalizeManufacturer(clean(manufacturer), MANUFACTURER_ALIASES);
  if (!n || HEBREW.test(n)) return null;
  return n.toLowerCase();
}

export function makeLabel(key: string): string {
  return (
    MAKE_LABELS[key] ??
    key
      .split(/([\s-])/)
      .map((p) => (p.length > 1 ? p[0].toUpperCase() + p.slice(1) : p))
      .join('')
  );
}

/** "FIESTA" → "Fiesta", "ibiza" → "Ibiza", "c-hr" → "C-HR", "MODEL 3" → "Model 3". */
export function normalizeModel(model: string): string {
  const m = clean(model);
  const alias = MODEL_ALIASES[m.toLowerCase()];
  if (alias) return alias;
  return m
    .split(' ')
    .map((w) =>
      /\d/.test(w) || w.length <= 2
        ? w.toUpperCase()
        : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ');
}

/** " cggb " → ["CGGB"], "CGG/CGGB" → ["CGG", "CGGB"], "snj-b" → ["SNJB"]. Invalid → []. */
export function normalizeEngineCodes(code: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of clean(code).split(/[/,;|]+/)) {
    const c = part.toUpperCase().replace(/[\s\-_.]/g, '');
    if (/^[A-Z0-9]{2,8}$/.test(c) && /[A-Z]/.test(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

/** cc from "1242 סמ״ק" / "1242cc" / 1242; litre labels are not converted (no guessing). */
export function displacementCcOf(engine: string | number | null | undefined): number | undefined {
  if (typeof engine === 'number')
    return engine >= 40 && engine <= 9000 ? Math.round(engine) : undefined;
  const m = clean(engine).match(/^(\d{2,4})\s*(סמ|cc|cm3|cm³|סמ"ק|סמ״ק)?/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  // A bare number below 40 is a litre label written without a dot, never cc.
  return n >= 40 && n <= 9000 && (m[2] || n >= 100) ? n : undefined;
}

/** 1242 → ["1.2", "1.25"]; 1390 → ["1.4"]; 999 → ["1.0"]. Labels for search only. */
export function displacementLabels(cc: number | undefined): string[] {
  if (!cc) return [];
  const l = cc / 1000;
  const tenth = (Math.round(l * 10) / 10).toFixed(1);
  const twentieth = Math.round(l * 20) / 20;
  const labels = [tenth];
  const t2 = twentieth.toFixed(2).replace(/0$/, '');
  if (t2 !== tenth && Math.abs(twentieth - l) < Math.abs(Number(tenth) - l)) labels.push(t2);
  return labels;
}

/** Body words (Hebrew registry / English / German / Spanish / French) → normalized variant. */
const BODY_WORDS: [BodyVariant, RegExp][] = [
  [
    'estate',
    /סטיישן|station|estate|wagon|kombi|combi|touring|avant|variant|sportstourer|break\b|familiar/i,
  ],
  ['convertible', /קבריולט|cabrio|convertible|roadster|spider/i],
  ['coupe', /קופה|coup[eé]/i],
  ['suv', /פנאי שטח|רכב שטח|\bsuv\b|crossover|גרור שטח/i],
  ['mpv', /\bmpv\b|monovolume|רב.?מקומות|minivan/i],
  ['pickup', /טנדר|pick.?up/i],
  ['van', /מסחרי|\bvan\b|kastenwagen|furg[oó]n/i],
  ['sedan', /סדאן|sedan|saloon|limousine|berlina/i],
  ['hatchback', /הצ'?בק|האצ'?בק|hatch|schrägheck|fließheck/i],
];

export function bodyVariantOf(body: string | null | undefined): BodyVariant | undefined {
  const b = clean(body);
  if (!b) return undefined;
  for (const [variant, re] of BODY_WORDS) if (re.test(b)) return variant;
  return undefined;
}

export function fuelOf(fuel: string | null | undefined): Powertrain | undefined {
  const f = clean(fuel);
  if (!f) return undefined;
  if (/plug.?in|נטען/i.test(f)) return 'plugin_hybrid';
  if (/היבריד|hybrid/i.test(f)) return 'hybrid';
  if (/חשמל|electric|\bev\b/i.test(f)) return 'electric';
  if (/דיזל|סולר|diesel/i.test(f)) return 'diesel';
  if (/גפ"מ|lpg/i.test(f)) return 'lpg';
  if (/בנזין|petrol|gasoline|benzin/i.test(f)) return 'petrol';
  return undefined;
}

export function transmissionOf(t: string | null | undefined): Transmission | undefined {
  const s = clean(t);
  if (!s) return undefined;
  if (/dsg|dct|כפול/i.test(s)) return 'dct';
  if (/cvt|רציף/i.test(s)) return 'cvt';
  if (/robot|amt|רובוט/i.test(s)) return 'amt';
  if (/ידני|manual|\bmt\b/i.test(s)) return 'manual';
  if (/אוטומט|automatic|\bat\b/i.test(s)) return 'automatic';
  return undefined;
}

export function manufacturerCountryOf(manufacturer: string): string | undefined {
  for (const [re, iso] of COUNTRY_WORDS) if (re.test(manufacturer)) return iso;
  return undefined;
}

/** Keeps WMI + VDS (≤ 9 characters) of a full or masked VIN; masked characters end the prefix. */
export function vinPrefixOf(vin: string | null | undefined): string | undefined {
  const v = clean(vin).toUpperCase();
  const m = /^[A-HJ-NPR-Z0-9]+/.exec(v);
  const p = m ? m[0].slice(0, 9) : '';
  return p.length >= 3 ? p : undefined;
}

export function buildFingerprint(input: FingerprintInput): FingerprintResult {
  const missing: string[] = [];
  const make = makeKey(input.manufacturer);
  if (!make) missing.push('make');
  const model = clean(input.model) ? normalizeModel(input.model) : '';
  if (!model) missing.push('model');
  if (!(input.year >= 1950 && input.year <= 2100)) missing.push('modelYear');
  if (missing.length) return { ok: false, missing };
  const cc = displacementCcOf(input.engine ?? undefined);
  const fp: VehicleFingerprint = {
    kind: input.kind,
    make: make!,
    makeLabel: makeLabel(make!),
    model,
    modelYear: input.year,
    displacementLabels: displacementLabels(cc),
    engineCodes: normalizeEngineCodes(input.engineCode),
    market: input.market ?? 'IL',
    country: input.market ?? 'IL',
  };
  if (clean(input.generation)) fp.generation = clean(input.generation);
  const body = bodyVariantOf(input.body);
  if (body) fp.bodyVariant = body;
  if (clean(input.trim)) fp.trim = clean(input.trim);
  if (cc) fp.displacementCc = cc;
  const fuel = fuelOf(input.fuel);
  if (fuel) fp.fuelType = fuel;
  const tr = transmissionOf(input.transmission);
  if (tr) fp.transmission = tr;
  const vin = vinPrefixOf(input.vin);
  if (vin) fp.vinPrefix = vin;
  const country = manufacturerCountryOf(input.manufacturer);
  if (country) fp.manufacturerCountry = country;
  return { ok: true, fingerprint: fp };
}

/**
 * Vehicle-CLASS key (cache / shared knowledge): kind|make|model|year|cc|engine|fuel|transmission.
 * Nothing in it identifies one vehicle (no plate, no VIN).
 */
export function fingerprintKey(fp: VehicleFingerprint): string {
  return [
    fp.kind,
    fp.make,
    fp.model.toLowerCase(),
    fp.modelYear,
    fp.displacementCc ?? '',
    fp.engineCodes.join('+'),
    fp.fuelType ?? '',
    fp.transmission ?? '',
  ].join('|');
}
