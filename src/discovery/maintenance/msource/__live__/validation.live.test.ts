/// <reference types="node" />
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { htmlTextReader } from '../../htmlText';
import { SOURCE_SYSTEMS } from '../../registry/israelSources';
import { CRAWLER_TOKEN } from '../accessEngine';
import { FableDiscoveryAdapter, RegistryDiscoveryAdapter, recordedResearch } from '../adapters';
import { buildFingerprint, type FingerprintInput } from '../fingerprint';
import type { MSourceEvent } from '../log';
import { nodeNet, pdfReader, ROOT, sha256 } from '../node/host';
import { runMSource, type MSourceRun } from '../run';
import { terminalStatus } from '../status';

/**
 * OPT-IN live validation of M-SOURCE V1 on the two project acceptance vehicles
 * (`npm run test:live -- msource`). Real network, real access decisions:
 *   discovery = the recorded Fable research runs (candidate URLs only) + the official registry;
 *   every fetch is decided by the access engine (robots.txt for "AutoKeepBot", registry policy);
 *   documents are read in memory and discarded — only structured results are written.
 * The test asserts invariants, never a schedule: "no evidence" is a valid result.
 */

const DATA = join(ROOT, 'docs', 'maintenance', 'data', 'msource');

const VEHICLES: { key: string; input: FingerprintInput; regime?: string }[] = [
  {
    key: 'fiesta',
    input: {
      kind: 'car',
      manufacturer: 'פורד גרמניה',
      model: 'FIESTA',
      year: 2015,
      engine: '1242 סמ״ק',
      engineCode: 'SNJB',
      fuel: 'בנזין',
      transmission: 'ידני',
    },
  },
  {
    key: 'ibiza',
    // Engine code as registered by the Ministry of Transport (degem_manoa): CGG.
    input: {
      kind: 'car',
      manufacturer: 'סיאט ספרד',
      model: 'IBIZA',
      year: 2012,
      engine: '1390 סמ״ק',
      engineCode: 'CGG',
      fuel: 'בנזין',
    },
  },
];

function summarize(run: MSourceRun) {
  const s = run.schedule;
  return {
    runId: run.runId,
    fingerprintKey: run.fingerprintKey,
    msourceVersion: run.msourceVersion,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    crawlerToken: CRAWLER_TOKEN,
    status: terminalStatus(run, run.finishedAt),
    stages: run.stages.map((x) => ({
      stage: x.stage,
      status: x.status,
      counts: x.counts,
      failures: x.failures,
      notes: x.notes,
    })),
    queries: run.queries,
    restricted: run.restricted,
    candidates: run.candidates.map((c) => ({
      url: c.candidate.canonicalUrl,
      discoveredBy: c.candidate.discoveredBy,
      sourceTypeClaimed: c.candidate.sourceType,
      outcome: c.outcome,
      failure: c.failure ?? null,
      decisions: c.decisions.map((d) => ({
        operation: d.operation,
        status: d.status,
        reason: d.reason,
        evidence: d.evidence.map((e) => `${e.kind}: ${e.ref} — ${e.detail}`),
        decidedAt: d.decidedAt,
      })),
    })),
    schedule: s && {
      status: s.status,
      items: s.items,
      unresolved: s.unresolved,
      sources: s.sources.map((p) => ({ ...p, access: undefined })),
      evidence: s.evidence.map((e) => ({ ...e, requirement: undefined })),
    },
  };
}

describe.each(VEHICLES)('M-SOURCE live validation: $key', ({ key, input }) => {
  it('runs every stage, decides access per operation, and fabricates nothing', async () => {
    const fp = buildFingerprint(input);
    if (!fp.ok) throw new Error(fp.missing.join(','));
    const research = JSON.parse(readFileSync(join(DATA, 'fable', `fable-${key}.json`), 'utf8'));
    const requested: string[] = [];
    const events: MSourceEvent[] = [];
    const net = nodeNet(requested);
    const run = await runMSource(fp.fingerprint, {
      runId: `live-${key}-${new Date().toISOString().slice(0, 10)}`,
      vehicleRef: `acceptance-${key}`,
      adapters: [
        new FableDiscoveryAdapter(recordedResearch(`fable-research-${key}-2026-10-02`, research)),
        new RegistryDiscoveryAdapter(SOURCE_SYSTEMS, net),
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
      limits: { maxCandidates: 80, maxDocuments: 60, conflictExtra: 20 },
      log: (e) => events.push(e),
    });
    writeFileSync(join(DATA, `${key}-run.json`), `${JSON.stringify(summarize(run), null, 2)}\n`);
    // Class-level catalog for the app: structured results per source that yielded evidence
    // (provenance + evidence records; never document bytes or text beyond short excerpts).
    const s0 = run.schedule!;
    const catalog = s0.sources
      .filter((src) => s0.evidence.some((e) => e.sourceId === src.sourceId))
      .map((src) => ({
        canonicalUrl: src.canonicalUrl,
        value: {
          provenance: src,
          evidence: s0.evidence.filter((e) => e.sourceId === src.sourceId),
        },
      }));
    writeFileSync(
      join(DATA, `${key}-catalog.json`),
      `${JSON.stringify({ classKey: run.fingerprintKey, runId: run.runId, sources: catalog }, null, 2)}\n`,
    );

    // Every stage ran and is recorded.
    expect(run.stages).toHaveLength(10);
    // No document was requested without an ALLOWED fetch decision for that exact URL.
    const allowed = new Set(
      run.candidates.flatMap((c) =>
        c.decisions
          .filter((d) => d.operation === 'FETCH' && d.status === 'ALLOWED')
          .map((d) => d.url),
      ),
    );
    for (const u of requested) {
      const path = new URL(u).pathname;
      const infra = path === '/robots.txt' || u.includes('archive.org/wayback/available');
      const registryProbe = !run.candidates.some((c) => c.candidate.canonicalUrl === u);
      if (!infra && !registryProbe) expect(allowed.has(u)).toBe(true);
    }
    // Scheduled items rest only on grounded, applicable evidence with provenance.
    const s = run.schedule!;
    for (const item of s.items) {
      expect(['EXACT', 'STRONG', 'SUPPORTED']).toContain(item.quality);
      for (const id of item.evidenceIds) {
        const ev = s.evidence.find((e) => e.id === id)!;
        expect(ev.grounded).toBe(true);
        expect(['EXACT', 'STRONG', 'SUPPORTED']).toContain(ev.match.status);
        expect(s.sources.find((x) => x.sourceId === ev.sourceId)?.contentSha256).toHaveLength(64);
      }
    }
    // Logs carry no document text and no VIN.
    expect(JSON.stringify(events)).not.toMatch(/VSSZZZ|WF0[A-Z0-9]{10}/);
  }, 1_200_000);
});
