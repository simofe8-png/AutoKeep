import type { MarketCode, Powertrain } from '@/domain';

import { compact } from './match';
import type {
  AcquiredDocument,
  DocumentProfile,
  DocumentType,
  MaintenanceSection,
  PageText,
  VehicleIdentity,
} from './types';

/**
 * Document understanding (deterministic, no per-model rules). Everything is read from the
 * document's own text (and, for authority/market defaults, from the registry entry of the host
 * that published it). Unknown stays unknown.
 */

const TYPE_PATTERNS: [DocumentType, RegExp][] = [
  ['service_manual', /\b(workshop|repair|service) manual\b/i],
  [
    'warranty_maintenance_booklet',
    /(warranty (and|&) maintenance|service (booklet|book)|maintenance (booklet|programme booklet)|חוברת (שירות|אחריות))/i,
  ],
  [
    'maintenance_schedule',
    /(maintenance (schedule|plan|programme|program)|service (schedule|plan)|periodic(al)? maintenance|לוח (טיפולים|אחזקה)|תוכנית טיפול)/i,
  ],
  [
    'owners_manual',
    /(owner'?s? ?(manual|handbook|guide)|user manual|driver'?s manual|ספר (ה)?נהג|ספר (ה)?רכב|הוראות שימוש)/i,
  ],
];

const MARKET_PATTERNS: [MarketCode, RegExp][] = [
  ['IL', /\b(israel|israeli)\b|ישראל/i],
  ['US', /\b(u\.s\.a?\.?|united states|usa)\b(?! ?\/)/i],
  ['CA', /\bcanad(a|ian)\b/i],
  ['UK', /\b(united kingdom|great britain|u\.k\.)\b/i],
  ['EU', /\b(europe|european)\b/i],
  ['AU', /\baustralia(n)?\b/i],
];

const REGIME =
  /\b(long ?life|flexible service|fixed service|QG[0-2]|service indicator|maintenance minder|intelligent service)\b/gi;

const ENGINE =
  /\b(\d\.\d)\s*(?:l\b|litre|liter)?\s*(t-?gdi|gdi|mpi|tsi|tfsi|tdi|puretech|bluehdi|skyactiv-?[gdx]|vtec|hybrid|turbo|ecoboost)?\b/gi;

export function documentType(pages: PageText[], title?: string): DocumentType {
  const head = [title ?? '', ...pages.slice(0, 6).map((p) => p.text)].join('\n');
  for (const [t, re] of TYPE_PATTERNS) if (re.test(head)) return t;
  return 'other';
}

/** Words that may follow a model name without naming a different model. */
const NEUTRAL = new Set([
  'owner',
  'owners',
  'manual',
  'user',
  'users',
  'service',
  'maintenance',
  'handbook',
  'guide',
  'model',
  'models',
  'series',
  'scooter',
  'motorcycle',
  'car',
  'vehicle',
  'my',
  'from',
  'and',
  'the',
  'for',
  'with',
  'edition',
  'version',
  'cc',
  'abs',
  'cbs',
  'e4',
  'e5',
  'euro',
  'petrol',
  'gasoline',
  'diesel',
  'hybrid',
  'electric',
  'ev',
  'hev',
  'phev',
  'km',
  'quick',
  'reference',
]);

/**
 * How a document names the vehicle's model. `exact` = at least one mention not followed by a
 * variant word (e.g. "JET 14 EVO" does NOT name "JET 14"); `variants` = the words that followed.
 */
export function modelMention(
  text: string,
  v: Pick<VehicleIdentity, 'model' | 'displacementCc'>,
): { exact: boolean; variants: string[] } {
  const tokens = v.model
    .toLowerCase()
    .split(/[^a-z0-9֐-׿]+/)
    .filter(Boolean)
    .filter((t) => !(v.displacementCc && /^\d+$/.test(t) && Number(t) === v.displacementCc));
  if (!tokens.length) return { exact: false, variants: [] };
  const esc = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(
    `(?<![a-z0-9])${esc.join('[\\s_-]*')}(?:[\\s_-]*(\\d+))?(?![a-z0-9])(?:[\\s_-]+([a-z][a-z0-9]*))?`,
    'gi',
  );
  const variants = new Set<string>();
  let exact = false;
  for (const m of text.toLowerCase().matchAll(re)) {
    const num = m[1];
    const next = m[2];
    // A trailing number is fine when it is the displacement or a year; otherwise a variant.
    if (num && !(Number(num) === v.displacementCc || /^(19|20)\d\d$/.test(num))) {
      variants.add(num);
      continue;
    }
    if (next && !NEUTRAL.has(next) && !/^\d/.test(next)) {
      variants.add(next);
      continue;
    }
    exact = true;
  }
  return { exact, variants: [...variants] };
}

function yearsIn(s: string): number[] {
  return [...s.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map((m) => Number(m[1]));
}

export function profileDocument(
  doc: AcquiredDocument,
  pages: PageText[],
  v: VehicleIdentity,
): DocumentProfile {
  const all = pages.map((p) => p.text).join('\n');
  const head = pages
    .slice(0, 8)
    .map((p) => p.text)
    .join('\n');
  const title = doc.lead.title ?? '';

  // Markets: as stated by the document's front matter (the owner's own document has no host).
  const markets = MARKET_PATTERNS.filter(([, re]) => re.test(head)).map(([m]) => m);
  const marketBasis = markets.length ? 'document_text' : 'unknown';

  const km = (all.match(/\bkm\b|\bkilomet(er|re)s?\b|ק"מ/gi) ?? []).length;
  const mi = (all.match(/\bmiles?\b/gi) ?? []).length;
  const units =
    km && mi
      ? km > mi * 3
        ? 'km'
        : mi > km * 3
          ? 'mi'
          : 'both'
      : km
        ? 'km'
        : mi
          ? 'mi'
          : 'unknown';

  // Model years: an official listing's link text (the publisher's own statement) or the front
  // matter. Publication/copyright years are NOT model years.
  const frontYears = yearsIn(
    head
      .split('\n')
      .filter((l) => compact(l).includes(compact(v.model)) || /model year|\bMY\s?\d/i.test(l))
      .join(' '),
  );
  const listingYears = doc.lead.via === 'official_listing' ? yearsIn(title) : [];
  const ys = listingYears.length ? listingYears : frontYears;
  const yearFrom = ys.length ? Math.min(...ys) : undefined;
  const yearTo = ys.length ? Math.max(...ys) : undefined;

  const mention = modelMention(`${title}\n${head}`, v);
  const named = mention.exact;

  const engines = [...new Set([...head.matchAll(ENGINE)].map((m) => m[0].trim()))].slice(0, 12);
  const powertrains: Powertrain[] = [];
  if (/plug-in hybrid|phev/i.test(head)) powertrains.push('plugin_hybrid');
  else if (/\bhybrid\b|היברידי/i.test(head)) powertrains.push('hybrid');
  if (/\b(electric vehicle|battery electric|\bEV\b)|חשמלי/i.test(head))
    powertrains.push('electric');
  if (/\bdiesel\b|דיזל/i.test(head)) powertrains.push('diesel');

  const edition =
    /(edition|édition|ausgabe|printed|version|מהדורה)[^\n]{0,40}/i.exec(head)?.[0]?.trim() ??
    undefined;

  return {
    type: documentType(pages, title),
    // The owner's own vehicle document (AutoKeep reads no other documents).
    authority: 'vehicle_document',
    manufacturer: undefined,
    models: named ? [v.model] : [],
    modelVariants: mention.variants,
    yearFrom,
    yearTo,
    engines,
    displacementsCc: [],
    powertrains,
    markets,
    marketBasis,
    units,
    regimes: [...new Set([...all.matchAll(REGIME)].map((m) => m[1].toLowerCase()))],
    hasSevereSchedule:
      /(severe|harsh|difficult|extreme) (driving |operating |usage |use )?(conditions|service|maintenance)|תנאי (שימוש|נהיגה) קשים/i.test(
        all,
      ),
    edition,
    language: /[֐-׿]{3,}/.test(head) ? 'he' : 'en',
  };
}

const SECTION =
  /(maintenance schedule|service schedule|periodic(al)? maintenance|maintenance (chart|intervals?|table|plan|programme|program)|service intervals?|scheduled maintenance|maintenance service intervals|לוח (טיפולים|אחזקה)|טיפולים תקופתיים|תחזוקה תקופתית)/i;

/** Pages that carry maintenance schedules (headings first, then interval density). */
export function findMaintenanceSections(pages: PageText[]): MaintenanceSection[] {
  const out: MaintenanceSection[] = [];
  for (const p of pages) {
    const heading = p.lines.find((l) => SECTION.test(l.text) && l.text.length < 120);
    const intervals = (
      p.text.match(
        /\b\d{1,3}(?:[,. ]\d{3})*\s*(?:km|miles?|mi)\b|\b\d{1,3}\s*(?:months?|years?)\b/gi,
      ) ?? []
    ).length;
    const marks = p.lines.filter(
      (l) => l.items.filter((i) => /^[IRCLAT]$/.test(i.str.trim())).length >= 3,
    ).length;
    const score = (heading ? 5 : 0) + Math.min(intervals, 10) + Math.min(marks, 10);
    if (heading && score >= 6) out.push({ page: p.n, heading: heading.text, score });
    else if (!heading && marks >= 4)
      out.push({ page: p.n, heading: '(table without heading)', score });
  }
  return out.sort((a, b) => a.page - b.page);
}
