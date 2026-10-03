import type { IsoDate, MaintenanceRequirement, Powertrain, RequirementAuthority } from '@/domain';

import type { AcquiredDocument, ExtractedRequirement, PageText, TextLine } from '../types';
import type { VehicleFingerprint } from './fingerprint';
import { engineFactsOf, namesModel } from './matcher';

/**
 * Interval-overview MATRIX tables: one row per model and production window, one column per
 * service interval ("1 Year (12,5k ml)", "2 Year (20k mi)", "2 Jahre / 30.000 km"), and a mark
 * ("X") in the column that applies to the row. A manufacturer's service-interval overview is
 * often laid out this way; prose and two-column extractors cannot read it.
 *
 * Read deterministically from positioned text, per page:
 *  - interval columns: each distance token in the header band, paired with the nearest
 *    "N Year" token above it (the column's time limit) — a column needs both;
 *  - columns under a header word for an extra service ("Interim", "Inspection", "Zwischen")
 *    are skipped (they are not the main service);
 *  - rows: lines that start with the vehicle's model and end with marks; the row's production
 *    window "(MM/YYYY-MM/YYYY)" / "(MM/YYYY-)" gives its years; engine words in the row
 *    (displacements, petrol / diesel words, alternative fuels) restrict it.
 * Nothing is inferred: a row without a parsable window, a mark between columns, or a column
 * without both limits yields nothing.
 */

export const MATRIX_EXTRACTOR_ID = 'msource-interval-matrix/1';

const MARK = /^[x✓✔●]$/i;
const DISTANCE =
  /^\(?\s*(\d{1,3}(?:[.,]\d{1,3})?)\s*(k)?\s*(km|mi|ml|miles)\s*\)?$|^\(?\s*(\d{1,3}(?:[.,]\d{3})+|\d{4,6})\s*(km|mi|ml|miles)\s*\)?$/i;
const YEARS = /^(\d{1,2})\s*(year|years|yr|jahr|jahre|an|ans|año|años|anno|anni)$/i;
const EXTRA_SERVICE = /\b(interim|zwischen|annual inspection|inspection|inspektion)\b/i;
/** Alternative-fuel rows: not representable as a petrol / diesel restriction → never applied. */
const ALT_FUEL = /\b(ffv|lpg|cng|flexi.?fuel|e85)\b/i;
const HYBRID = /\b(m\/?hev|mhev|hev|phev|hybrid)\b/i;
const DATE = /(?:\d{1,2}[./])?(\d{1,2})[./]((?:19|20)\d\d)/g;
const OPEN_END = new Date().getUTCFullYear() + 1;

interface Column {
  x: number;
  months: number;
  distance: { value: number; unit: 'km' | 'mi' };
  tokens: string[];
}

function distanceOf(str: string): Column['distance'] | null {
  const m = DISTANCE.exec(str.trim());
  if (!m) return null;
  if (m[1]) {
    const n = Number(m[1].replace(',', '.')) * (m[2] ? 1000 : 1);
    const unit = /km/i.test(m[3]) ? 'km' : 'mi';
    return n >= 1000 ? { value: Math.round(n), unit } : null;
  }
  const n = Number(m[4].replace(/[.,]/g, ''));
  return n >= 1000 ? { value: n, unit: /km/i.test(m[5]) ? 'km' : 'mi' } : null;
}

/** "1 Year" tokens can be split into "1" + "Year": rejoin adjacent items of one line. */
function yearTokens(line: TextLine): { x: number; months: number; str: string }[] {
  const out: { x: number; months: number; str: string }[] = [];
  const items = line.items;
  for (let i = 0; i < items.length; i += 1) {
    const one = YEARS.exec(items[i].str.trim());
    if (one) {
      out.push({ x: items[i].x, months: Number(one[1]) * 12, str: items[i].str.trim() });
      continue;
    }
    const next = items[i + 1];
    if (/^\d{1,2}$/.test(items[i].str.trim()) && next) {
      const two = YEARS.exec(`${items[i].str.trim()} ${next.str.trim()}`);
      if (two) {
        out.push({ x: items[i].x, months: Number(two[1]) * 12, str: two[0] });
        i += 1;
      }
    }
  }
  return out;
}

/** The interval columns of a page (header band: the lines above the first marked row). */
function columnsOf(page: PageText): Column[] {
  const firstRow = page.lines.findIndex((l) => l.items.some((i) => MARK.test(i.str.trim())));
  const header = page.lines.slice(0, firstRow < 0 ? page.lines.length : firstRow);
  const distances = header.flatMap((l) =>
    l.items.flatMap((i) => {
      const d = distanceOf(i.str);
      return d ? [{ x: i.x, y: l.y, d, str: i.str.trim() }] : [];
    }),
  );
  if (distances.length < 2) return [];
  const years = header.flatMap((l) => yearTokens(l).map((t) => ({ ...t, y: l.y })));
  const extras = header.flatMap((l) =>
    EXTRA_SERVICE.test(l.text) ? l.items.map((i) => ({ x: i.x, str: i.str })) : [],
  );
  const out: Column[] = [];
  for (const d of distances) {
    // The time limit of the column: the nearest "N Year" above it, horizontally aligned.
    const above = years
      .filter((t) => t.y < d.y && Math.abs(t.x - d.x) <= 12)
      .sort((a, b) => Math.abs(a.x - d.x) - Math.abs(b.x - d.x) || b.y - a.y);
    if (!above.length) continue;
    // A column under an extra-service header word is not the main service.
    if (extras.some((e) => EXTRA_SERVICE.test(e.str) && Math.abs(e.x - d.x) <= 14)) continue;
    out.push({ x: d.x, months: above[0].months, distance: d.d, tokens: [d.str, above[0].str] });
  }
  return out.sort((a, b) => a.x - b.x);
}

function windowOf(text: string): { from: number; to: number } | null {
  const paren = [...text.matchAll(/\(([^()]*\d{4}[^()]*)\)/g)].pop()?.[1];
  if (!paren) return null;
  const dates = [...paren.matchAll(DATE)].map((m) => Number(m[2]));
  if (!dates.length) return null;
  const open = /[-–]\s*$/.test(paren.trim()) || dates.length === 1;
  return { from: dates[0], to: dates.length > 1 ? dates[1] : open ? OPEN_END : dates[0] };
}

export interface MatrixExtraction {
  extracted: ExtractedRequirement;
  /** The row's production window: the item's years (never the document's). */
  rowYears: { from: number; to: number };
}

export function extractIntervalMatrix(input: {
  doc: AcquiredDocument;
  pages: PageText[];
  fp: VehicleFingerprint;
  authorityHint: RequirementAuthority;
  markets: string[];
  today: IsoDate;
}): { extracted: MatrixExtraction[]; skipped: { page: number; text: string; reason: string }[] } {
  const extracted: MatrixExtraction[] = [];
  const skipped: { page: number; text: string; reason: string }[] = [];
  for (const page of input.pages) {
    const columns = columnsOf(page);
    if (!columns.length) continue;
    for (const line of page.lines) {
      const marks = line.items.filter((i) => MARK.test(i.str.trim()));
      if (!marks.length) continue;
      const label = line.items
        .filter((i) => !MARK.test(i.str.trim()))
        .map((i) => i.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      // The row must start with the vehicle's model (not another model mentioning it).
      const head = label.split('(')[0];
      const named = namesModel(head, input.fp.model);
      if (!named.exact || !head.toLowerCase().startsWith(input.fp.model.toLowerCase())) continue;
      const years = windowOf(label);
      if (!years) {
        skipped.push({ page: page.n, text: label, reason: 'no production window' });
        continue;
      }
      if (ALT_FUEL.test(label)) {
        skipped.push({ page: page.n, text: label, reason: 'alternative-fuel row' });
        continue;
      }
      const facts = engineFactsOf(head);
      const powertrains: Powertrain[] = HYBRID.test(head)
        ? ['hybrid']
        : facts.fuels.length === 1
          ? [facts.fuels[0]]
          : [];
      for (const mark of marks) {
        const col = columns.find((c) => Math.abs(c.x - mark.x) <= 12);
        if (!col) {
          skipped.push({ page: page.n, text: label, reason: 'mark outside the interval columns' });
          continue;
        }
        // One requirement per stated displacement (a row may list several engines).
        const ccs = facts.displacementsCc.length ? facts.displacementsCc : [null];
        for (const cc of ccs) {
          const locator = `matrix row "${label.slice(0, 80)}" × ${col.tokens.join(' ')}`;
          const requirement: MaintenanceRequirement = {
            id: `${input.doc.sha256.slice(0, 12)}-p${page.n}-m-${extracted.length}`,
            task: 'periodic_service',
            taskText: `${label} — service ${col.tokens.join(' ')}`,
            action: 'other',
            interval: {
              every: col.distance,
              everyMonths: col.months,
              rule: 'whichever_first',
              repeats: true,
            },
            applicability: {
              ...(cc ? { displacementCc: { min: cc - 50, max: cc + 49 } } : {}),
              ...(powertrains.length ? { powertrains } : {}),
            },
            authority: input.authorityHint,
            evidence: [
              {
                documentId: input.doc.sha256,
                documentTitle: input.doc.lead.title || input.doc.finalUrl,
                authority: input.authorityHint,
                markets: input.markets,
                page: page.n,
                locator,
                documentSha256: input.doc.sha256,
              },
            ],
            verification: 'candidate',
            extraction: {
              method: 'deterministic_parser',
              by: MATRIX_EXTRACTOR_ID,
              at: input.today,
              grounded: false,
            },
          };
          extracted.push({
            extracted: {
              requirement,
              groundTokens: [head.trim(), ...col.tokens],
              page: page.n,
              locator,
              method: 'table',
            },
            rowYears: years,
          });
        }
      }
    }
  }
  return { extracted, skipped };
}
