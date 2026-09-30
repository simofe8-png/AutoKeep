#!/usr/bin/env node
/**
 * Source-agnostic triangulation catalog (owner instruction 2026-09-30).
 *
 * Input:  docs/maintenance/data/triangulation/B*.json (research: verbatim quotes per source) and
 *         grounding.json (tools/ground-triangulation.mjs: each quote re-found at its URL).
 * Output: src/features/maintenance/knowledge/triangulatedData.ts — OBSERVATIONS + GROUNDING
 *         (data only; confidence is computed at runtime by the pure `triangulate`).
 *
 * Deterministic rules (no interval is created or changed here):
 *  - identical claims (task, action, interval, severe/normal) from several items are merged; their
 *    sources are pooled — independence is decided later (publisher / underlying document);
 *  - a claim whose source states other model years, or only other engines, is excluded (recorded);
 *  - `yearsStated`: a source states years or a generation that covers the vehicle;
 *  - `namesModel`: the source's quote / URL / document / note names the model;
 *  - markets are the markets the sources state (IL, EU, UK, US, …).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const DIR = join(ROOT, 'docs', 'maintenance', 'data', 'triangulation');
const OUT = join(ROOT, 'src', 'features', 'maintenance', 'knowledge', 'triangulatedData.ts');
const REPORT = join(DIR, 'conversion.json');
const V = JSON.parse(readFileSync(join(DIR, 'vehicles.json'), 'utf8'));
const grounding = JSON.parse(readFileSync(join(DIR, 'grounding.json'), 'utf8'));

const TASKS = new Set([
  'periodic_service',
  'engine_oil',
  'oil_filter',
  'air_filter',
  'cabin_filter',
  'fuel_filter',
  'spark_plugs',
  'brake_fluid',
  'coolant',
  'timing_belt',
  'timing_chain',
  'auxiliary_belt',
  'transmission_fluid',
  'final_drive_oil',
  'valve_clearance',
  'drive_chain',
  'general_inspection',
  'ev_battery_coolant',
  'ev_high_voltage_inspection',
  'reduction_gear_oil',
  'drive_belt',
  'brake_system',
  'tire_rotation',
]);
const ACTIONS = new Set(['inspection', 'replacement', 'adjustment', 'other']);
const MARKETS = [
  [/\b(il|israel|ישראל)\b/i, 'IL'],
  [/\b(uk|united kingdom|britain)\b/i, 'UK'],
  [/\b(eu|europe|european|de|germany|fr|france|es|spain|cz)\b/i, 'EU'],
  [/\b(us|usa|united states|north america|canada)\b/i, 'US'],
  [/\b(nz|new zealand)\b/i, 'NZ'],
  [/\b(au|australia)\b/i, 'AU'],
  [/\b(in|india)\b/i, 'IN'],
  [/\b(my|malaysia)\b/i, 'MY'],
  [/\b(cn|china)\b/i, 'CN'],
  [/\b(eg|egypt)\b/i, 'EG'],
  [/\b(kr|korea)\b/i, 'KR'],
  [/\b(tr|turkey|türkiye)\b/i, 'TR'],
  [/\b(ph|philippines)\b/i, 'PH'],
  [/\b(global|worldwide|international)\b/i, 'GLOBAL'],
];
// A stated market that is none of the above is still a market (foreign to IL), never "unspecified".
const marketsOf = (s) => {
  if (!s || /^\s*(null|unspecified|unknown|n\/a)?\s*$/i.test(s)) return [];
  const found = MARKETS.filter(([re]) => re.test(s)).map(([, c]) => c);
  return found.length ? found : ['OTHER'];
};

function interval(i) {
  const every =
    i.km != null
      ? { value: i.km, unit: 'km' }
      : i.miles != null
        ? { value: i.miles, unit: 'mi' }
        : null;
  const rule =
    every && i.months ? 'whichever_first' : every ? 'distance_only' : i.months ? 'time_only' : null;
  if (!rule) return null;
  return {
    ...(every && rule !== 'time_only' ? { every } : {}),
    ...(i.months && rule !== 'distance_only' ? { everyMonths: i.months } : {}),
    ...(i.firstKm != null ? { first: { value: i.firstKm, unit: 'km' } } : {}),
    ...(i.firstMonths != null ? { firstMonths: i.firstMonths } : {}),
    rule,
    repeats: i.repeats !== false,
  };
}
const kmOf = (d) => (d ? (d.unit === 'km' ? d.value : Math.round(d.value * 1.609344)) : null);

/** Displacements (litres) a free-text engine field names, e.g. "1.4 TSI", "1598 cc". */
function litres(s) {
  if (!s) return [];
  // "document has no 1.6 L engine" names 1.6 only to exclude it.
  s = s.replace(/(?:no|not|without|except)\s+(?:the\s+)?\d\.\d\s*l?/gi, ' ');
  const out = [];
  for (const m of s.matchAll(
    /(\d\.\d)\s*(?:l\b|litre|liter|tsi|tfsi|t-gdi|gdi|mpi|puretech|dualjet|hybrid|mzr|skyactiv|vti|i-vtec|\b)/gi,
  ))
    out.push(Number(m[1]));
  for (const m of s.matchAll(/(\d{3,4})\s*cc/gi)) out.push(Number(m[1]) / 1000);
  return out;
}

const report = {};
const observations = [];
for (const f of readdirSync(DIR)
  .filter((x) => /^B\d+\.json$/.test(x))
  .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))) {
  const j = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  const v = V[j.id];
  if (!v) throw new Error(`vehicles.json has no ${j.id}`);
  const modelRe = new RegExp(v.modelPattern, 'i');
  const genRe = v.generationPattern ? new RegExp(v.generationPattern, 'i') : null;
  const merged = new Map();
  const excluded = [];
  for (const it of j.items ?? []) {
    const iv = interval(it.interval ?? {});
    if (!TASKS.has(it.task) || !ACTIONS.has(it.action) || !iv) {
      excluded.push({ task: it.task, action: it.action, why: 'not a computable interval / task' });
      continue;
    }
    const a = it.applicability ?? {};
    const years = a.modelYears && (a.modelYears.from || a.modelYears.to) ? a.modelYears : null;
    if (years && ((years.from && v.year < years.from) || (years.to && v.year > years.to))) {
      excluded.push({
        task: it.task,
        action: it.action,
        why: `model years ${years.from}-${years.to}`,
      });
      continue;
    }
    const L = litres(a.engine);
    if (v.litres && L.length && !L.some((x) => Math.abs(x - v.litres) < 0.051)) {
      excluded.push({ task: it.task, action: it.action, why: `engine ${a.engine}` });
      continue;
    }
    const variantText = `${a.engine ?? ''} ${a.generation ?? ''} ${a.note ?? ''}`;
    // Only when the source names other variants and NOT this one.
    if (
      v.excludePattern &&
      new RegExp(v.excludePattern, 'i').test(variantText) &&
      !(v.includePattern && new RegExp(v.includePattern, 'i').test(variantText))
    ) {
      excluded.push({
        task: it.task,
        action: it.action,
        why: `variant ${a.engine ?? a.generation ?? a.note}`,
      });
      continue;
    }
    const yearsStated =
      Boolean(years) || Boolean(genRe && a.generation && genRe.test(a.generation));
    const severe = it.conditions === 'severe';
    const key = JSON.stringify([
      it.task,
      it.action,
      kmOf(iv.every),
      iv.everyMonths ?? null,
      iv.rule,
      kmOf(iv.first),
      iv.firstMonths ?? null,
      iv.repeats,
      severe,
    ]);
    const itemNote = `${a.note ?? ''}`;
    const genericItem = /not [\w-]*\s*(?:c-hr|model|specific)|generic|not .*-specific/i.test(
      itemNote,
    );
    const dropped = (it.sources ?? []).filter((s) =>
      Object.keys(v.excludeSources ?? {}).some((h) => new URL(s.url).host.endsWith(h)),
    );
    for (const s of dropped) {
      excluded.push({
        task: it.task,
        action: it.action,
        why: `source ${s.url}: ${v.excludeSources[new URL(s.url).host.replace(/^www\./, '')] ?? 'excluded'}`,
      });
    }
    const kept = (it.sources ?? []).filter((s) => !dropped.includes(s));
    if (!kept.length) continue;
    const sources = kept.map((s) => ({
      url: s.url,
      publisher: s.publisher ?? s.url,
      sourceKind: s.sourceType ?? 'other',
      derivedFrom: s.derivedFrom ?? null,
      quote: s.quote ?? '',
      locator: s.locator ?? null,
      namesModel:
        !genericItem &&
        modelRe.test(
          `${s.quote ?? ''} ${s.url} ${s.derivedFrom ?? ''} ${s.locator ?? ''} ${a.generation ?? ''}`,
        ),
    }));
    const m = merged.get(key) ?? {
      it,
      iv,
      severe,
      sources: [],
      markets: new Set(),
      yearsStated: false,
      years: [],
    };
    m.sources.push(
      ...sources.filter(
        (s) => s.quote && !m.sources.some((x) => x.url === s.url && x.quote === s.quote),
      ),
    );
    marketsOf(a.market).forEach((c) => m.markets.add(c));
    m.yearsStated ||= yearsStated;
    if (years) m.years.push(years);
    merged.set(key, m);
  }
  let n = 0;
  for (const m of merged.values()) {
    n += 1;
    const from = Math.max(...m.years.map((y) => y.from ?? -Infinity));
    const to = Math.min(...m.years.map((y) => y.to ?? Infinity));
    observations.push({
      id: `${j.id.toLowerCase()}-${m.it.task}-${m.it.action}-${n}`,
      task: m.it.task,
      action: m.it.action,
      interval: m.iv,
      applicability: {
        kinds: [v.kind],
        makes: [v.make],
        models: v.models,
        ...(m.years.length
          ? {
              modelYears: {
                ...(from > -Infinity ? { from } : {}),
                ...(to < Infinity ? { to } : {}),
              },
            }
          : {}),
        ...(v.powertrains ? { powertrains: v.powertrains } : {}),
        ...(m.markets.size ? { markets: [...m.markets].sort() } : {}),
        ...(m.severe ? { usage: 'severe' } : {}),
      },
      sources: m.sources,
      yearsStated: m.yearsStated,
    });
  }
  report[j.id] = { items: (j.items ?? []).length, observations: merged.size, excluded };
}

const g = {};
for (const [k, r] of Object.entries(grounding))
  g[k] = { grounded: r.grounded, ...(r.sha256 ? { sha256: r.sha256 } : {}) };
writeFileSync(
  OUT,
  `import type { Grounding, Observation } from '@/discovery/maintenance/triangulation';

/**
 * GENERATED by tools/build-triangulated-catalog.mjs from docs/maintenance/data/triangulation
 * (source-agnostic research of 2026-09-30, grounded by tools/ground-triangulation.mjs). Do not edit:
 * fix the research record and regenerate. Short verbatim quotes only; no document is stored.
 */
export const OBSERVATIONS: readonly Observation[] = ${JSON.stringify(observations, null, 2)};

/** url + LF + quote → whether the quote was re-found at the URL (and the fetched bytes' sha256). */
export const GROUNDING: Readonly<Record<string, Grounding>> = ${JSON.stringify(g, null, 2)};
`,
);
writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
console.log(`${observations.length} observations`);
for (const [id, r] of Object.entries(report))
  console.log(id, r.items, 'items →', r.observations, 'obs;', r.excluded.length, 'excluded');
