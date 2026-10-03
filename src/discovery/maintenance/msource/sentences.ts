import type {
  IsoDate,
  MaintenanceRequirement,
  Powertrain,
  RequirementAction,
  RequirementApplicability,
  RequirementInterval,
  TaskCode,
  UsageCondition,
} from '@/domain';

import { taskOf } from '../extract';
import type { AcquiredDocument, ExtractedRequirement, PageText, TextLine } from '../types';

/**
 * Column-aware, multilingual sentence extraction (M-SOURCE Phase 12). Complements the table
 * extractor (src/discovery/maintenance/extract.ts) for prose schedules:
 *
 *  - two-column PDF pages are split into columns before sentences are assembled (pdf lines
 *    interleave columns), and sentences may span lines (hyphenation joined);
 *  - English, German, Spanish, French and Hebrew interval phrasing;
 *  - the periodic service itself is recognized ("serviced after a fixed interval of …");
 *  - qualifiers (service regime, severe use, engine) come from the nearest subsection heading
 *    first; a sentence that names competing regimes without a deciding heading is SKIPPED;
 *  - display / reset / indicator sentences and conditional work ("if necessary") are skipped.
 * Deterministic: no AI, no per-model rules. Every result keeps the tokens to ground on its page.
 */

export const SENTENCE_EXTRACTOR_ID = 'msource-sentences/1';

const TASKS_I18N: [TaskCode, RegExp][] = [
  ['oil_filter', /ölfilter|filtro de aceite|filtre à huile/i],
  ['engine_oil', /motoröl|ölwechsel|aceite (del )?motor|cambio de aceite|huile moteur|vidange/i],
  [
    'cabin_filter',
    /pollenfilter|innenraumfilter|staubfilter|filtro (de )?(polen|habitáculo|antipolen)|filtre (à pollen|d'habitacle)/i,
  ],
  ['air_filter', /luftfilter|filtro de aire|filtre à air/i],
  ['fuel_filter', /kraftstofffilter|filtro de combustible|filtre à (carburant|gazole)/i],
  ['spark_plugs', /zündkerzen|bujías|bougies/i],
  ['brake_fluid', /bremsflüssigkeit|líquido de frenos|liquide de frein/i],
  ['coolant', /kühlmittel|kühlflüssigkeit|(líquido )?refrigerante|liquide de refroidissement/i],
  ['timing_belt', /zahnriemen|correa de distribución|courroie de distribution/i],
  ['auxiliary_belt', /keilrippenriemen|correa (auxiliar|de accesorios)|courroie d'accessoires/i],
];

/** The periodic service itself (checked last: item tasks win). */
const PERIODIC =
  /\b(serviced|fixed (service )?interval|service interval|inspection service|annual service|periodic service|interim service|full service|scheduled service|main service|oil (change )?service|maintenance service|inspektion|wartung|revisión|révision|entretien périodique)\b|טיפול (תקופתי|שנתי)/i;

const SKIP =
  /\b(display|indicator|reset|warning lamp|anzeige|zurücksetzen|indicador|témoin|if (necessary|required|needed)|as (necessary|required)|when needed|bei bedarf|nach bedarf|si es necesario|si nécessaire)\b/i;

const EVERY = /\b(every|each|interval|after|alle|jede[nrs]?|cada|tous les|toutes les)\b|כל|אחרי/i;

const NUM = '(\\d{1,3}(?:[ .,  ]\\d{3})+|\\d{3,6})';
const DIST = new RegExp(`${NUM}\\s*(km|kms|kilomet(?:er|re)s?|miles?|mi\\b|ק"מ|ק״מ)`, 'i');

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  ten: 10,
  ein: 1,
  eine: 1,
  einem: 1,
  zwei: 2,
  drei: 3,
  vier: 4,
  fünf: 5,
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
};
const TIME = new RegExp(
  `(\\d{1,2}|${Object.keys(WORD_NUMBERS).join('|')})\\s*(months?|years?|yrs?|monate?n?|jahre?n?|meses|años|anos|mois|ans?|חודשים|שנים|שנה)\\b`,
  'i',
);
const ANNUAL =
  /\b(annually|every year|each year|jährlich|anual(?:mente)?|annuel(?:lement)?)\b|כל שנה/i;

const REPLACE =
  /\b(replace|change|renew|replacement|wechseln|ersetzen|erneuern|tauschen|wechsel|sustituir|cambiar|cambio|sustitución|remplacer|remplacement|vidange)\b|החלפ/i;
const INSPECT =
  /\b(inspect|check|test|inspection|prüfen|kontrollieren|prüfung|revisar|comprobar|inspección|contrôler|vérifier|contrôle)\b|בדיק/i;

/** A regime word (FIXED / LONGLIFE) or a manufacturer service-plan code ("XX1"). */
type Regime = string;
const REGIME_TERMS: [Regime, RegExp][] = [
  ['LONGLIFE', /long ?life|flexible (service|interval)|flexibler? service|variable(r)? service/i],
  [
    'FIXED',
    /fixed (service|interval)|feste[nrs]? (service|intervall)|intervalo fijo|intervalle fixe/i,
  ],
];

/**
 * Service-plan codes named in a "code(s)" context ("the PR code … is XX1", "codes XX0 or XX2"),
 * whatever the manufacturer's code format (1–3 capitals + 1–2 digits). Not recognized anywhere
 * else in the text (a lone "E10" or "A3" is never a regime).
 */
export function regimeCodesIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(
    /\bcodes?\b|\bcódigos?\b|\bcodes?\b|\bKennzeichnung\b|\bPR-?Nummer\b/gi,
  )) {
    const window = text.slice(m.index, m.index + 110).split(/[.;!?](\s|$)/)[0];
    for (const c of window.matchAll(/\b([A-Z]{1,3}\d{1,2})\b/g)) out.add(c[1]);
  }
  return [...out].sort();
}

function regimesIn(text: string): Regime[] {
  const out = new Set<Regime>();
  for (const [r, re] of REGIME_TERMS) if (re.test(text)) out.add(r);
  for (const c of regimeCodesIn(text)) out.add(c);
  return [...out];
}

const SEVERE =
  /severe|harsh|difficult|extreme|dusty|heavily.?polluted|erschwert|condiciones (severas|duras)|conditions (sévères|difficiles)|תנאי(ם)? קש/i;

// ---------- columns ----------

/**
 * Splits a page into columns when its text is laid out in two: the boundary is the x position
 * with the fewest items crossing it (≥ 20 % of items on each side, ≤ 5 % crossing).
 */
export function splitColumns(page: PageText): TextLine[][] {
  const items = page.lines.flatMap((l) => l.items.filter((i) => i.str.trim()));
  if (items.length < 20) return [page.lines];
  const maxX = Math.max(...items.map((i) => i.x + i.w));
  let best: { b: number; cross: number } | null = null;
  for (let b = maxX * 0.3; b <= maxX * 0.7; b += maxX / 100) {
    const left = items.filter((i) => i.x + i.w <= b).length;
    const right = items.filter((i) => i.x >= b).length;
    const cross = items.length - left - right;
    if (left < items.length * 0.2 || right < items.length * 0.2) continue;
    if (!best || cross < best.cross) best = { b, cross };
  }
  if (!best || best.cross > items.length * 0.05) return [page.lines];
  const col = (pred: (x: number) => boolean): TextLine[] =>
    page.lines
      .map((l) => {
        const its = l.items.filter((i) => pred(i.x));
        return {
          y: l.y,
          items: its,
          text: its
            .map((i) => i.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        };
      })
      .filter((l) => l.text);
  return [col((x) => x < best!.b), col((x) => x >= best!.b)];
}

// ---------- sentences ----------

interface Sentence {
  text: string;
  line: number;
  subheading: string | null;
}

const isHeading = (t: string) =>
  t.length <= 70 &&
  t.split(/\s+/).length <= 8 &&
  !/[.:;,]$/.test(t) &&
  /^[A-ZÄÖÜÁÉÍÓÚÑ֐-׿]/.test(t) &&
  !/\d{3}/.test(t);

export function sentencesOf(lines: TextLine[]): Sentence[] {
  const out: Sentence[] = [];
  let sub: string | null = null;
  let buf = '';
  let start = 0;
  const flush = () => {
    const t = buf.replace(/\s+/g, ' ').trim();
    if (t) out.push({ text: t, line: start, subheading: sub });
    buf = '';
  };
  lines.forEach((l, i) => {
    const t = l.text.trim();
    if (isHeading(t) && !buf) {
      sub = t.replace(/\*+$/, '').trim();
      return;
    }
    if (!buf) start = i;
    buf = buf.endsWith('-') && /^[a-zäöüéèáíóúñ]/.test(t) ? buf.slice(0, -1) + t : `${buf} ${t}`;
    // A sentence ends at ".", "!" or "?" followed by the end of the line (not "15.000").
    if (/[.!?)](\s*["”»])?$/.test(t) && !/\d[.,]$/.test(t)) flush();
  });
  flush();
  // Sentences that ended mid-line are split further.
  return out.flatMap((s) =>
    s.text
      .split(/(?<=[a-zäöüéèáíóúñ)][.!?])\s+(?=[A-ZÄÖÜÁÉÍÓÚÑ●–-])/)
      .map((text) => ({ ...s, text: text.trim() }))
      .filter((x) => x.text),
  );
}

function numberOf(s: string): number | null {
  const t = s.replace(/[ .,  ](?=\d{3}\b)/g, '');
  return /^\d+$/.test(t) ? Number(t) : null;
}

function timeOf(text: string): { months: number; token: string } | null {
  const t = TIME.exec(text);
  if (t) {
    const n = /^\d+$/.test(t[1]) ? Number(t[1]) : WORD_NUMBERS[t[1].toLowerCase()];
    if (!n) return null;
    const years = /^(y|jahr|año|ano|an|שנ)/i.test(t[2]) && !/^mois/i.test(t[2]);
    return { months: years ? n * 12 : n, token: t[0] };
  }
  const a = ANNUAL.exec(text);
  return a ? { months: 12, token: a[0] } : null;
}

export interface SentenceExtractionInput {
  doc: AcquiredDocument;
  pages: PageText[];
  kind: 'car' | 'motorcycle' | 'scooter';
  make: string;
  authorityHint: MaintenanceRequirement['authority'];
  markets: string[];
  models: string[];
  years: { from: number; to: number } | null;
  today: IsoDate;
}

const FIRST_ONLY = /\b(first|initial|erste[nrs]?|primera?|premi[eè]re?)\b/i;

/** Every item task a sentence names (English table vocabulary + other languages). */
function tasksIn(text: string, kind: SentenceExtractionInput['kind']): Set<TaskCode> {
  const out = new Set<TaskCode>();
  const en = taskOf(text, kind);
  if (en) out.add(en);
  for (const [task, re] of TASKS_I18N) if (re.test(text)) out.add(task);
  // English item words beyond the first match.
  for (const [task, re] of [
    ['coolant', /\bcoolant\b|antifreeze/i],
    ['air_filter', /\bair (cleaner|filter)/i],
    ['cabin_filter', /(cabin|pollen) (air )?filter/i],
    ['spark_plugs', /\bspark plugs?/i],
    ['brake_fluid', /\bbrake fluid/i],
    ['timing_belt', /\btiming belt/i],
  ] as [TaskCode, RegExp][]) {
    if (re.test(text)) out.add(task);
  }
  return out;
}

function taskOfSentence(text: string, kind: SentenceExtractionInput['kind']): TaskCode | null {
  const en = taskOf(text, kind);
  if (en) return en;
  for (const [task, re] of TASKS_I18N) if (re.test(text)) return task;
  return PERIODIC.test(text) ? 'periodic_service' : null;
}

export function extractSentences(input: SentenceExtractionInput): {
  extracted: ExtractedRequirement[];
  skipped: { page: number; text: string; reason: string }[];
} {
  const extracted: ExtractedRequirement[] = [];
  const skipped: { page: number; text: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const page of input.pages) {
    for (const column of splitColumns(page)) {
      for (const s of sentencesOf(column)) {
        if (s.text.length > 400) continue;
        const every = EVERY.exec(s.text);
        if (!every) continue;
        // Values are read only AFTER the interval keyword: "cars aged 15 years … every 10,000
        // miles" must not turn the car's age into an interval.
        const tail = s.text.slice(every.index);
        const d = DIST.exec(tail);
        const t = timeOf(tail);
        if (!d && !t) continue;
        const task = taskOfSentence(s.text, input.kind);
        if (!task) continue;
        const tasks = tasksIn(s.text, input.kind);
        if (tasks.size > 1 && ![...tasks].every((x) => x === 'engine_oil' || x === 'oil_filter')) {
          skipped.push({
            page: page.n,
            text: s.text.slice(0, 120),
            reason: 'several items in one sentence',
          });
          continue;
        }
        // Several competing values in one statement (a comparison-table row: "12 months
        // 6 months 12 months") cannot be attributed to this vehicle.
        const times = [...tail.matchAll(new RegExp(TIME.source, 'gi'))].map((m) => m[0]);
        const dists = [...tail.matchAll(new RegExp(DIST.source, 'gi'))].map((m) => m[1]);
        if (
          new Set(times).size > 1 ||
          new Set(dists).size > 1 ||
          times.length > 2 ||
          dists.length > 2
        ) {
          skipped.push({
            page: page.n,
            text: s.text.slice(0, 120),
            reason: 'several values in one statement',
          });
          continue;
        }
        // Opinion / rule-of-thumb statements are advice, not a maintenance schedule.
        if (ADVISORY.test(s.text)) {
          skipped.push({ page: page.n, text: s.text.slice(0, 120), reason: 'advisory statement' });
          continue;
        }
        // "whichever / whatever comes first" is the interval rule, not a first occurrence.
        if (FIRST_ONLY.test(s.text.replace(WHICHEVER_FIRST, ' '))) {
          skipped.push({
            page: page.n,
            text: s.text.slice(0, 120),
            reason: 'first occurrence only',
          });
          continue;
        }
        if (SKIP.test(s.text)) {
          skipped.push({
            page: page.n,
            text: s.text.slice(0, 120),
            reason: 'display / conditional',
          });
          continue;
        }
        const action: RequirementAction | null =
          task === 'periodic_service'
            ? 'other'
            : REPLACE.test(s.text)
              ? 'replacement'
              : INSPECT.test(s.text)
                ? 'inspection'
                : null;
        if (!action) continue;
        // Qualifiers: the subsection heading decides; competing regimes in the sentence alone
        // are ambiguous ("if your vehicle does NOT have LongLife … fixed interval").
        const headRegimes = regimesIn(s.subheading ?? '');
        const sentRegimes = regimesIn(s.text);
        const regimes: Regime[] = headRegimes.length ? headRegimes : sentRegimes;
        if (regimes.length > 1) {
          skipped.push({
            page: page.n,
            text: s.text.slice(0, 120),
            reason: 'competing service regimes',
          });
          continue;
        }
        const usage: UsageCondition | undefined = SEVERE.test(`${s.subheading ?? ''} ${s.text}`)
          ? 'severe'
          : undefined;
        const powertrains: Powertrain[] | undefined = /\bdiesel\b|דיזל/i.test(s.text)
          ? ['diesel']
          : /\b(petrol|gasoline|benzin(er)?|gasolina|essence)\b|בנזין/i.test(s.text)
            ? ['petrol', 'hybrid', 'plugin_hybrid']
            : undefined;
        const km = d ? numberOf(d[1]) : null;
        if (d && !km) continue;
        const unit = d && /^mi/i.test(d[2]) ? 'mi' : 'km';
        const interval: RequirementInterval = {
          ...(km ? { every: { value: km, unit } } : {}),
          ...(t ? { everyMonths: t.months } : {}),
          first: null,
          rule: km && t ? 'whichever_first' : km ? 'distance_only' : 'time_only',
          repeats: true,
        };
        const key = JSON.stringify([page.n, task, action, interval, regimes, usage]);
        if (seen.has(key)) continue;
        seen.add(key);
        const applicability: RequirementApplicability = {
          kinds: [input.kind],
          makes: [input.make],
          ...(input.models.length ? { models: input.models } : {}),
          ...(input.years ? { modelYears: input.years } : {}),
          ...(input.markets.length ? { markets: input.markets } : {}),
          ...(regimes.length ? { serviceRegimes: regimes } : {}),
          ...(usage ? { usage } : {}),
          ...(powertrains ? { powertrains } : {}),
        };
        const locator = `column sentence "${s.text.slice(0, 80)}"`;
        extracted.push({
          requirement: {
            id: `${input.doc.sha256.slice(0, 12)}-p${page.n}-s-${task}-${action}-${extracted.length}`,
            task,
            taskText: s.text.slice(0, 200),
            action,
            interval,
            applicability,
            authority: input.authorityHint,
            evidence: [
              {
                documentId: input.doc.sha256,
                documentTitle: input.doc.lead.title || input.doc.finalUrl,
                authority: input.authorityHint,
                markets: input.markets,
                page: page.n,
                ...(s.subheading ? { section: s.subheading } : {}),
                locator,
                documentSha256: input.doc.sha256,
              },
            ],
            verification: 'candidate',
            extraction: {
              method: 'deterministic_parser',
              by: SENTENCE_EXTRACTOR_ID,
              at: input.today,
              grounded: false,
            },
          },
          groundTokens: [...(d ? [d[1]] : []), ...(t ? [t.token] : [])],
          page: page.n,
          locator,
          method: 'sentence',
        });
      }
    }
  }
  return { extracted, skipped };
}

/**
 * Regime codes the DOCUMENT itself maps to its regime words ("QG1 … LongLife"; "codes QG0 or
 * QG2 … time/distance" = fixed). Never assumed when the document does not say it.
 */
export function regimeMapOf(pages: PageText[]): Record<string, string[]> {
  const text = pages
    .flatMap((p) => splitColumns(p).map((c) => c.map((l) => l.text).join(' ')))
    .join(' ')
    .replace(/-\s+(?=[a-z])/g, '');
  const map: Record<string, Set<string>> = {};
  const add = (k: string, codes: string[]) => {
    map[k] ??= new Set();
    for (const c of codes) map[k].add(c.toUpperCase());
  };
  // One sentence that names service-plan codes AND one regime: the document's own mapping.
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    const codes = regimeCodesIn(sentence);
    if (!codes.length) continue;
    const longLife = REGIME_TERMS[0][1].test(sentence);
    const fixed =
      REGIME_TERMS[1][1].test(sentence) ||
      /\b(time|distance)\b[^.]{0,20}\b(travelled|driven|dependent)|dependent on time|zeit.{0,20}(lauf|km)|tiempo.{0,20}(recorrid|km)/i.test(
        sentence,
      );
    if (longLife && !fixed) add('LONGLIFE', codes);
    else if (fixed && !longLife) add('FIXED', codes);
  }
  return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, [...v].sort()]));
}

const WHICHEVER_FIRST =
  /(whichever|whatever)\s+(comes|occurs|is reached)?\s*first|was (zuerst|früher) (eintritt|erreicht)|lo que (ocurra|suceda)? ?(antes|primero)|selon la première échéance/gi;

/** Advice rather than a schedule: practical experience, rules of thumb, "most cars". */
const ADVISORY =
  /\b(based on (practical )?experience|in (our|my) experience|rule of thumb|most cars|many mechanics|mechanics (recommend|suggest)|we (would )?(recommend|suggest)|aus (der )?praxis|erfahrungsgemä(ß|ss)|por experiencia|d'expérience)\b/i;
