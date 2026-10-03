/// <reference types="node" />
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { htmlTextReader } from '../../htmlText';
import { SOURCE_SYSTEMS } from '../../registry/israelSources';
import { FableDiscoveryAdapter, RegistryDiscoveryAdapter, recordedResearch } from '../adapters';
import { buildFingerprint } from '../fingerprint';
import { nodeNet, pdfReader, ROOT, sha256 } from '../node/host';
import { runMSource } from '../run';
import {
  learnFromRun,
  mergeKnowledge,
  SourceKnowledgeAdapter,
  type SourceKnowledge,
} from '../sourceKnowledge';
import { terminalStatus } from '../status';
import { MATRIX } from './matrix';

/**
 * OPT-IN live cross-manufacturer validation (`npm run test:live -- matrix`). ONE generic pipeline
 * for every vehicle: recorded research-assistant candidates + the official registry + source
 * families learned from the vehicles processed before (sequential). No per-vehicle code path.
 * Writes structured results only (no document bytes).
 */

const DATA = join(ROOT, 'docs', 'maintenance', 'data', 'msource');
const OUT = join(DATA, 'matrix');
const ALLOWED_TYPES = new Set([
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
]);

/** All recorded discovery output for a vehicle id, as research-assistant candidates. */
function researchFor(id: string): unknown {
  const candidates: unknown[] = [];
  const restrictedSeen: unknown[] = [];
  for (const i of [1, 2, 3]) {
    const f = join(OUT, `matrix-discovery-${i}.json`);
    if (!existsSync(f)) continue;
    const v = JSON.parse(readFileSync(f, 'utf8')).vehicles?.[id];
    if (v) {
      candidates.push(...v.candidates);
      restrictedSeen.push(...(v.restrictedSeen ?? []));
    }
  }
  const legacy: Record<string, string> = { F01: 'fiesta', S01: 'ibiza' };
  if (legacy[id]) {
    const fable = JSON.parse(readFileSync(join(DATA, 'fable', `fable-${legacy[id]}.json`), 'utf8'));
    candidates.push(...fable.candidates);
    restrictedSeen.push(...(fable.restrictedSeen ?? []));
    // Targeted research records (URLs only; their quoted values are NOT used — every value must
    // be re-read from the page by the pipeline).
    const r = JSON.parse(
      readFileSync(join(DATA, 'research', `research-${legacy[id]}.json`), 'utf8'),
    );
    for (const e of r.evidence ?? []) {
      candidates.push({
        url: e.url,
        title: e.location ?? null,
        publisher: e.sourceIdentity ?? null,
        sourceType: ALLOWED_TYPES.has(e.sourceType) ? e.sourceType : 'other',
        documentFormat: /\.pdf($|\?)/i.test(e.url) ? 'pdf' : 'unknown',
      });
    }
  }
  return { assistant: 'fable', candidates, restrictedSeen };
}

const summary: unknown[] = [];
// Starts empty: everything reused later was learned from earlier vehicles in this run.
let knowledge: SourceKnowledge[] = [];

describe('M-SOURCE cross-manufacturer matrix (live)', () => {
  afterAll(() => {
    writeFileSync(join(OUT, 'matrix-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    writeFileSync(join(OUT, 'source-knowledge.json'), `${JSON.stringify(knowledge, null, 2)}\n`);
  });

  it.each(MATRIX.map((v) => [v.id, v] as const))(
    '%s',
    async (_id, v) => {
      const built = buildFingerprint(v.input);
      if (!built.ok) throw new Error(`${v.id}: ${built.missing.join(',')}`);
      const fp = built.fingerprint;
      const net = nodeNet();
      const run = await runMSource(fp, {
        runId: `matrix-${v.id}`,
        vehicleRef: v.id,
        adapters: [
          new FableDiscoveryAdapter(recordedResearch(`matrix-research-${v.id}`, researchFor(v.id))),
          new RegistryDiscoveryAdapter(SOURCE_SYSTEMS, net),
          new SourceKnowledgeAdapter(knowledge),
        ],
        access: {
          registry: SOURCE_SYSTEMS,
          net,
          now: () => new Date().toISOString(),
          robots: new Map(),
        },
        net,
        readers: { pdf: pdfReader(), html: htmlTextReader },
        sha256,
        today: new Date().toISOString().slice(0, 10) as never,
        now: () => new Date().toISOString(),
        archive: true,
        limits: { maxCandidates: 60, maxDocuments: 30, conflictExtra: 10 },
      });
      knowledge = mergeKnowledge(knowledge, learnFromRun(run, fp));
      const s = run.schedule!;
      const srcOf = (id: string) => s.sources.find((x) => x.sourceId === id);
      const evOf = (id: string) => s.evidence.find((e) => e.id === id)!;
      const outcomes: Record<string, number> = {};
      for (const c of run.candidates) {
        const k = c.outcome + (c.failure ? ` ${c.failure.code}` : '');
        outcomes[k] = (outcomes[k] ?? 0) + 1;
      }
      const item = (i: (typeof s.items)[number]) => ({
        operation: i.operation,
        action: i.action,
        intervalKm: i.intervalKm,
        intervalMonths: i.intervalMonths,
        quality: i.quality,
        scope: i.scope ?? null,
        applicabilityStatus: i.applicabilityStatus ?? null,
        conditions: i.conditions ?? null,
        independentSources: i.independentSources,
        officialSources: i.officialSources,
        conflicts: i.conflicts.map((c) => [c.intervalKm, c.intervalMonths]),
        sources: i.evidenceIds.map((id) => {
          const e = evOf(id);
          const src = srcOf(e.sourceId)!;
          return {
            url: src.finalUrl,
            official: src.authority?.official ?? false,
            location: `p${e.sourceLocation.page}`,
            text: e.originalText.slice(0, 120),
            documentYears: src.statedApplicability
              ? [
                  src.statedApplicability.yearFrom,
                  src.statedApplicability.yearTo,
                  src.statedApplicability.yearBasis ?? null,
                ]
              : null,
            itemScope: e.itemApplicability?.basis ?? null,
          };
        }),
      });
      summary.push({
        id: v.id,
        label: v.label,
        covers: v.covers,
        fingerprintKey: run.fingerprintKey,
        status: s.status,
        state: terminalStatus(run, run.finishedAt).state,
        candidates: run.candidates.length,
        byAdapter: run.stages.find((x) => x.stage === 'DISCOVERY')?.counts,
        acquired: s.sources.length,
        evidence: s.evidence.length,
        usableEvidence: s.evidence.filter((e) =>
          ['EXACT', 'STRONG', 'SUPPORTED'].includes(e.match.baseStatus ?? e.match.status),
        ).length,
        outcomes,
        items: s.items.map(item),
        unresolved: s.unresolved.map(item),
      });
      writeFileSync(
        join(OUT, `${v.id}-run.json`),
        `${JSON.stringify({ run: { ...run, candidates: run.candidates.map((c) => ({ url: c.candidate.canonicalUrl, by: c.candidate.discoveredBy, outcome: c.outcome, failure: c.failure ?? null })) } }, null, 2)}\n`,
      );

      // Generic invariants for every vehicle.
      expect(run.stages).toHaveLength(10);
      for (const i of s.items) {
        for (const id of i.evidenceIds) {
          const e = evOf(id);
          expect(e.grounded).toBe(true);
          expect(srcOf(e.sourceId)?.contentSha256).toHaveLength(64);
        }
      }
    },
    1_500_000,
  );
});
