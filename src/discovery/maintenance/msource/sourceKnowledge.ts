import { publisherKey } from '../triangulation';
import type { DiscoveryAdapter, DiscoveryRunContext } from './adapters';
import { makeCandidate } from './candidates';
import type { VehicleFingerprint } from './fingerprint';
import type { MSourceRun } from './run';
import type { DocumentType } from '../types';

/**
 * Self-improving SOURCE knowledge (owner instruction 2026-10-03). What a run learns about a
 * source FAMILY is kept for every later vehicle:
 *  - the domain's identity classification (official brand domain / registry / independent);
 *  - the last observed access outcome;
 *  - the document types and extraction methods that worked;
 *  - the URL / document-naming PATTERN, tokenized ({make}, {model}, {Model}, {yyyy}, {yy}), so
 *    the same family is tried for a different model or year;
 *  - the applicability metadata pattern (e.g. an official "my{yy}" model-year designation).
 * Never an interval, never a vehicle: only source families. A pattern is learned only from a
 * source that produced usable (grounded, applicable) evidence.
 */

export interface SourceKnowledge {
  /** Registrable domain ("seat.co.uk"). */
  domain: string;
  identity: 'registry' | 'brand_domain' | 'independent';
  /** The make the brand domain belongs to (brand domains only). */
  make?: string;
  lastAccess: 'allowed' | 'blocked' | 'unknown';
  documentTypes: DocumentType[];
  extraction: ('table' | 'sentence')[];
  /** Tokenized URL templates that produced usable evidence. */
  urlPatterns: string[];
  /** e.g. "official_metadata:my{yy}". */
  applicabilityPatterns: string[];
  usableEvidence: number;
  lastSeen: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');

/** Replaces the vehicle's own make / model / year in a URL by tokens (generic, any URL). */
export function tokenizeUrl(url: string, fp: VehicleFingerprint): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const model = slug(fp.model);
  if (model.length < 2) return null;
  const yy = String(fp.modelYear % 100).padStart(2, '0');
  let path = decodeURIComponent(u.pathname);
  const sub = (re: RegExp, token: string) => {
    path = path.replace(re, token);
  };
  // Longest / most specific first.
  sub(
    new RegExp(`(?<![A-Za-z0-9])${fp.model.replace(/[^A-Za-z0-9]/g, '')}(?![A-Za-z0-9])`, 'g'),
    '{Model}',
  );
  sub(new RegExp(`(?<![a-z0-9])${model}(?![a-z0-9])`, 'gi'), '{model}');
  const make = slug(fp.make);
  if (make.length >= 2) sub(new RegExp(`(?<![a-z0-9])${make}(?![a-z0-9])`, 'gi'), '{make}');
  sub(new RegExp(`(?<![0-9])${fp.modelYear}(?![0-9])`, 'g'), '{yyyy}');
  sub(new RegExp(`(?<=my[_-]?)${yy}(?![0-9])`, 'gi'), '{yy}');
  if (!/\{model\}|\{Model\}/.test(path)) return null; // only model-generic patterns generalize
  // Any other identifier-like segment (an opaque version / document id such as "v20433" or
  // "6J4012003DC") ties the URL to ONE vehicle's content: never reused for another vehicle —
  // some sites even echo the requested make / model into a page about a different vehicle.
  if (!isGeneralizable(`${u.protocol}//${u.host}${path}`)) return null;
  return `${u.protocol}//${u.host}${path}`;
}

/** A pattern whose only variable parts are tokens (no opaque ids left in the path). */
export function isGeneralizable(pattern: string): boolean {
  const rest = pattern
    .replace(/^https?:\/\/[^/]+/, '')
    .replace(/\{(model|Model|make|yyyy|yy)\}/g, '');
  return !/\d{3,}/.test(rest) && !/(?<![a-z])[a-z]*\d+[a-z]+\d*[a-z\d]*/i.test(rest);
}

/** Fills a tokenized pattern for another vehicle (null when a token cannot be filled). */
export function fillPattern(pattern: string, fp: VehicleFingerprint): string | null {
  const model = slug(fp.model);
  if (!model) return null;
  const capital = fp.model.replace(/[^A-Za-z0-9]/g, '');
  return pattern
    .replace(/\{model\}/g, model)
    .replace(/\{make\}/g, slug(fp.make))
    .replace(/\{Model\}/g, capital.charAt(0).toUpperCase() + capital.slice(1).toLowerCase())
    .replace(/\{yyyy\}/g, String(fp.modelYear))
    .replace(/\{yy\}/g, String(fp.modelYear % 100).padStart(2, '0'));
}

/** What one finished run teaches about source families. */
export function learnFromRun(run: MSourceRun, fp: VehicleFingerprint): SourceKnowledge[] {
  const s = run.schedule;
  if (!s) return [];
  const out = new Map<string, SourceKnowledge>();
  for (const src of s.sources) {
    if (src.sourceType === 'user_upload') continue;
    const evidence = s.evidence.filter(
      (e) =>
        e.sourceId === src.sourceId &&
        e.grounded &&
        ['EXACT', 'STRONG', 'SUPPORTED'].includes(e.match.baseStatus ?? e.match.status),
    );
    const domain = publisherKey(src.finalUrl);
    const k: SourceKnowledge = out.get(domain) ?? {
      domain,
      identity:
        src.authority?.basis === 'brand_domain'
          ? 'brand_domain'
          : src.authority?.basis === 'registry'
            ? 'registry'
            : 'independent',
      ...(src.authority?.basis === 'brand_domain' ? { make: fp.make } : {}),
      lastAccess: 'allowed',
      documentTypes: [],
      extraction: [],
      urlPatterns: [],
      applicabilityPatterns: [],
      usableEvidence: 0,
      lastSeen: run.finishedAt,
    };
    if (src.documentType && !k.documentTypes.includes(src.documentType)) {
      k.documentTypes.push(src.documentType);
    }
    for (const e of evidence)
      if (!k.extraction.includes(e.extractionMethod)) k.extraction.push(e.extractionMethod);
    k.usableEvidence += evidence.length;
    if (evidence.length) {
      const pattern = tokenizeUrl(src.finalUrl, fp);
      if (pattern && !k.urlPatterns.includes(pattern)) k.urlPatterns.push(pattern);
      const a = src.statedApplicability;
      if (a?.yearBasis === 'official_metadata' && a.yearDesignation) {
        const p = `official_metadata:${a.yearDesignation.replace(/\d{2}$/, '{yy}')}`;
        if (!k.applicabilityPatterns.includes(p)) k.applicabilityPatterns.push(p);
      }
    }
    out.set(domain, k);
  }
  // Access outcomes for domains that never produced a document.
  for (const c of run.candidates) {
    const domain = publisherKey(c.candidate.canonicalUrl);
    if (out.has(domain)) continue;
    const blocked = c.decisions.some((d) => d.operation === 'FETCH' && d.status === 'BLOCKED');
    out.set(domain, {
      domain,
      identity: 'independent',
      lastAccess: blocked ? 'blocked' : 'unknown',
      documentTypes: [],
      extraction: [],
      urlPatterns: [],
      applicabilityPatterns: [],
      usableEvidence: 0,
      lastSeen: run.finishedAt,
    });
  }
  return [...out.values()];
}

/** Merges new knowledge into the store (append-only patterns; the newest access outcome wins). */
export function mergeKnowledge(
  store: readonly SourceKnowledge[],
  learned: readonly SourceKnowledge[],
): SourceKnowledge[] {
  const out = new Map(store.map((k) => [k.domain, { ...k }]));
  for (const l of learned) {
    const k = out.get(l.domain);
    if (!k) {
      out.set(l.domain, { ...l });
      continue;
    }
    k.lastAccess = l.lastAccess;
    k.lastSeen = l.lastSeen;
    k.usableEvidence += l.usableEvidence;
    if (l.identity !== 'independent') k.identity = l.identity;
    if (l.make) k.make = l.make;
    for (const f of [
      'documentTypes',
      'extraction',
      'urlPatterns',
      'applicabilityPatterns',
    ] as const) {
      for (const v of l[f] as string[])
        if (!(k[f] as string[]).includes(v)) (k[f] as string[]).push(v);
    }
  }
  return [...out.values()].sort((a, b) => a.domain.localeCompare(b.domain));
}

/**
 * Discovery from learned source families: for a NEW vehicle, the URL patterns of families that
 * produced usable evidence before are filled with this vehicle's tokens. Brand-domain patterns
 * are only used for the same make. The candidates go through the normal access / acquisition /
 * matching pipeline — a filled pattern that does not exist simply fails as a 404.
 */
export class SourceKnowledgeAdapter implements DiscoveryAdapter {
  readonly id = 'knowledge';

  constructor(private readonly store: readonly SourceKnowledge[]) {}

  async discover(ctx: DiscoveryRunContext) {
    const fp = ctx.fingerprint;
    const candidates = this.store
      .filter((k) => k.lastAccess !== 'blocked' && k.usableEvidence > 0)
      .filter((k) => k.identity !== 'brand_domain' || k.make === fp.make)
      .flatMap((k) =>
        k.urlPatterns.flatMap((p) => {
          const url = isGeneralizable(p) ? fillPattern(p, fp) : null;
          const c = url
            ? makeCandidate({
                url,
                sourceType: k.identity === 'independent' ? 'other' : 'oem_manual',
                discoveredBy: this.id,
                discoveredAt: ctx.now(),
                hint: `learned pattern ${p}`,
              })
            : null;
          return c ? [c] : [];
        }),
      );
    return {
      adapter: this.id,
      status: candidates.length ? ('ok' as const) : ('empty' as const),
      candidates,
      notes: [`${this.store.length} known source families`],
    };
  }
}
