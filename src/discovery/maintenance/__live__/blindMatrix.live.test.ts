/// <reference types="node" />
/**
 * BLIND COVERAGE TEST (owner instruction 2026-09-29). OPT-IN, real network:
 *   npm run test:live -- blindMatrix
 * Runs the universal maintenance pipeline on the blind matrix fixed in
 * docs/release/evidence/maintenance-discovery/BLIND_MATRIX.md (commit 5b19311, before research),
 * plus regression vehicles, twice:
 *   1. "approved" — the registry exactly as the owner approved it (production behaviour);
 *   2. "proposed" — also treating PROPOSED registry hosts as approved (what owner approval of the
 *      proposed entries would change). The access policy (robots + terms) applies in both.
 * Writes results (structure, URLs, hashes, structured requirements — never document bytes or
 * text) to docs/release/evidence/maintenance-discovery/.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { admitToCatalog, type IsoDate, type KnowledgeEntry } from '@/domain';
import { MANUFACTURER_ALIASES } from '@/discovery/registry';

import { htmlTextReader } from '../htmlText';
import { runMaintenancePipeline, type PipelineResult } from '../pipeline';
import { SOURCE_REGISTRY } from '../sourceRegistry';
import {
  RegistryDiscovery,
  SecondaryDiscovery,
  UploadDiscovery,
  WebSearchDiscovery,
} from '../sources';
import type { Http, PageText, TextReader, VehicleIdentity } from '../types';

const ROOT = join(__dirname, '..', '..', '..', '..');
const OUT = join(ROOT, 'docs', 'release', 'evidence', 'maintenance-discovery');
const TODAY = '2026-09-29' as IsoDate;
const UA = 'AutoKeep-MaintenanceDiscovery/1.0 (research; contact: project owner)';

const http: Http = async (url, opts) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 90_000);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctl.signal,
      headers: { 'user-agent': UA },
    });
    const max = opts?.maxBytes ?? 60 * 1024 * 1024;
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > max) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const bytes = new Uint8Array(Math.min(size, max + 1));
    let o = 0;
    for (const c of chunks) {
      bytes.set(c.subarray(0, Math.max(0, bytes.length - o)), o);
      o += c.length;
    }
    return {
      ok: res.ok,
      status: res.status,
      url: res.url || url,
      contentType: res.headers.get('content-type') ?? '',
      bytes: size > max ? new Uint8Array(max + 1) : bytes,
    };
  } finally {
    clearTimeout(t);
  }
};

const pdfReader: TextReader = {
  async read(doc) {
    const dir = mkdtempSync(join(tmpdir(), 'ak-pdf-'));
    try {
      writeFileSync(join(dir, 'in.pdf'), doc.bytes);
      execFileSync(
        process.execPath,
        [join(ROOT, 'tools', 'pdf-text.mjs'), join(dir, 'in.pdf'), join(dir, 'out.json')],
        {
          stdio: 'pipe',
          timeout: 300_000,
        },
      );
      return JSON.parse(readFileSync(join(dir, 'out.json'), 'utf8')) as PageText[];
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
};

const sha256 = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const car = (
  make: string,
  model: string,
  modelYear: number,
  powertrain: VehicleIdentity['powertrain'],
  displacementCc?: number,
  engineCode?: string,
): VehicleIdentity => ({
  kind: 'car',
  make,
  model,
  modelYear,
  powertrain,
  ...(displacementCc ? { displacementCc } : {}),
  ...(engineCode ? { engineCode } : {}),
  market: 'IL',
});
const moto = (
  make: string,
  model: string,
  modelYear: number,
  displacementCc: number,
): VehicleIdentity => ({
  kind: 'motorcycle',
  make,
  model,
  modelYear,
  powertrain: 'petrol',
  displacementCc,
  market: 'IL',
});

export const BLIND: [string, string, VehicleIdentity][] = [
  ['B1', 'older ICE, Japanese', car('Mazda', '3', 2011, 'petrol', 1598)],
  ['B2', 'recent ICE, Korean', car('Kia', 'Sportage', 2023, 'petrol', 1598)],
  ['B3', 'hybrid, Japanese', car('Toyota', 'C-HR', 2019, 'hybrid', 1798)],
  ['B4', 'EV, US', car('Tesla', 'Model 3', 2022, 'electric')],
  ['B5', 'European, multiple engine variants', car('Skoda', 'Octavia', 2018, 'petrol', 1395)],
  ['B6', 'older ICE, Korean', car('Hyundai', 'i20', 2016, 'petrol', 1396)],
  ['B7', 'motorcycle', moto('Yamaha', 'MT-07', 2020, 689)],
  ['B8', 'scooter, Japanese', moto('Honda', 'PCX 125', 2019, 125)],
  ['B9', 'scooter, Taiwanese', moto('SYM', 'Jet 14 125', 2021, 125)],
  ['B10', 'EV, Chinese', car('MG', 'ZS EV', 2021, 'electric')],
  ['B11', 'recent ICE, Japanese', car('Suzuki', 'Swift', 2019, 'petrol', 1242)],
  ['B12', 'European, French', car('Peugeot', '208', 2021, 'petrol', 1199)],
];
export const REGRESSION: [string, string, VehicleIdentity][] = [
  ['R1', 'regression', car('SEAT', 'Ibiza', 2012, 'petrol', 1390, 'CGG')],
  ['R2', 'regression', car('Ford', 'Fiesta', 2015, 'petrol', 1242, 'SNJB')],
  ['R3', 'regression', car('Hyundai', 'IONIQ Hybrid', 2021, 'hybrid', 1580)],
];

/**
 * CAPABILITY PROBE — NOT part of the blind matrix or its metrics. Other models listed on the one
 * source the access policy permits (sym-global.com, SYM pilot), to show the downstream stages
 * (classification, sections, table extraction, grounding, levels) on real documents.
 */
export const PROBE: [string, string, VehicleIdentity][] = [
  ['P1', 'probe', moto('SYM', 'Jet 14 EVO', 2024, 125)],
  ['P2', 'probe', moto('SYM', 'JET X', 2023, 125)],
  ['P3', 'probe', moto('SYM', 'Joyride S', 2023, 200)],
];

type Row = { id: string; cls: string; identity: VehicleIdentity; result: PipelineResult };

async function runPass(
  mode: 'approved' | 'proposed',
  catalog: KnowledgeEntry[],
  set: [string, string, VehicleIdentity][] = [...BLIND, ...REGRESSION],
) {
  const rows: Row[] = [];
  const robots = new Map<string, string | null>();
  for (const [id, cls, identity] of set) {
    const result = await runMaintenancePipeline(identity, {
      http,
      registry: SOURCE_REGISTRY,
      aliases: MANUFACTURER_ALIASES,
      assumeProposedApproved: mode === 'proposed',
      robots,
      sha256,
      readers: { pdf: pdfReader, html: htmlTextReader },
      adapters: [
        new RegistryDiscovery(),
        new UploadDiscovery([]),
        new WebSearchDiscovery(null),
        new SecondaryDiscovery(),
      ],
      catalog,
      today: TODAY,
    });
    const admitted = admitToCatalog(catalog, result.catalogCandidates, TODAY);
    catalog.splice(0, catalog.length, ...admitted.entries);
    rows.push({ id, cls, identity, result });
  }
  return rows;
}

jest.setTimeout(60 * 60 * 1000);

it('runs the blind matrix through the universal pipeline and records the evidence', async () => {
  mkdirSync(OUT, { recursive: true });
  const out: Record<string, unknown> = {
    ranAt: new Date().toISOString(),
    registryEntries: SOURCE_REGISTRY.length,
  };
  for (const mode of ['approved', 'proposed', 'probe'] as const) {
    const catalog: KnowledgeEntry[] = [];
    const rows =
      mode === 'probe' ? await runPass('approved', catalog, PROBE) : await runPass(mode, catalog);
    // Reuse check: an identical vehicle class re-run hits the catalog before any research.
    const reuse = [];
    for (const r of rows.filter((x) => x.result.catalogCandidates.length)) {
      const again = await runMaintenancePipeline(r.identity, {
        http: async () => {
          throw new Error('network must not be used when knowledge exists');
        },
        registry: SOURCE_REGISTRY,
        aliases: MANUFACTURER_ALIASES,
        assumeProposedApproved: mode === 'proposed',
        robots: new Map(),
        sha256,
        readers: { pdf: pdfReader, html: htmlTextReader },
        adapters: [new RegistryDiscovery()],
        catalog,
        today: TODAY,
      });
      reuse.push({
        id: r.id,
        catalogHits: again.trace.catalogHits,
        catalogKnown: again.trace.catalogKnown,
        documentsFetched: again.trace.documents.length,
      });
    }
    out[mode] = {
      catalogEntries: catalog.length,
      reuse,
      vehicles: rows.map(({ id, cls, identity, result }) => ({
        id,
        cls,
        identity,
        discovery: result.trace.discovery.map((d) => ({
          adapter: d.adapter,
          leads: d.leads.map((l) => ({ url: l.url, title: l.title, via: l.via })),
          blocked: d.blocked,
          notes: d.notes,
        })),
        userActions: result.trace.userActions,
        documents: result.trace.documents.map((d) => ({
          ...d,
          profile: d.profile && { ...d.profile },
        })),
        requirements: result.trace.requirements.map((q) => ({
          id: q.id,
          task: q.task,
          taskText: q.taskText,
          action: q.action,
          interval: q.interval,
          verification: q.verification,
          grounded: q.extraction.grounded,
          page: q.evidence[0]?.page,
          locator: q.evidence[0]?.locator,
          applicability: q.applicability,
        })),
        levels: result.trace.levels,
        resolutions: result.resolutions.map((r) => ({
          task: r.task,
          status: r.status,
          level: r.level,
          reason: r.reason,
          missing: r.missing,
          effective: r.effective && {
            action: r.effective.action,
            interval: r.effective.interval,
            evidence: r.effective.evidence.map((e) => ({
              url: e.documentTitle,
              page: e.page,
              locator: e.locator,
              sha256: e.documentSha256,
              markets: e.markets,
            })),
            applicability: r.effective.applicability,
          },
          considered: r.considered.map((c) => ({
            id: c.requirement.id,
            level: c.level,
            role: c.role,
            verdict: c.applicability.verdict,
            missing: c.applicability.missing,
            coverageUnknown: c.applicability.coverageUnknown,
          })),
        })),
        failures: result.trace.failures,
      })),
    };
  }
  writeFileSync(join(OUT, 'results.json'), JSON.stringify(out, null, 2));
  expect(out.approved).toBeDefined();
});
