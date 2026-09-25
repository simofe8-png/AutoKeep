import type { DocumentCoverage, VehicleIdentityQuery } from './types';

/**
 * Exact vehicle applicability matching (T082). A source is applicable only when the document's
 * own coverage facts prove it covers this exact vehicle version. Missing or ambiguous facts never
 * count as a match — the result is then "not proven" (pending), never assumed (spec §5).
 */

export type ApplicabilityReason =
  | 'manufacturer_mismatch'
  | 'model_mismatch'
  | 'year_out_of_range'
  | 'year_unknown'
  | 'engine_not_covered'
  | 'engine_ambiguous'
  | 'model_code_mismatch'
  | 'market_not_covered'
  | 'not_a_maintenance_document';

export type Applicability =
  | { status: 'exact'; matchedOn: string[] }
  | { status: 'not_proven'; reasons: ApplicabilityReason[]; matchedOn: string[] }
  | { status: 'mismatch'; reasons: ApplicabilityReason[] };

const norm = (s: string) => s.toLowerCase().replace(/[\s\-_.]/g, '');

/** Engine strings like "2.0", "2.0L", "2000cc", "1998 סמ״ק" normalize to liters (1 decimal). */
export function engineLiters(s: string): string | null {
  const t = s.toLowerCase().replace(',', '.');
  const cc = /(\d{3,4})\s*(cc|סמ)/.exec(t);
  if (cc) return (Math.round(Number(cc[1]) / 100) / 10).toFixed(1);
  const l = /(\d(?:\.\d)?)\s*(l|ליטר)?/.exec(t);
  return l ? Number(l[1]).toFixed(1) : null;
}

export function matchApplicability(
  identity: VehicleIdentityQuery,
  coverage: DocumentCoverage,
  manufacturerKey: (name: string) => string,
): Applicability {
  const hard: ApplicabilityReason[] = [];
  const soft: ApplicabilityReason[] = [];
  const matchedOn: string[] = [];

  if (coverage.documentKind === 'other') hard.push('not_a_maintenance_document');

  if (coverage.manufacturer) {
    if (manufacturerKey(coverage.manufacturer) !== manufacturerKey(identity.manufacturer)) {
      hard.push('manufacturer_mismatch');
    } else matchedOn.push('manufacturer');
  } else soft.push('manufacturer_mismatch');

  if (coverage.models.some((m) => norm(m) === norm(identity.model))) matchedOn.push('model');
  else hard.push('model_mismatch');

  if (coverage.yearFrom === undefined && coverage.yearTo === undefined) soft.push('year_unknown');
  else if (
    (coverage.yearFrom !== undefined && identity.year < coverage.yearFrom) ||
    (coverage.yearTo !== undefined && identity.year > coverage.yearTo)
  ) {
    hard.push('year_out_of_range');
  } else matchedOn.push('year');

  if (coverage.engines && coverage.engines.length > 0) {
    const covered = coverage.engines.map(engineLiters).filter(Boolean);
    if (!identity.engine) {
      // The document distinguishes engines but we do not know ours: cannot prove exactness.
      if (new Set(covered).size > 1) soft.push('engine_ambiguous');
    } else {
      const mine = engineLiters(identity.engine);
      if (mine && covered.includes(mine)) matchedOn.push('engine');
      else hard.push('engine_not_covered');
    }
  }

  if (coverage.modelCodes && coverage.modelCodes.length > 0 && identity.modelCode) {
    if (coverage.modelCodes.some((c) => norm(c) === norm(identity.modelCode!)))
      matchedOn.push('modelCode');
    else hard.push('model_code_mismatch');
  }

  if (coverage.markets && coverage.markets.length > 0) {
    const m = coverage.markets.map((x) => x.toUpperCase());
    if (m.includes(identity.market) || m.includes('GLOBAL')) matchedOn.push('market');
    else soft.push('market_not_covered');
  }

  if (hard.length > 0) return { status: 'mismatch', reasons: hard };
  if (soft.length > 0) return { status: 'not_proven', reasons: soft, matchedOn };
  return { status: 'exact', matchedOn };
}
