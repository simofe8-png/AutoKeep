import { z } from 'zod';

import type { SourceCandidate, SourceType } from './types';

/**
 * Candidate normalization and de-duplication. A candidate is a URL that MIGHT hold a schedule;
 * every field other than the URL is discovery metadata and never evidence.
 */

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|mc_[a-z]+|ref|_ga|yclid|msclkid)$/i;

/** Lower-case scheme/host, no fragment, no default port, no tracking parameters. */
export function canonicalizeUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/\.$/, '');
  if (u.port === '443' || u.port === '80') u.port = '';
  const keep = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k));
  u.search = '';
  for (const [k, v] of keep) u.searchParams.append(k, v);
  return u.href;
}

/** Stable short id (FNV-1a 64-bit as two 32-bit halves) of a canonical URL. */
export function candidateId(canonical: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01234567;
  for (let i = 0; i < canonical.length; i += 1) {
    const c = canonical.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x01000193) >>> 0;
  }
  return `src-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function makeCandidate(
  input: Omit<SourceCandidate, 'id' | 'canonicalUrl' | 'formatHint'> & {
    formatHint?: SourceCandidate['formatHint'];
  },
): SourceCandidate | null {
  const canonicalUrl = input.upload ? input.url : canonicalizeUrl(input.url);
  if (!canonicalUrl) return null;
  const formatHint = input.formatHint ?? (/\.pdf($|\?)/i.test(canonicalUrl) ? 'pdf' : 'unknown');
  return { ...input, canonicalUrl, formatHint, id: candidateId(canonicalUrl) };
}

/**
 * De-duplicates by canonical URL, keeping the first discovery (adapters run in priority order)
 * and merging what other adapters said into notes, never into evidence.
 */
export function dedupeCandidates(list: readonly SourceCandidate[]): {
  unique: SourceCandidate[];
  duplicates: { id: string; discoveredBy: string }[];
} {
  const unique: SourceCandidate[] = [];
  const duplicates: { id: string; discoveredBy: string }[] = [];
  const seen = new Map<string, SourceCandidate>();
  for (const c of list) {
    const prior = seen.get(c.canonicalUrl);
    if (prior) {
      duplicates.push({ id: c.id, discoveredBy: c.discoveredBy });
      continue;
    }
    seen.set(c.canonicalUrl, c);
    unique.push(c);
  }
  return { unique, duplicates };
}

// ---------- research assistant (Fable) output ----------

const SOURCE_TYPES = [
  'oem_manual',
  'oem_schedule',
  'oem_booklet',
  'importer',
  'dealer',
  'service_document',
  'independent_database',
  'publication',
  'forum',
  'archive',
  'other',
] as const satisfies readonly SourceType[];

const nullableYear = z.number().int().min(1950).max(2100).nullable().optional();

export const ResearchCandidateSchema = z.object({
  url: z.string().min(8).max(2048),
  title: z.string().max(400).nullable().optional(),
  publisher: z.string().max(200).nullable().optional(),
  sourceType: z.enum(SOURCE_TYPES).catch('other'),
  documentFormat: z.enum(['pdf', 'html', 'unknown']).catch('unknown'),
  language: z.string().max(12).nullable().optional(),
  market: z.string().max(12).nullable().optional(),
  statedApplicability: z
    .object({
      models: z.array(z.string().max(80)).max(20).nullable().optional(),
      yearFrom: nullableYear,
      yearTo: nullableYear,
      engines: z.array(z.string().max(80)).max(20).nullable().optional(),
      engineCodes: z.array(z.string().max(16)).max(20).nullable().optional(),
    })
    .nullable()
    .optional(),
  whyRelevant: z.string().max(600).nullable().optional(),
  searchSnippet: z.string().max(600).nullable().optional(),
});

export const ResearchOutputSchema = z.object({
  assistant: z.string().max(40).optional(),
  researchedAt: z.string().max(40).optional(),
  queriesUsed: z.array(z.string().max(300)).max(200).optional(),
  candidates: z.array(z.unknown()).max(200),
  alternateQueries: z.array(z.string().max(300)).max(100).optional(),
  restrictedSeen: z
    .array(z.object({ url: z.string().max(2048), reason: z.string().max(200) }))
    .max(100)
    .optional(),
});

export interface NormalizedResearch {
  candidates: SourceCandidate[];
  rejected: { index: number; reason: string }[];
  restrictedSeen: { url: string; reason: string }[];
  alternateQueries: string[];
}

/**
 * Validates research-assistant output (untrusted model output) field by field. Invalid entries
 * are rejected individually; nothing in it is ever an interval or evidence. Restricted sources
 * the assistant saw (login, paywall) are kept as metadata and never fetched.
 */
export function normalizeResearch(
  raw: unknown,
  meta: { adapter: string; at: string },
): NormalizedResearch {
  const out: NormalizedResearch = {
    candidates: [],
    rejected: [],
    restrictedSeen: [],
    alternateQueries: [],
  };
  const parsed = ResearchOutputSchema.safeParse(raw);
  if (!parsed.success) {
    out.rejected.push({ index: -1, reason: 'output does not match the research schema' });
    return out;
  }
  out.restrictedSeen = parsed.data.restrictedSeen ?? [];
  out.alternateQueries = parsed.data.alternateQueries ?? [];
  const restricted = new Set(out.restrictedSeen.map((r) => canonicalizeUrl(r.url)));
  parsed.data.candidates.forEach((c, index) => {
    const r = ResearchCandidateSchema.safeParse(c);
    if (!r.success) {
      out.rejected.push({ index, reason: 'invalid candidate fields' });
      return;
    }
    const d = r.data;
    if (restricted.has(canonicalizeUrl(d.url))) {
      out.rejected.push({ index, reason: 'listed as restricted by the assistant' });
      return;
    }
    const a = d.statedApplicability ?? undefined;
    const cand = makeCandidate({
      url: d.url,
      title: d.title ?? undefined,
      publisher: d.publisher ?? undefined,
      sourceType: d.sourceType,
      formatHint: d.documentFormat,
      discoveredBy: meta.adapter,
      discoveredAt: meta.at,
      language: d.language ?? undefined,
      market: d.market ?? null,
      statedApplicability: a
        ? {
            models: a.models ?? undefined,
            yearFrom: a.yearFrom ?? null,
            yearTo: a.yearTo ?? null,
            engines: a.engines ?? undefined,
            engineCodes: a.engineCodes ?? undefined,
          }
        : undefined,
      hint: [d.whyRelevant, d.searchSnippet].filter(Boolean).join(' — ').slice(0, 400) || undefined,
    });
    if (!cand) out.rejected.push({ index, reason: 'unparseable URL' });
    else out.candidates.push(cand);
  });
  return out;
}
