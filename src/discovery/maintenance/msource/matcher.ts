import type { MaintenanceRequirement } from '@/domain';

import type { DocumentType, PageText } from '../types';
import { equivalentEngineCodes, explicitAliases } from './engineAliases';
import { bodyVariantOf, type VehicleFingerprint } from './fingerprint';
import type {
  ApplicabilityScope,
  CanonicalOperation,
  ItemApplicability,
  DimensionVerdict,
  DocumentApplicability,
  MatchDimension,
  MatchResult,
  MatchStatus,
} from './types';

/**
 * Vehicle applicability matching (Phase 13). A source is NOT applicable merely because make and
 * model match: model, year range, displacement, engine code and fuel are each evaluated from the
 * DOCUMENT'S OWN TEXT (never from discovery metadata), then each evidence row's own qualifiers
 * (engine / fuel / regime) are applied on top. A schedule for a different engine is
 * NOT_APPLICABLE and can never become the vehicle's schedule.
 */

/** Usability order: higher = more usable. NOT_APPLICABLE and CONFLICTING are never usable. */
export const MATCH_RANK: Record<MatchStatus, number> = {
  EXACT: 6,
  STRONG: 5,
  SUPPORTED: 4,
  PARTIAL: 3,
  INSUFFICIENT: 2,
  CONFLICTING: 1,
  NOT_APPLICABLE: 0,
};

export const USABLE_MATCH: readonly MatchStatus[] = ['EXACT', 'STRONG', 'SUPPORTED'];

const worse = (a: MatchStatus, b: MatchStatus) => (MATCH_RANK[a] <= MATCH_RANK[b] ? a : b);

const DISPLACEMENT_TOLERANCE_CC = 60;

/**
 * Engine-designation vocabulary across manufacturers (DATA, not vehicle logic): words that, after
 * a litre label, mark it as an engine ("1.4 TSI", "1.6 VVT-i", "2.0 Skyactiv-G").
 */
export const PETROL_ENGINE_WORDS = [
  'petrol',
  'gasoline',
  'benzin',
  'benzina',
  'gasolina',
  'essence',
  '16v',
  '8v',
  '12v',
  '24v',
  'mpi',
  'fsi',
  'tsi',
  'tfsi',
  'gdi',
  't-gdi',
  'mpi',
  'dohc',
  'sohc',
  'duratec',
  'ecoboost',
  'ti-vct',
  'sigma',
  'zetec',
  'puretech',
  'vti',
  'thp',
  'tce',
  'sce',
  'vtec',
  'i-vtec',
  'vvt-i',
  'dual vvt-i',
  'skyactiv-g',
  'mivec',
  'dig-t',
  'cvvt',
  'tgdi',
  'multiair',
  'fire',
  'ecotec',
  'turbo',
];
export const DIESEL_ENGINE_WORDS = [
  'diesel',
  'tdi',
  'tdci',
  'ecoblue',
  'crdi',
  'hdi',
  'bluehdi',
  'dci',
  'd-4d',
  'skyactiv-d',
  'i-dtec',
  'multijet',
  'jtd',
  'cdti',
  'cdi',
  'bluetec',
  'dci',
  'sdi',
  'tddi',
];
const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ENGINE_ALT = [...PETROL_ENGINE_WORDS, ...DIESEL_ENGINE_WORDS].map(esc).join('|');
const LITRES = new RegExp(
  `\\b([0-6])[.,](\\d{1,2})\\s*(?:-?\\s*(?:l|litre|liter|ltr)\\b|\\s*(?:${ENGINE_ALT})(?![a-z0-9]))`,
  'gi',
);
const PETROL_RE = new RegExp(
  `(?<![a-z0-9])(${PETROL_ENGINE_WORDS.map(esc).join('|')})(?![a-z0-9])|בנזין`,
  'i',
);
const DIESEL_RE = new RegExp(
  `(?<![a-z0-9])(${DIESEL_ENGINE_WORDS.map(esc).join('|')})(?![a-z0-9])|דיזל`,
  'i',
);
const CC = /\b(\d{3,4})\s*(?:cc|cm3|cm³|ccm|סמ"ק|סמ״ק)(?![a-z])/gi;
const RANGE =
  /\b((?:19|20)\d\d)\s*(?:-|–|—|to|bis|a|עד)\s*((?:19|20)\d\d|on|onwards|present|heute)?\b/gi;

function displacementsIn(text: string): number[] {
  const out = new Set<number>();
  for (const m of text.matchAll(LITRES)) {
    const l = Number(`${m[1]}.${m[2]}`);
    if (l >= 0.6 && l <= 6.5) out.add(Math.round(l * 1000));
  }
  for (const m of text.matchAll(CC)) {
    const n = Number(m[1]);
    if (n >= 600 && n <= 6500) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Engine facts a line states itself: displacements (cc) and petrol / diesel engine words. */
export function engineFactsOf(text: string): {
  displacementsCc: number[];
  fuels: ('petrol' | 'diesel')[];
} {
  return {
    displacementsCc: displacementsIn(text),
    fuels: [
      ...(PETROL_RE.test(text) ? (['petrol'] as const) : []),
      ...(DIESEL_RE.test(text) ? (['diesel'] as const) : []),
    ],
  };
}

/** Year ranges stated next to the model (title, headings, front matter lines). */
function yearRanges(
  lines: string[],
  model: string,
  titles: readonly string[],
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  const m = model.toLowerCase().replace(/[^a-z0-9]+/g, '');
  for (const line of lines) {
    if (
      !line
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .includes(m) &&
      !/model year|\bMY\s?\d/i.test(line)
    ) {
      continue;
    }
    let ranged = false;
    for (const r of line.matchAll(RANGE)) {
      const from = Number(r[1]);
      const toRaw = r[2];
      if (!toRaw) continue;
      const to = /^\d+$/.test(toRaw) ? Number(toRaw) : 2100;
      if (to >= from && to - from <= 25) {
        out.push({ from, to });
        ranged = true;
      }
    }
    // A page TITLE naming the model and one year ("Fiesta 2015 Owner's Manual"). Never other PDF
    // lines: front matter carries print / edition years that are not model years.
    if (
      !ranged &&
      titles.includes(line) &&
      line.length <= 120 &&
      !/©|copyright|printed|updated|edition/i.test(line)
    ) {
      const ys = [...line.matchAll(/\b((?:19|20)\d\d)\b/g)].map((y) => Number(y[1]));
      if (ys.length === 1) out.push({ from: ys[0], to: ys[0] });
    }
  }
  return out;
}

/** Words that, right after the model name, denote a different vehicle (body / powertrain line). */
const OTHER_VARIANT = new Set([
  'st',
  'rs',
  'van',
  'cargo',
  'electric',
  'ev',
  'phev',
  'hybrid',
  'e',
  'courier',
  'coupe',
  'cabrio',
  'cupra',
  'sportvan',
]);

/**
 * Does the text name the vehicle's model? A whole-word mention counts unless it is followed by a
 * number that makes it another model ("Model 3" ≠ "Model 4"; years / litre labels are neutral) or
 * by a word denoting another vehicle line ("Fiesta ST", "Ibiza Cupra"). Generation marks ("Mk7",
 * "6J") and engine labels ("1.25") are not other models.
 */
export function namesModel(text: string, model: string): { exact: boolean; variants: string[] } {
  const tokens = model
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (!tokens.length) return { exact: false, variants: [] };
  // Tokens are [a-z0-9] only: no escaping needed.
  const body = tokens.join('[\\s_-]*');
  const re = new RegExp(
    `(?<![a-z0-9])${body}(?![a-z0-9])([\\s_-]*(\\d+)(?![a-z0-9]|[.,]\\d))?(?:[\\s_-]+([a-z]+))?`,
    'gi',
  );
  const variants = new Set<string>();
  let exact = false;
  for (const m of text.toLowerCase().matchAll(re)) {
    const num = m[2];
    const word = m[3];
    if (num && !/^(19|20)\d\d$/.test(num) && !/\d$/.test(tokens[tokens.length - 1])) {
      variants.add(num);
      continue;
    }
    if (word && OTHER_VARIANT.has(word)) {
      variants.add(word);
      continue;
    }
    exact = true;
  }
  return { exact, variants: [...variants] };
}

/** HTML <title>/<h1> text (the document's own words), for matching. */
export function htmlHeadings(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(title|h1|h2)[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (t) out.push(t);
  }
  return out.slice(0, 20);
}

export function readDocumentApplicability(
  pages: PageText[],
  fp: VehicleFingerprint,
  extraHeadings: string[] = [],
  sectionPages: number[] = [],
): DocumentApplicability {
  const front = pages.slice(0, 8);
  const focus = pages.filter((p) => sectionPages.includes(p.n));
  const lines = [
    ...extraHeadings,
    ...front.flatMap((p) => p.lines.map((l) => l.text)),
    ...focus.flatMap((p) => p.lines.map((l) => l.text)),
  ];
  const headText = lines.join('\n');
  const mention = namesModel(headText, fp.model);
  const ranges = yearRanges(lines, fp.model, extraHeadings);
  // Several DISJOINT ranges for the model (a page about many generations): the document has no
  // single model-year scope — only an item's own section can give its years.
  const disjoint = ranges.filter(
    // Consecutive generations share a boundary year ("2011–2017", "2017–2021"): still distinct.
    (r, i) => !ranges.some((o, j) => j < i && o.from < r.to && r.from < o.to),
  );
  // The document's own TITLE / heading scope takes precedence over ranges elsewhere on the page
  // (navigation, other generations): "Toyota Corolla 1.6 petrol (2016–2018)".
  // A title RANGE wins. A single title year ("… 1.6 2016 …", often the version's start year)
  // selects the page's own range containing it, and stands alone only when there is none.
  const titleAll = yearRanges(extraHeadings, fp.model, extraHeadings);
  const titleTrue = titleAll.filter((r) => r.from < r.to);
  const titleSingles = titleAll.filter((r) => r.from === r.to);
  const containing = ranges.filter(
    (r) => r.from < r.to && titleSingles.some((t) => t.from >= r.from && t.from <= r.to),
  );
  const titleRanges = titleTrue.length ? titleTrue : containing.length ? containing : titleSingles;
  const titleCovering = titleRanges.filter((r) => fp.modelYear >= r.from && fp.modelYear <= r.to);
  const multiGeneration = !titleRanges.length && disjoint.length >= 2;
  // The source's own heading states it covers ALL models of the line ("Serviceplan: Alle Modelle
  // & Motoren"): every model year of this model, stated — not inferred.
  const allModelYears = !titleRanges.length && extraHeadings.some((h) => ALL_MODELS.test(h));
  const covering = titleRanges.length
    ? titleCovering
    : multiGeneration
      ? []
      : ranges.filter((r) => fp.modelYear >= r.from && fp.modelYear <= r.to);
  const chosen = titleRanges.length
    ? (titleCovering[0] ?? titleRanges[0])
    : multiGeneration
      ? null
      : (covering[0] ?? ranges[0] ?? null);
  // Engine codes related to the vehicle's code that the text names (CGG → CGG, CGGA, CGGB …),
  // collected so that a DIFFERENT code can exclude the document; only identical or explicitly
  // aliased codes match (matchDocument).
  const codes = new Set<string>();
  const allText = `${headText}\n${pages.map((p) => p.text).join('\n')}`;
  for (const code of fp.engineCodes) {
    const stem = code.slice(0, 3).replace(/[^A-Z0-9]/g, '');
    if (stem.length < 3) continue;
    for (const m of allText.matchAll(new RegExp(`\\b(${stem}[A-Z0-9]?)\\b`, 'g'))) {
      codes.add(m[1]);
    }
  }
  // DECLARED scope: titles / headings, and lines that name the model together with engines
  // ("for the Fiesta 1.0 EcoBoost and 1.6 Ti-VCT"). Only a declared scope can exclude a vehicle;
  // incidental mentions elsewhere can only confirm one.
  const modelWords = fp.model
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('[\\s_-]*');
  const scopePhrase = new RegExp(
    `\\b(for|applies to|valid for|applicable to|für|gilt für|para|pour)\\b[^.]{0,24}\\b${modelWords}\\b`,
    'i',
  );
  const declared = [
    ...extraHeadings,
    ...lines.filter((l) => scopePhrase.test(l) && displacementsIn(l).length > 0),
  ].join('\n');
  const scope = `${headText}\n${focus.map((p) => p.text).join('\n')}`;
  const diesel = DIESEL_RE.test(declared);
  const petrol = PETROL_RE.test(declared);
  return {
    models: mention.exact ? [fp.model] : [],
    modelVariants: mention.variants,
    yearFrom: covering.length ? chosen!.from : chosen ? chosen.from : allModelYears ? 1900 : null,
    yearTo: covering.length ? chosen!.to : chosen ? chosen.to : allModelYears ? 2100 : null,
    ...(allModelYears && !chosen ? { yearBasis: 'all_models_stated' as const } : {}),
    engineCodes: [...codes].sort(),
    displacementsCc: displacementsIn(declared),
    displacementsMentioned: displacementsIn(scope),
    fuels: [...(petrol ? ['petrol'] : []), ...(diesel ? ['diesel'] : [])],
    markets: [],
  };
}

function statusOf(d: Partial<Record<MatchDimension, DimensionVerdict>>): MatchStatus {
  const vals = Object.values(d);
  if (d.engineCode === 'mismatch' && d.displacement === 'match') return 'CONFLICTING';
  if (vals.includes('mismatch')) return 'NOT_APPLICABLE';
  if (d.model !== 'match') return 'INSUFFICIENT';
  if (d.year !== 'match') return 'PARTIAL';
  if (vals.includes('vehicle_unknown')) return 'PARTIAL';
  if (d.engineCode === 'match') return 'EXACT';
  if (d.engineCode === 'family' || d.displacement === 'match') return 'STRONG';
  return 'SUPPORTED';
}

export function matchDocument(
  doc: DocumentApplicability,
  fp: VehicleFingerprint,
  aliases: Record<string, string[]> = explicitAliases,
): MatchResult {
  const d: Partial<Record<MatchDimension, DimensionVerdict>> = {};
  const reasons: string[] = [];
  d.make = 'match';
  if (doc.models.length) d.model = 'match';
  else {
    d.model = 'unstated';
    reasons.push(
      doc.modelVariants.length
        ? `the document names other variants (${doc.modelVariants.join(', ')}), not "${fp.model}"`
        : `the document does not name "${fp.model}"`,
    );
  }
  if (doc.yearFrom == null) {
    d.year = 'unstated';
    reasons.push('the document does not state its model years');
  } else if (fp.modelYear >= doc.yearFrom && fp.modelYear <= (doc.yearTo ?? doc.yearFrom)) {
    d.year = 'match';
  } else {
    d.year = 'mismatch';
    reasons.push(`the document covers ${doc.yearFrom}–${doc.yearTo}, not ${fp.modelYear}`);
  }
  const near = (c: number) => Math.abs(c - fp.displacementCc!) <= DISPLACEMENT_TOLERANCE_CC;
  if (doc.displacementsCc.length) {
    if (!fp.displacementCc) d.displacement = 'vehicle_unknown';
    else if (doc.displacementsCc.some(near)) d.displacement = 'match';
    else {
      d.displacement = 'mismatch';
      reasons.push(
        `engines named: ${doc.displacementsCc.join(', ')} cc — not ${fp.displacementCc} cc`,
      );
    }
  } else if (
    fp.displacementCc &&
    (doc.displacementsMentioned ?? []).some(near) &&
    // A page that lists the whole engine range (957 … 1800 cc) is generic, not engine-specific:
    // an incidental mention confirms the engine only when the document is about ≤ 2 engines.
    (doc.displacementsMentioned ?? []).length <= 2
  ) {
    d.displacement = 'match';
  } else d.displacement = 'unstated';
  if (doc.engineCodes.length && fp.engineCodes.length) {
    if (doc.engineCodes.some((c) => fp.engineCodes.includes(c))) d.engineCode = 'match';
    // Never by prefix / substring (CGG ≠ CGGB): only an explicitly listed equivalence.
    else if (
      doc.engineCodes.some((c) => fp.engineCodes.some((v) => equivalentEngineCodes(c, v, aliases)))
    ) {
      d.engineCode = 'family';
    } else {
      d.engineCode = 'mismatch';
      reasons.push(
        `engine codes named: ${doc.engineCodes.join(', ')} — not ${fp.engineCodes.join('/')}`,
      );
    }
  } else d.engineCode = 'unstated';
  if (doc.fuels.length && fp.fuelType && ['petrol', 'diesel'].includes(fp.fuelType)) {
    d.fuel = doc.fuels.includes(fp.fuelType) ? 'match' : 'mismatch';
    if (d.fuel === 'mismatch') reasons.push(`fuel: ${doc.fuels.join('/')} only`);
  }
  d.market = doc.markets.length
    ? doc.markets.includes(fp.market)
      ? 'match'
      : 'unstated'
    : 'unstated';
  if (doc.markets.length && !doc.markets.includes(fp.market)) {
    reasons.push(`market stated: ${doc.markets.join(', ')} (not ${fp.market})`);
  }
  return { status: statusOf(d), dimensions: d, reasons };
}

/** Applies one evidence row's own qualifiers on top of its document's match. */
export function matchEvidence(
  doc: MatchResult,
  r: MaintenanceRequirement,
  fp: VehicleFingerprint,
  facts: { serviceRegime?: string | null } = {},
  regimeMap: Record<string, string[]> = {},
): MatchResult {
  const d = { ...doc.dimensions };
  const reasons = [...doc.reasons];
  let status = doc.status;
  const a = r.applicability;
  if (a.displacementCc) {
    const { min = 0, max = 99999 } = a.displacementCc;
    if (!fp.displacementCc) {
      d.displacement = 'vehicle_unknown';
      status = worse(status, 'PARTIAL');
    } else if (fp.displacementCc < min || fp.displacementCc > max) {
      d.displacement = 'mismatch';
      reasons.push(`row is for ${min}–${max} cc engines`);
      status = 'NOT_APPLICABLE';
    } else if (status === 'SUPPORTED') status = 'STRONG';
  }
  if (a.powertrains?.length) {
    if (!fp.fuelType) {
      d.fuel = 'vehicle_unknown';
      status = worse(status, 'PARTIAL');
    } else if (!a.powertrains.includes(fp.fuelType)) {
      d.fuel = 'mismatch';
      reasons.push(`row is for ${a.powertrains.join('/')}`);
      status = 'NOT_APPLICABLE';
    }
  }
  if (a.engineCodes?.length && fp.engineCodes.length) {
    if (!a.engineCodes.some((c) => fp.engineCodes.includes(c))) {
      d.engineCode = 'mismatch';
      reasons.push(`row is for engine ${a.engineCodes.join('/')}`);
      status = 'NOT_APPLICABLE';
    }
  }
  if (a.serviceRegimes?.length) {
    // Row regimes as vehicle codes: literal codes, plus words the document maps to codes.
    const codes = [
      ...new Set(
        a.serviceRegimes.flatMap((r) => {
          const k = r.toUpperCase().replace(/\s+/g, '');
          return /^[A-Z]{1,3}\d{1,2}$/.test(k) ? [k] : (regimeMap[k] ?? []);
        }),
      ),
    ].sort();
    const regime = facts.serviceRegime?.toUpperCase().replace(/\s+/g, '');
    if (!codes.length) {
      d.serviceRegime = 'vehicle_unknown';
      reasons.push(
        `row applies to a service regime (${a.serviceRegimes.join('/')}) the document does not map to a vehicle code`,
      );
      status = worse(status, 'PARTIAL');
    } else if (!regime) {
      d.serviceRegime = 'vehicle_unknown';
      reasons.push(`row applies to service regime ${codes.join('/')} (vehicle's code unknown)`);
      if (status !== 'NOT_APPLICABLE' && status !== 'CONFLICTING') {
        return {
          status: worse(status, 'PARTIAL'),
          baseStatus: status,
          conditional: { serviceRegimes: codes },
          dimensions: d,
          reasons,
        };
      }
    } else if (!codes.includes(regime)) {
      d.serviceRegime = 'mismatch';
      status = 'NOT_APPLICABLE';
    } else d.serviceRegime = 'match';
  }
  return { status, dimensions: d, reasons };
}

// ---------- item-level applicability (owner correction 2026-10-02) ----------

/**
 * Operations whose interval does not depend on the engine when the source states it for the
 * model / years (brake fluid, cabin filter, general and brake / battery inspections). Every
 * other operation is powertrain-dependent: it needs an engine-level scope or an explicit
 * all-engines statement by the source. Nothing is assumed engine-independent beyond this list.
 */
export const MODEL_WIDE_OPERATIONS: readonly CanonicalOperation[] = [
  'brake_fluid',
  'cabin_filter',
  'general_inspection',
  'brakes_inspection',
  'battery_inspection',
];

const ENGINE_SCOPES: readonly ApplicabilityScope[] = [
  'EXACT_ENGINE',
  'ENGINE_FAMILY',
  'ALL_ENGINES',
];

const ALL_MODELS =
  /\b(all models|all model years|alle modelle|todos los modelos|tous les modèles)\b|כל הדגמים/i;

const ALL_ENGINES =
  /\b(all (engines|engine types|models|versions|variants)|every engine|alle (motoren|motorisierungen|modelle|varianten)|todos los (motores|modelos)|tous (les )?(moteurs|modèles))\b/i;

export function statesAllEngines(text: string): boolean {
  return ALL_ENGINES.test(text);
}

/** The source's own all-engines words, quoted (the line around them, ≤ 120 characters). */
export function allEnginesPhrase(text: string): string | null {
  const m = ALL_ENGINES.exec(text);
  if (!m) return null;
  const start = text.lastIndexOf('\n', m.index) + 1;
  const end = text.indexOf('\n', m.index);
  return text
    .slice(start, end < 0 ? undefined : end)
    .trim()
    .slice(0, 120);
}

const MANUFACTURER_DOCS: readonly DocumentType[] = [
  'owners_manual',
  'warranty_maintenance_booklet',
  'maintenance_schedule',
  'service_manual',
];

/** Years stated by one applicability statement (a range, else one year). */
export function yearsOfStatement(line: string): { from: number; to: number } | null {
  for (const r of line.matchAll(RANGE)) {
    if (!r[2]) continue;
    const from = Number(r[1]);
    const to = /^\d+$/.test(r[2]) ? Number(r[2]) : 2100;
    if (to >= from && to - from <= 25) return { from, to };
  }
  const ys = [...line.matchAll(/\b((?:19|20)\d\d)\b/g)].map((y) => Number(y[1]));
  return ys.length === 1 ? { from: ys[0], to: ys[0] } : null;
}

export interface ItemContext {
  operation: CanonicalOperation;
  official: boolean;
  documentType: DocumentType | null;
  /** The source identity already establishes a manufacturer document (brand-domain manual). */
  manufacturerDocument?: boolean;
  /** Years the item's own section states ("the following schedule is from a 2019 … manual"). */
  sectionYears: { from: number; to: number } | null;
  /** Section text before the item (headings, scope statements). */
  sectionText: string;
  facts?: { serviceRegime?: string | null };
}

/**
 * One item's applicability: its own section's years (else the document's), its row qualifiers,
 * and the SCOPE the source's structure / wording gives it — then whether that scope is
 * sufficient for this operation. Combined with the document's applicability into one result.
 */
export function matchItem(
  doc: DocumentApplicability,
  r: MaintenanceRequirement,
  fp: VehicleFingerprint,
  ctx: ItemContext,
): { match: MatchResult; item: ItemApplicability } {
  const years =
    ctx.sectionYears ??
    (doc.yearFrom != null ? { from: doc.yearFrom, to: doc.yearTo ?? doc.yearFrom } : null);
  const yearsBasis: ItemApplicability['yearsBasis'] = ctx.sectionYears
    ? 'section'
    : years
      ? 'document'
      : 'none';
  const base = matchDocument(
    { ...doc, yearFrom: years?.from ?? null, yearTo: years?.to ?? null },
    fp,
  );
  if (ctx.sectionYears && doc.yearFrom != null) {
    base.reasons.push(`item section states ${years!.from}–${years!.to}`);
  }
  const evid = matchEvidence(base, r, fp, ctx.facts ?? {}, doc.regimeMap ?? {});

  const a = r.applicability;
  const rowCode = a.engineCodes?.some((c) => fp.engineCodes.includes(c));
  const rowCc =
    a.displacementCc &&
    fp.displacementCc != null &&
    fp.displacementCc >= (a.displacementCc.min ?? 0) &&
    fp.displacementCc <= (a.displacementCc.max ?? 99999);
  const yearOk = base.dimensions.year === 'match';
  let scope: ApplicabilityScope;
  let basis: string;
  if (rowCode) [scope, basis] = ['EXACT_ENGINE', 'the item names the engine code'];
  else if (rowCc) [scope, basis] = ['ENGINE_FAMILY', 'the item states the engine displacement'];
  else if (base.dimensions.engineCode === 'match')
    [scope, basis] = ['EXACT_ENGINE', 'the document names the engine code'];
  else if (base.dimensions.engineCode === 'family' || base.dimensions.displacement === 'match')
    [scope, basis] = ['ENGINE_FAMILY', 'the document states the engine family / displacement'];
  else if (doc.allEnginesStated || statesAllEngines(`${ctx.sectionText}\n${r.taskText ?? ''}`)) {
    const quote =
      allEnginesPhrase(`${ctx.sectionText}\n${r.taskText ?? ''}`) ?? doc.allEnginesPhrase ?? '';
    [scope, basis] = ['ALL_ENGINES', `the source states all engines: "${quote}"`];
  } else if (
    ctx.official &&
    yearOk &&
    (ctx.manufacturerDocument === true ||
      (ctx.documentType != null && MANUFACTURER_DOCS.includes(ctx.documentType)))
  ) {
    [scope, basis] = [
      'ALL_ENGINES',
      `the manufacturer's own ${ctx.documentType} for this model year; the item is not engine-qualified`,
    ];
  } else if (years)
    [scope, basis] = ['MODEL_YEAR_RANGE', `${yearsBasis} years ${years.from}–${years.to}`];
  else [scope, basis] = ['MODEL_GENERIC', 'the source names the model only'];
  // A document for a body variant (identified by its official naming): a known different body
  // excludes; an unknown variant token cannot be related to the vehicle's body → MODEL_VARIANT.
  let variantMismatch = false;
  if (doc.variantToken) {
    const docBody = bodyVariantOf(doc.variantToken);
    if (docBody && fp.bodyVariant && docBody !== fp.bodyVariant) {
      variantMismatch = true;
      evid.dimensions.body = 'mismatch';
      evid.reasons.push(
        `the document is for the ${docBody} body, the vehicle is a ${fp.bodyVariant}`,
      );
    } else if (!docBody || !fp.bodyVariant) {
      [scope, basis] = [
        'MODEL_VARIANT',
        `the document is for the "${doc.variantToken}" variant; its relation to the vehicle's body (${fp.bodyVariant ?? 'unknown'}) is not established`,
      ];
      evid.dimensions.body = 'vehicle_unknown';
    } else evid.dimensions.body = 'match';
  }
  const sufficient = MODEL_WIDE_OPERATIONS.includes(ctx.operation)
    ? scope !== 'MODEL_GENERIC' && scope !== 'MODEL_VARIANT'
    : ENGINE_SCOPES.includes(scope);
  const item: ItemApplicability = { scope, basis, sufficient, years, yearsBasis };
  if (variantMismatch) {
    return { match: { ...evid, status: 'NOT_APPLICABLE', conditional: undefined }, item };
  }

  const raw = evid.conditional && evid.baseStatus ? evid.baseStatus : evid.status;
  let status: MatchStatus = raw;
  const reasons = [...evid.reasons];
  if (USABLE_MATCH.includes(raw)) {
    if (!sufficient) {
      status = 'PARTIAL';
      reasons.push(
        `scope ${scope} is not sufficient for the powertrain-dependent operation ${ctx.operation}`,
      );
    } else status = scope === 'EXACT_ENGINE' ? 'EXACT' : 'STRONG';
  }
  const match: MatchResult =
    evid.conditional && USABLE_MATCH.includes(raw)
      ? { ...evid, reasons, status: 'PARTIAL', baseStatus: status }
      : { ...evid, reasons, status };
  return { match, item };
}

const SCHEDULE_STATEMENT =
  /\b(schedule|servicing|service|maintenance|manual|handbook|plan|intervals?|models?|for|wartung|inspektion|plan de mantenimiento|entretien)\b/i;

/**
 * The item's own section: the lines of its page (HTML section / PDF page) before the item. The
 * nearest statement there that names the model and a year range / year ("The following servicing
 * schedule is from a 2019 Ford Fiesta owner's manual") sets the item's years.
 */
export function sectionContextOf(
  pages: PageText[],
  item: { page: number; text: string },
  fp: VehicleFingerprint,
): { sectionYears: { from: number; to: number } | null; sectionText: string } {
  const page = pages.find((p) => p.n === item.page);
  if (!page) return { sectionYears: null, sectionText: '' };
  const key = item.text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 30);
  let end = page.lines.findIndex((l) =>
    l.text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .includes(key),
  );
  if (end < 0) end = page.lines.length;
  const before = page.lines.slice(0, end).map((l) => l.text);
  const model = fp.model.toLowerCase().replace(/[^a-z0-9]+/g, '');
  let sectionYears: { from: number; to: number } | null = null;
  for (const line of before) {
    const compactLine = line.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const headingRange =
      line.length <= 80 && line.split(/\s+/).length <= 10 && /(19|20)\d\d\s*(-|–|—|to)/.test(line);
    if (!headingRange && (!compactLine.includes(model) || !SCHEDULE_STATEMENT.test(line))) continue;
    const y = yearsOfStatement(line);
    if (y) sectionYears = y; // the nearest statement wins
  }
  return { sectionYears, sectionText: before.join('\n') };
}
