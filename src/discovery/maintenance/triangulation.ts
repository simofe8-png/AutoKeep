import type {
  Confidence,
  EvidenceRef,
  IsoDate,
  MaintenanceRequirement,
  RequirementAction,
  RequirementApplicability,
  RequirementAuthority,
  RequirementInterval,
  TaskCode,
} from '@/domain';

/**
 * Source-agnostic triangulation (owner instruction 2026-09-30). Observations of one obligation,
 * each backed by verbatim quotes from any credible source (official or not), become ONE
 * requirement whose confidence comes from independent, grounded corroboration — never from
 * source authority alone. Pure: grounding (re-finding each quote at its URL) is done by
 * tools/ground-triangulation.mjs and passed in.
 *
 * Independence: the manufacturer / importer and every copy or restatement of their documents
 * count once (any market, any edition); other pages count per underlying document (`derivedFrom`),
 * else per publisher (registrable domain).
 * Confidence: high = an official document + ≥ 1 other independent group, or ≥ 3 independent
 * groups; medium = one official document, or 2 independent non-official groups; low = a single
 * non-official group (never drives a plan — level D). No grounded source naming the model →
 * low; no source stating the model years / generation → at most medium.
 */

export type SourceKind =
  | 'official_manual'
  | 'official_booklet'
  | 'importer'
  | 'manufacturer_site'
  | 'archived_official_copy'
  | 'workshop_manual'
  | 'maintenance_database'
  | 'parts_platform'
  | 'garage_publication'
  | 'press'
  | 'forum'
  | 'other';

export const OFFICIAL_KINDS: readonly SourceKind[] = [
  'official_manual',
  'official_booklet',
  'importer',
  'manufacturer_site',
  'archived_official_copy',
];

export interface SourceClaim {
  url: string;
  publisher: string;
  sourceKind: SourceKind;
  /** The underlying document this page reproduces (copies are not independent). */
  derivedFrom?: string | null;
  /** Verbatim, short. */
  quote: string;
  locator?: string | null;
  /** The source names the vehicle's model (not only the make or a model family). */
  namesModel: boolean;
}

export interface Grounding {
  /** The quote was re-found in the text fetched from the URL. */
  grounded: boolean;
  sha256?: string;
  method?: string;
}

/** Grounding is per cited quote at its URL (one page may be cited for several items). */
export const groundingKey = (s: Pick<SourceClaim, 'url' | 'quote'>) => `${s.url}
${s.quote}`;

export interface Observation {
  id: string;
  task: TaskCode;
  action: RequirementAction;
  taskText?: string;
  interval: RequirementInterval;
  applicability: RequirementApplicability;
  sources: SourceClaim[];
  /**
   * A source states the model years or the generation that covers the vehicle. When none does,
   * the requirement is known for the model only: confidence is capped at medium.
   */
  yearsStated: boolean;
}

export interface TriangulationAssessment {
  observationId: string;
  independentSources: number;
  officialSources: number;
  confidence: Confidence;
  groups: string[];
  /** Sources whose quote could not be re-found (not counted). */
  ungrounded: string[];
}

const MULTI_LABEL_SUFFIX = /\.(co|com|org|net|gov|ac)\.[a-z]{2}$/;

/** Registrable domain ("www.mazda3forums.com" → "mazda3forums.com", "x.co.il" kept whole). */
export function publisherKey(url: string): string {
  const host = url
    .replace(/^[a-z]+:\/\//i, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
  const labels = host.replace(/^www\./, '').split('.');
  const keep = MULTI_LABEL_SUFFIX.test(host) ? 3 : 2;
  return labels.slice(-keep).join('.');
}

/** A page that reproduces or restates the manufacturer's own manual / schedule / booklet. */
const OFFICIAL_DERIVATION = /manual|handbook|booklet|schedule|owner|service|maintenance|dealer/i;

/**
 * Independence: the manufacturer (with its importers and every copy or restatement of their
 * documents, in any market or edition) is ONE source; any other page counts per underlying
 * document, else per publisher.
 */
export function independenceKey(s: SourceClaim): string {
  if (isOfficialDerived(s)) return 'official';
  const doc = s.derivedFrom?.trim().toLowerCase().replace(/\s+/g, ' ');
  return doc ? `doc:${doc}` : `pub:${publisherKey(s.url)}`;
}

export function isOfficialDerived(s: SourceClaim): boolean {
  return (
    OFFICIAL_KINDS.includes(s.sourceKind) ||
    Boolean(s.derivedFrom && OFFICIAL_DERIVATION.test(s.derivedFrom))
  );
}

export function confidenceOf(independent: number, official: number): Confidence {
  if ((official >= 1 && independent >= 2) || independent >= 3) return 'high';
  // (official is 0 or 1: the manufacturer is one source.)
  if (official >= 1 || independent >= 2) return 'medium';
  return 'low';
}

export function assessObservation(
  o: Observation,
  grounding: ReadonlyMap<string, Grounding>,
): TriangulationAssessment {
  const counted = o.sources.filter((s) => grounding.get(groundingKey(s))?.grounded);
  const groups = new Map<string, boolean>();
  for (const s of counted) {
    const k = independenceKey(s);
    groups.set(k, k === 'official');
  }
  const independentSources = groups.size;
  const officialSources = [...groups.values()].filter(Boolean).length;
  let confidence = confidenceOf(independentSources, officialSources);
  // At least one grounded source must name the model; generic make-level pages only corroborate.
  if (!counted.some((s) => s.namesModel)) confidence = 'low';
  else if (!o.yearsStated && confidence === 'high') confidence = 'medium';
  return {
    observationId: o.id,
    independentSources,
    officialSources,
    confidence,
    groups: [...groups.keys()].sort(),
    ungrounded: o.sources
      .filter((s) => !grounding.get(groundingKey(s))?.grounded)
      .map((s) => s.url),
  };
}

const clipWords = (s: string, n: number) => {
  const w = s.replace(/\s+/g, ' ').trim().split(' ');
  return w.length > n ? `${w.slice(0, n).join(' ')} …` : w.join(' ');
};

/** One requirement per observation; only grounded sources are cited and counted. */
export function triangulate(
  observations: readonly Observation[],
  grounding: ReadonlyMap<string, Grounding>,
  at: IsoDate,
): { requirements: MaintenanceRequirement[]; assessments: TriangulationAssessment[] } {
  const requirements: MaintenanceRequirement[] = [];
  const assessments: TriangulationAssessment[] = [];
  for (const o of observations) {
    const a = assessObservation(o, grounding);
    assessments.push(a);
    const counted = o.sources.filter((s) => grounding.get(groundingKey(s))?.grounded);
    if (!counted.length) continue;
    const authority: RequirementAuthority = a.officialSources > 0 ? 'manufacturer' : 'secondary';
    const evidence: EvidenceRef[] = counted.map((s) => ({
      documentId: s.url,
      documentTitle: s.publisher,
      authority: OFFICIAL_KINDS.includes(s.sourceKind) ? 'manufacturer' : 'secondary',
      markets: o.applicability.markets ?? [],
      locator: s.locator || s.url,
      excerpt: clipWords(s.quote, 30),
      ...(grounding.get(groundingKey(s))?.sha256
        ? { documentSha256: grounding.get(groundingKey(s))!.sha256 }
        : {}),
    }));
    requirements.push({
      id: `tri-${o.id}`,
      task: o.task,
      ...(o.taskText ? { taskText: o.taskText } : {}),
      action: o.action,
      interval: o.interval,
      applicability: o.applicability,
      authority,
      evidence,
      // Low confidence stays a candidate: it is recorded, never scheduled.
      verification: a.confidence === 'low' ? 'candidate' : 'verified',
      extraction: { method: 'ai_candidate', by: 'autokeep-triangulation', at, grounded: true },
      corroboration: {
        independentSources: a.independentSources,
        officialSources: a.officialSources,
        confidence: a.confidence,
        groups: a.groups,
      },
    });
  }
  return { requirements, assessments };
}
