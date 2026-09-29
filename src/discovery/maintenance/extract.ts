import type {
  ApplicabilityDimension,
  DistanceUnit,
  IsoDate,
  Powertrain,
  RequirementAction,
  RequirementApplicability,
  RequirementInterval,
  TaskCode,
  UsageCondition,
} from '@/domain';

import { compact } from './sources';
import type {
  AcquiredDocument,
  DocumentProfile,
  ExtractedRequirement,
  MaintenanceSection,
  PageText,
  TextItem,
  VehicleIdentity,
} from './types';

/**
 * Deterministic atomic-requirement extraction (no AI, no per-model rules).
 *
 * TABLES. A header row of distance columns (km/miles, "×1000" scales, units inside the cell such
 * as "1,000km"), optionally a months row, and item rows with action marks (I/R/C/A/L/T). Each
 * column is typed from the header words around it:
 *  - milestone  ("15 30 45 …"): marks are odometer points → every/first from their spacing;
 *  - every      ("Every 5,000km / 3 Months"): a mark IS the interval of that column;
 *  - initial    ("NEW", "initial", "first"): a one-time first occurrence.
 * Text cells ("Replace for every 30,000km") and multi-line notes attached to a row are read as
 * sentences. The same action in several "every" columns is ambiguous → skipped, never guessed.
 *
 * SENTENCES. "<item> … replace every 15,000 km or 12 months" (outside tables and in notes).
 *
 * Every result cites the exact page + row and the tokens that must be found again on that page.
 */

export const EXTRACTOR_ID = 'autokeep-extractor/2';

// Order matters: specific before generic.
const TASKS: [TaskCode, RegExp, ('car' | 'motorcycle')?][] = [
  ['oil_filter', /\boil (filter|strainer)|מסנן שמן/i],
  ['engine_oil', /\b(engine|motor) oil\b|שמן מנוע/i],
  ['ev_battery_coolant', /battery coolant|high.?voltage battery.{0,20}coolant/i],
  [
    'cabin_filter',
    /(cabin|climate|pollen|dust|a\/c|air.?condition\w*|hepa)[^.\n]{0,20}filter|מסנן (מזגן|אבק)/i,
  ],
  ['air_filter', /\bair (cleaner|filter)|מסנן אוויר/i],
  ['fuel_filter', /\bfuel (pump )?filter|מסנן דלק/i],
  ['spark_plugs', /\bspark plugs?|מצת/i],
  ['brake_fluid', /\bbrake (and clutch )?fluid|נוזל בלמים/i],
  ['coolant', /\b(engine )?coolant\b|antifreeze|נוזל קירור/i],
  ['timing_belt', /\b(timing|cam(shaft)?) belt|רצועת תזמון/i],
  ['drive_belt', /\b(v-?belt|drive belt)/i, 'motorcycle'],
  [
    'auxiliary_belt',
    /\b(drive|accessory|auxiliary|ribbed|poly-?v|serpentine|v-?ribbed) belts?\b|רצועת (אביזרים|עזר)/i,
    'car',
  ],
  ['reduction_gear_oil', /reduction gear|drive unit (fluid|oil)/i],
  [
    'transmission_fluid',
    /\b(automatic )?transmission (fluid|oil)|\b(cvt|dct|gearbox|manual transmission) (fluid|oil)|\batf\b|שמן (תיבת|גיר)/i,
  ],
  ['final_drive_oil', /\b(final drive|differential|transfer case|gear) oil|שמן דיפרנציאל/i],
  ['valve_clearance', /\bvalve (clearance|lash)|מרווח שסתומים/i],
  ['drive_chain', /\bdrive chain|\bchain (slack|lubrication)/i, 'motorcycle'],
  [
    'brake_system',
    /\bbrake (system|pads?|shoes?|discs?|calipers?|linings?|hoses?|mechanism)|\bbrakes\b/i,
  ],
  ['tire_rotation', /\b(tire|tyre) rotation|rotate (the )?(tires|tyres)/i],
];

export function taskOf(label: string, kind: VehicleIdentity['kind']): TaskCode | null {
  const k = kind === 'motorcycle' ? 'motorcycle' : 'car';
  // "Check transmission for leakage" is an inspection of a component, not its fluid.
  if (/\bleak/i.test(label)) return null;
  for (const [task, re, only] of TASKS) if ((!only || only === k) && re.test(label)) return task;
  return null;
}

const MARK = /^([IRCALT])(\*+|\d)?$/;
const MARK_ACTION: Record<string, RequirementAction> = {
  I: 'inspection',
  R: 'replacement',
  A: 'adjustment',
  C: 'other',
  L: 'other',
  T: 'other',
};

export function parseNumber(s: string): number | null {
  const t = s.trim().replace(/[\s,.'’](?=\d{3}\b)/g, '');
  return /^\d+$/.test(t) ? Number(t) : null;
}

/** "1,000km" / "12000KM" / "10 000 mi" → value + unit; plain numbers → unit null. */
export function parseDistanceCell(
  s: string,
): { value: number; unit: DistanceUnit | null; every: boolean; initial: boolean } | null {
  const m =
    /^(every\s+|each\s+|כל\s+|new\s+|initial\s+|first\s+)?([\d][\d,.' ’]*)\s*(km|kms|kilomet(?:er|re)s?|mi|miles?)?$/i.exec(
      s.trim(),
    );
  if (!m) return null;
  const value = parseNumber(m[2]);
  if (value == null || value <= 0) return null;
  const prefix = (m[1] ?? '').trim().toLowerCase();
  return {
    value,
    unit: m[3] ? (/^mi/i.test(m[3]) ? 'mi' : 'km') : null,
    every: ['every', 'each', 'כל'].includes(prefix),
    initial: ['new', 'initial', 'first'].includes(prefix),
  };
}

/** "3 Months" / "1 Year" / "12" → months. */
function parseMonthsCell(s: string): number | null {
  const m = /^(\d{1,3})\s*(months?|mos?\.?|years?|yrs?|חודשים|שנים|שנה)?$/i.exec(s.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] && /^(y|שנ)/i.test(m[2]) ? n * 12 : n;
}

const center = (i: TextItem) => i.x + i.w / 2;

type ColumnKind = 'milestone' | 'every' | 'initial';

interface Column {
  x: number;
  printed: string;
  value: number;
  months: number | null;
  kind: ColumnKind;
}

interface Header {
  line: number;
  columns: Column[];
  unit: DistanceUnit;
  context: string;
}

/** Distance header rows of a page, with their column kinds and months. */
function findHeaders(page: PageText): Header[] {
  const headers: Header[] = [];
  const lines = page.lines;
  lines.forEach((line, idx) => {
    // A months row is read with its distance header, never as a distance header itself.
    if (/month|חודש|\byears?\b/i.test(line.text)) return;
    const cells = line.items
      .map((it) => ({ it, d: parseDistanceCell(it.str) }))
      .filter(
        (c): c is { it: TextItem; d: NonNullable<ReturnType<typeof parseDistanceCell>> } => !!c.d,
      );
    if (cells.length < 4) return;
    const near = lines
      .slice(Math.max(0, idx - 4), idx + 3)
      .map((l) => l.text)
      .join(' ');
    const cellUnit = cells.find((c) => c.d.unit)?.d.unit ?? null;
    const mi = cellUnit === 'mi' || (!cellUnit && /\bmiles?\b|\bmi\b/i.test(near));
    const km = cellUnit === 'km' || (!cellUnit && /\bkm\b|kilomet|ק"מ/i.test(near));
    if (!mi && !km) return;
    // Columns from this line, plus distance cells on adjacent lines (e.g. a raised "300KM").
    const all = [...cells];
    for (const other of lines.slice(Math.max(0, idx - 2), idx + 3)) {
      if (other === line || Math.abs(other.y - line.y) > 10 || /month/i.test(other.text)) continue;
      for (const it of other.items) {
        const d = parseDistanceCell(it.str);
        if (d?.unit && !all.some((c) => Math.abs(center(c.it) - center(it)) < 10))
          all.push({ it, d });
      }
    }
    all.sort((a, b) => center(a.it) - center(b.it));
    const vals = all.map((c) => c.d.value);
    if (!vals.every((v, i) => i === 0 || v > vals[i - 1])) return;
    const thousand =
      !cellUnit && /[x×]\s*1[,.]?000|,000\s*(km|miles?)|in thousands|אלפי/i.test(near);
    const scale = thousand && vals[vals.length - 1] < 1000 ? 1000 : 1;
    if (vals[vals.length - 1] * scale < 1000) return; // not a distance header

    const gaps = all.slice(1).map((c, i) => center(c.it) - center(all[i].it));
    const tol = Math.max(6, Math.min(...gaps) / 2);
    const around = lines.slice(Math.max(0, idx - 3), idx + 5);
    const wordAbove = (c: TextItem, re: RegExp) =>
      around.some((l) =>
        l.items.some((o) => re.test(o.str.trim()) && Math.abs(center(o) - center(c)) <= tol),
      );
    // Months row aligned with the columns ("1 Month | 3 Months | 1 Year" or "12 24 36").
    const monthsLine = around.find((l) => l !== line && /month|חודש|\byear/i.test(l.text));
    const columns: Column[] = all.map(({ it, d }) => {
      const m = monthsLine?.items.find((o) => Math.abs(center(o) - center(it)) <= tol);
      const initial = d.initial || wordAbove(it, /^(new|initial|first|ראשון)$/i);
      return {
        x: center(it),
        printed: it.str.trim(),
        value: d.value * scale,
        months: m ? parseMonthsCell(m.str) : null,
        kind: initial
          ? 'initial'
          : d.every || wordAbove(it, /^every$|^כל$/i)
            ? 'every'
            : 'milestone',
      };
    });
    headers.push({
      line: idx,
      columns,
      unit: mi && !km ? 'mi' : 'km',
      context: lines
        .slice(Math.max(0, idx - 8), idx)
        .map((l) => l.text)
        .join(' | '),
    });
  });
  return headers;
}

/** every/first from milestone column values of one mark group; null when irregular. */
export function intervalFromColumns(
  vals: number[],
): { every: number; first: number | null; zero?: true } | null {
  if (vals.length < 2) return null;
  const diffs = vals.slice(1).map((v, i) => v - vals[i]);
  // After a different first point, repeats that fall on multiples of the interval are laid out
  // from zero (1, 10, 20, 30 → first 1, then every 10 at 10, 20 …), not from the first point.
  const zero = (every: number, first: number) =>
    first < every && vals.slice(1).every((v) => v % every === 0) ? { zero: true as const } : {};
  if (diffs.every((d) => d === diffs[0])) {
    if (vals[0] === diffs[0]) return { every: diffs[0], first: null };
    return { every: diffs[0], first: vals[0], ...zero(diffs[0], vals[0]) };
  }
  // An initial occurrence, then a regular repeat (needs ≥2 repeats to be a pattern).
  const rest = diffs.slice(1);
  if (rest.length >= 2 && rest.every((d) => d === rest[0])) {
    return { every: rest[0], first: vals[0], ...zero(rest[0], vals[0]) };
  }
  return null;
}

interface Qualifiers {
  usage?: UsageCondition;
  powertrains?: Powertrain[];
  displacementCc?: { min: number; max: number };
  serviceRegimes?: string[];
}

const SEVERE = /severe|harsh|difficult|extreme|dusty|heavily.?polluted|תנאי(ם)? קש|אבק/i;

function qualifiersOf(context: string, profile: DocumentProfile): Qualifiers {
  const q: Qualifiers = {};
  if (SEVERE.test(context)) q.usage = 'severe';
  else if (profile.hasSevereSchedule) q.usage = 'normal';
  if (/\bdiesel\b|דיזל/i.test(context)) q.powertrains = ['diesel'];
  else if (/\b(petrol|gasoline)\b|בנזין/i.test(context)) {
    q.powertrains = ['petrol', 'hybrid', 'plugin_hybrid'];
  }
  const cc = /\b(\d)\.(\d)\s*(?:l\b|litre|liter|t-?gdi|gdi|mpi|tsi|tdi|puretech)/i.exec(context);
  if (cc) {
    const litres = Number(`${cc[1]}.${cc[2]}`);
    q.displacementCc = { min: Math.round(litres * 1000 - 60), max: Math.round(litres * 1000 + 60) };
  }
  const regime = /\b(long ?life|flexible service|fixed service|QG[0-2])\b/i.exec(context);
  if (regime) q.serviceRegimes = [regime[1].toUpperCase().replace(/\s+/g, '')];
  return q;
}

function applicabilityOf(
  v: VehicleIdentity,
  profile: DocumentProfile,
  q: Qualifiers,
): RequirementApplicability {
  const coverageUnknown: ApplicabilityDimension[] = [];
  if (!profile.models.length) coverageUnknown.push('model');
  if (profile.yearFrom == null) coverageUnknown.push('modelYear');
  const a: RequirementApplicability = {
    kinds: [v.kind],
    makes: [profile.manufacturer ?? v.make],
    ...(profile.models.length ? { models: profile.models } : {}),
    ...(profile.yearFrom != null
      ? { modelYears: { from: profile.yearFrom, to: profile.yearTo } }
      : {}),
    ...(profile.markets.length ? { markets: profile.markets } : {}),
    ...(q.usage ? { usage: q.usage } : {}),
    ...(q.powertrains ? { powertrains: q.powertrains } : {}),
    ...(q.displacementCc ? { displacementCc: q.displacementCc } : {}),
    ...(q.serviceRegimes ? { serviceRegimes: q.serviceRegimes } : {}),
  };
  if (coverageUnknown.length) a.coverageUnknown = coverageUnknown;
  return a;
}

export interface ExtractionInput {
  doc: AcquiredDocument;
  pages: PageText[];
  sections: MaintenanceSection[];
  profile: DocumentProfile;
  vehicle: VehicleIdentity;
  /** The document's authority is established (approved registry host, role manufacturer/importer). */
  authoritative: boolean;
  today: IsoDate;
}

interface Draft {
  task: TaskCode;
  label: string;
  action: RequirementAction;
  interval: RequirementInterval;
  page: number;
  table?: string;
  locator: string;
  q: Qualifiers;
  tokens: string[];
  method: 'table' | 'sentence';
}

function build(input: ExtractionInput, x: Draft, seq: number): ExtractedRequirement {
  const { doc, profile } = input;
  return {
    requirement: {
      id: `${doc.sha256.slice(0, 12)}-p${x.page}-${x.task}-${x.action}-${seq}`,
      task: x.task,
      taskText: x.label,
      action: x.action,
      interval: x.interval,
      applicability: applicabilityOf(input.vehicle, profile, x.q),
      authority: profile.authority,
      evidence: [
        {
          documentId: doc.sha256,
          documentTitle: doc.lead.title || doc.finalUrl,
          authority: profile.authority,
          markets: profile.markets,
          edition: profile.edition,
          page: x.page,
          table: x.table,
          locator: x.locator,
          documentSha256: doc.sha256,
        },
      ],
      verification: input.authoritative ? 'verified' : 'candidate',
      extraction: {
        method: 'deterministic_parser',
        by: EXTRACTOR_ID,
        at: input.today,
        grounded: false,
      },
    },
    groundTokens: x.tokens,
    page: x.page,
    locator: x.locator,
    method: x.method,
  };
}

interface Row {
  label: string;
  y: number;
  marks: Map<string, number[]>;
  /** Text cells and attached note lines (right of the label area). */
  notes: string[];
}

/** Item rows below a header: labels left of the first column, marks per column, text cells. */
function tableRows(page: PageText, header: Header, end: number): { rows: Row[]; tol: number } {
  const cols = header.columns;
  const gaps = cols.slice(1).map((c, i) => c.x - cols[i].x);
  const tol = Math.max(6, Math.min(...gaps) / 2);
  const firstX = cols[0].x - tol;
  const rows: Row[] = [];
  const orphans: { y: number; text: string }[] = [];
  let pending = '';
  for (const line of page.lines.slice(header.line + 1, end)) {
    // The months row (≥3 month cells) is header furniture, not an item.
    if (
      /month|חודש/i.test(line.text) &&
      line.items.filter((i) => parseMonthsCell(i.str) != null).length >= 3
    ) {
      continue;
    }
    const labelItems = line.items.filter(
      (i) => center(i) < firstX && !MARK.test(i.str.trim()) && !/^\d{1,2}$/.test(i.str.trim()),
    );
    const label = labelItems
      .map((i) => i.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    const marks = new Map<string, number[]>();
    const notes: string[] = [];
    for (const it of line.items) {
      if (center(it) < firstX) continue;
      const m = MARK.exec(it.str.trim());
      const c = cols.findIndex((col) => Math.abs(col.x - center(it)) <= tol);
      if (m && c >= 0) marks.set(m[1], [...(marks.get(m[1]) ?? []), c]);
      else if (!m && /[a-z]{3,}/i.test(it.str)) notes.push(it.str.trim());
    }
    if (label && /[a-z֐-׿]{2,}/i.test(label)) {
      rows.push({ label: `${pending} ${label}`.trim(), y: line.y, marks, notes });
      pending = '';
    } else if (!label && marks.size === 0 && notes.length) {
      orphans.push({ y: line.y, text: notes.join(' ') });
    } else if (!label && marks.size > 0 && rows.length) {
      // marks on a continuation line belong to the previous row
      const prev = rows[rows.length - 1];
      for (const [k, v] of marks) prev.marks.set(k, [...(prev.marks.get(k) ?? []), ...v]);
    }
  }
  // Note lines (e.g. a wrapped "(initial at 1,000km, … every 5,000km thereafter)") attach to the
  // nearest row by vertical position.
  for (const o of orphans) {
    const near = rows.reduce<Row | null>(
      (best, r) => (!best || Math.abs(r.y - o.y) < Math.abs(best.y - o.y) ? r : best),
      null,
    );
    if (near && Math.abs(near.y - o.y) < 14) near.notes.push(o.text);
  }
  for (const r of rows) {
    r.notes = r.notes
      .map((n, i) => ({ n, i }))
      .sort((a, b) => a.i - b.i)
      .map((x) => x.n);
  }
  return { rows, tol };
}

function rowDrafts(
  row: Row,
  header: Header,
  page: PageText,
  heading: string | undefined,
  q: Qualifiers,
  kind: VehicleIdentity['kind'],
): { drafts: Draft[]; skipped: string[] } {
  const drafts: Draft[] = [];
  const skipped: string[] = [];
  const task = taskOf(row.label, kind);
  if (!task) return { drafts, skipped: row.label ? ['unrecognized item'] : [] };
  const cols = header.columns;
  const every = cols.some((c) => c.kind === 'every');
  const initialOf = (idxs: number[]) => idxs.map((i) => cols[i]).find((c) => c.kind === 'initial');

  for (const [letter, own] of row.marks) {
    const action = MARK_ACTION[letter];
    const base = {
      task,
      label: row.label,
      action,
      page: page.n,
      table: heading,
      q,
      method: 'table' as const,
    };
    if (every) {
      const init = initialOf(own);
      const repeating = own.map((i) => cols[i]).filter((c) => c.kind !== 'initial');
      if (repeating.length > 1) {
        skipped.push(`${letter} in several "every" columns`);
        continue;
      }
      const col = repeating[0];
      if (!col) {
        if (init) {
          drafts.push({
            ...base,
            interval: {
              every: { value: init.value, unit: header.unit },
              first: { value: init.value, unit: header.unit },
              rule: 'distance_only',
              repeats: false,
            },
            locator: `table row "${row.label}", ${letter} at ${init.printed} (one time)`,
            tokens: [row.label, letter, init.printed],
          });
        }
        continue;
      }
      drafts.push({
        ...base,
        interval: {
          every: { value: col.value, unit: header.unit },
          first: init ? { value: init.value, unit: header.unit } : null,
          ...(col.months ? { everyMonths: col.months, firstMonths: init?.months ?? null } : {}),
          rule: col.months ? 'whichever_first' : 'distance_only',
          repeats: true,
          // "Every N km" columns count from zero; an initial column adds one earlier point.
          ...(init ? { anchor: 'zero' as const } : {}),
        },
        locator: `table row "${row.label}", ${letter} under "every ${col.printed}"`,
        tokens: [row.label, letter, col.printed, ...(init ? [init.printed] : [])],
      });
      continue;
    }
    // Milestone table. A replacement is also an inspection: "I" columns are read together
    // with "R" columns (I at 20, R at 40, I at 60, R at 80 = inspect every 20, replace every 40).
    const idxs =
      letter === 'I' && row.marks.has('R')
        ? [...new Set([...own, ...row.marks.get('R')!])].sort((x, y) => x - y)
        : own;
    const iv = intervalFromColumns(idxs.map((i) => cols[i].value));
    if (!iv) {
      skipped.push(`irregular ${letter} columns`);
      continue;
    }
    const ms = idxs.map((i) => cols[i].months);
    const mi = ms.every((m): m is number => m != null) ? intervalFromColumns(ms) : null;
    drafts.push({
      ...base,
      interval: {
        every: { value: iv.every, unit: header.unit },
        first: iv.first != null ? { value: iv.first, unit: header.unit } : null,
        ...(mi ? { everyMonths: mi.every, firstMonths: mi.first } : {}),
        rule: mi ? 'whichever_first' : 'distance_only',
        repeats: true,
        ...(iv.zero ? { anchor: 'zero' as const } : {}),
      },
      locator: `table row "${row.label}", ${letter} at ${idxs.map((i) => cols[i].printed).join(', ')}`,
      tokens: [row.label, letter, ...idxs.map((i) => cols[i].printed)],
    });
  }
  // Text cells / attached notes: each clause is a sentence. A full-width line with no marks and
  // no cells (a footnote inside the table area) is itself the sentence.
  const text = row.marks.size === 0 && row.notes.length === 0 ? row.label : row.notes.join(' ');
  // Clauses split on "," (not a thousands separator), ";" and "and then".
  for (const clause of text.split(/,(?!\d{3}(?!\d))|;|\band then\b/i)) {
    const s = sentenceInterval(clause);
    if (!s) continue;
    const fullFirst = firstOccurrence(text);
    const withFirst =
      fullFirst && s.interval.every && !s.interval.first
        ? {
            ...s.interval,
            first: fullFirst,
            // In an "every N" table, or with "second … at <multiple>", repeats count from zero.
            ...(every || secondOnMultiple(text, s.interval.every.value)
              ? { anchor: 'zero' as const }
              : {}),
          }
        : s.interval;
    drafts.push({
      task,
      label: row.label,
      action: s.action,
      interval: withFirst,
      page: page.n,
      table: heading,
      q,
      method: 'sentence',
      locator: `table row "${row.label}", note "${clause.trim().slice(0, 60)}"`,
      tokens: [row.label, ...s.tokens],
    });
  }
  // A one-time initial mark and a repeating statement of the same action in the same row are one
  // obligation: first at the initial point, then every … ("R at NEW/300KM" + "every 3000KM").
  for (const once of drafts.filter((d) => !d.interval.repeats)) {
    const rep = drafts.find(
      (d) => d !== once && d.action === once.action && d.interval.repeats && !d.interval.first,
    );
    if (!rep) continue;
    rep.interval = {
      ...rep.interval,
      first: once.interval.first ?? once.interval.every ?? null,
      anchor: 'zero',
    };
    rep.tokens = [...rep.tokens, ...once.tokens.slice(1)];
    rep.locator = `${rep.locator}; first: ${once.locator.replace(/^table row "[^"]*", /, '')}`;
    drafts.splice(drafts.indexOf(once), 1);
  }
  return { drafts, skipped };
}

export function extractRequirements(input: ExtractionInput): {
  extracted: ExtractedRequirement[];
  skipped: { page: number; label: string; reason: string }[];
} {
  const { pages, sections, vehicle, profile } = input;
  const drafts: Draft[] = [];
  const skipped: { page: number; label: string; reason: string }[] = [];
  const sectionPages = new Set(sections.map((s) => s.page));
  // A table may continue onto the next page.
  for (const s of sections) sectionPages.add(s.page + 1);

  for (const page of pages) {
    if (!sectionPages.has(page.n)) continue;
    const heading = sections.find((s) => s.page === page.n)?.heading;
    const headers = findHeaders(page);
    const tableLines = new Set<number>();
    headers.forEach((h, hi) => {
      const end = headers[hi + 1]?.line ?? page.lines.length;
      const q = qualifiersOf(`${heading ?? ''} | ${h.context}`, profile);
      const { rows } = tableRows(page, h, end);
      for (const row of rows) {
        const lineIdx = page.lines.findIndex((l) => l.y === row.y);
        tableLines.add(lineIdx);
        const rq = SEVERE.test(row.label) ? { ...q, usage: 'severe' as const } : q;
        const r = rowDrafts(row, h, page, heading, rq, vehicle.kind);
        drafts.push(...r.drafts);
        for (const reason of r.skipped) skipped.push({ page: page.n, label: row.label, reason });
      }
    });
    // Sentences outside the table rows (footnotes, prose schedules).
    page.lines.forEach((line, li) => {
      if (tableLines.has(li)) return;
      const task = taskOf(line.text, vehicle.kind);
      if (!task) return;
      const s = sentenceInterval(line.text);
      if (!s) return;
      drafts.push({
        task,
        label: line.text.slice(0, 120),
        action: s.action,
        interval: s.interval,
        page: page.n,
        table: heading,
        locator: `line "${line.text.slice(0, 80)}"`,
        q: qualifiersOf(`${heading ?? ''} | ${line.text}`, profile),
        tokens: s.tokens,
        method: 'sentence',
      });
    });
  }
  return { extracted: merge(drafts).map((d, i) => build(input, d, i)), skipped };
}

const DIST = /([\d][\d,. ]*\d|\d)\s*(km|kms|kilomet(?:er|re)s?|miles?|mi\b|ק"מ)/i;
const EVERY_DIST = new RegExp(`(?:every|each|כל)\\s+(?:[^\\d]{0,12})?${DIST.source}`, 'i');
const TIME =
  /(\d{1,2})\s*(months?|years?|yrs?|חודשים|שנים)|\b(annually|every year|each year|כל שנה)\b/i;
const FIRST = new RegExp(`(?:initial(?:ly)?|first)[^\\d]{0,20}${DIST.source}`, 'i');

/** "second (replace) at 5,000km" where 5,000 is a multiple of the interval. */
function secondOnMultiple(text: string, every: number): boolean {
  const m = new RegExp(`second[^\\d]{0,20}${DIST.source}`, 'i').exec(text);
  const n = m ? parseNumber(m[1]) : null;
  return n != null && n % every === 0;
}

function firstOccurrence(text: string): RequirementInterval['first'] {
  const f = FIRST.exec(text);
  const n = f ? parseNumber(f[1]) : null;
  return f && n ? { value: n, unit: /^mi/i.test(f[2]) ? 'mi' : 'km' } : null;
}

export function sentenceInterval(text: string): {
  action: RequirementAction;
  interval: RequirementInterval;
  tokens: string[];
} | null {
  const action: RequirementAction | null = /\b(replace|change|renew|replacement)\b|החלפ/i.test(text)
    ? 'replacement'
    : /\b(inspect|check|test|inspection)\b|בדיק/i.test(text)
      ? 'inspection'
      : /\badjust/i.test(text)
        ? 'adjustment'
        : /\bclean(ing)?\b|ניקוי/i.test(text)
          ? 'other'
          : null;
  if (!action) return null;
  // Conditional work ("replace … if necessary") is not a scheduled obligation.
  if (/if (necessary|required|needed)|as (necessary|required)|when needed/i.test(text)) return null;
  if (!/\bevery\b|\beach\b|\binterval|\bכל\b/i.test(text)) return null;
  // Prefer the distance that follows "every" ("initial at 1,000km … every 5,000km").
  const d = EVERY_DIST.exec(text) ?? DIST.exec(text);
  const t = TIME.exec(text);
  if (!d && !t) return null;
  const tokens: string[] = [];
  let every: RequirementInterval['every'];
  if (d) {
    const n = parseNumber(d[1]);
    if (!n) return null;
    every = { value: n, unit: /^mi/i.test(d[2]) ? 'mi' : 'km' };
    tokens.push(d[1]);
  }
  let everyMonths: number | undefined;
  if (t) {
    everyMonths = t[3] ? 12 : /year|yr|שנ/i.test(t[2]) ? Number(t[1]) * 12 : Number(t[1]);
    tokens.push(t[1] ?? t[3]);
  }
  return {
    action,
    tokens,
    interval: {
      ...(every ? { every } : {}),
      ...(everyMonths ? { everyMonths } : {}),
      first: null,
      rule: every && everyMonths ? 'whichever_first' : every ? 'distance_only' : 'time_only',
      repeats: true,
    },
  };
}

/**
 * Same document, same task + action + usage/qualifiers: identical statements collapse; a statement
 * that adds the missing time (or distance) limit to the same distance (or time) subsumes the
 * partial one ("every 30,000km" + "every 2 years / 30,000km"). Different values stay separate
 * (they will conflict and be reported, never averaged).
 */
function merge(list: Draft[]): Draft[] {
  const out: Draft[] = [];
  const key = (d: Draft) => JSON.stringify([d.task, d.action, d.q]);
  for (const d of list) {
    const same = out.filter((o) => key(o) === key(d));
    const km = (x: Draft) => x.interval.every?.value ?? null;
    const mo = (x: Draft) => x.interval.everyMonths ?? null;
    const dup = same.find((o) => JSON.stringify(o.interval) === JSON.stringify(d.interval));
    if (dup) continue;
    const partial = same.find(
      (o) =>
        (km(o) === km(d) && km(d) != null && (mo(o) == null || mo(d) == null)) ||
        (mo(o) === mo(d) && mo(d) != null && (km(o) == null || km(d) == null)),
    );
    if (partial) {
      const richer =
        (km(d) != null ? 1 : 0) + (mo(d) != null ? 1 : 0) >
        (km(partial) != null ? 1 : 0) + (mo(partial) != null ? 1 : 0);
      if (richer) out.splice(out.indexOf(partial), 1, d);
      continue;
    }
    out.push(d);
  }
  return out;
}

/**
 * Grounding: every token the requirement was read from is found again on the cited page. Marks
 * the provenance `grounded`; ungrounded requirements are never verified.
 */
export function ground(e: ExtractedRequirement, pages: PageText[]): boolean {
  const page = pages.find((p) => p.n === e.page);
  if (!page) return false;
  const hay = compact(page.text);
  const ok = e.groundTokens.every((t) => hay.includes(compact(t)));
  e.requirement = {
    ...e.requirement,
    extraction: { ...e.requirement.extraction, grounded: ok },
    verification: ok ? e.requirement.verification : 'candidate',
  };
  return ok;
}
