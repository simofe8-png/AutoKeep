/// <reference types="node" />
/**
 * M-SOURCE live run (OPT-IN, real network): `npm run test:live -- blindMatrix`.
 *
 *  1. Representative adapters on REAL source systems (Step 7).
 *  2. The committed blind set B1–B12 (docs/release/evidence/maintenance-discovery/BLIND_MATRIX.md,
 *     fixed in 5b19311 before any research) and the regression vehicles (Steps 13–14), through the
 *     production registry (approved systems only) and the access policy.
 *  3. A capability probe on the one policy-permitted system (not blind, not in the metrics).
 *  4. Coverage: fleet ceilings over the committed Ministry universe + the exact blind-sample result
 *     (Step 12) → docs/maintenance/ISRAEL_COVERAGE_MATRIX.md and COVERAGE_GAPS.md.
 *
 * Nothing but structured results is written (URLs, hashes, requirements with locators).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { admitToCatalog, type IsoDate, type KnowledgeEntry } from '@/domain';
import { MANUFACTURER_ALIASES } from '@/discovery/registry';

import { runAdapter } from '../adapters';
import { fleetCoverage, pct, sampleCoverage, type Ratio, type SampleOutcome } from '../coverage';
import { officialSourcesFor } from '../fallback';
import { htmlTextReader } from '../htmlText';
import { runMaintenancePipeline, type PipelineResult } from '../pipeline';
import { SOURCE_SYSTEMS } from '../registry/israelSources';
import { candidateSystems, makeKeyOf, type FleetUniverse } from '../registry/universe';
import {
  RegistryDiscovery,
  SecondaryDiscovery,
  UploadDiscovery,
  WebSearchDiscovery,
} from '../sources';
import type { VehicleIdentity } from '../types';

import { http, pdfReader, REQUESTED, ROOT, sha256 } from './liveIo';

const TODAY = '2026-09-30' as IsoDate;
const EVIDENCE = join(ROOT, 'docs', 'release', 'evidence', 'maintenance-discovery');
const DOCS = join(ROOT, 'docs', 'maintenance');

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

/** Fixed in 5b19311 BEFORE any research. Never edited after seeing results. */
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
  ['R1', 'SEAT Ibiza 2012 CGG', car('SEAT', 'Ibiza', 2012, 'petrol', 1390, 'CGG')],
  ['R2', 'Ford Fiesta 2015 1.25 SNJB', car('Ford', 'Fiesta', 2015, 'petrol', 1242, 'SNJB')],
  [
    'R3',
    'Hyundai IONIQ 2021 Premium FL Hybrid 1.6',
    car('Hyundai', 'IONIQ Hybrid', 2021, 'hybrid', 1580),
  ],
];
/** CAPABILITY PROBE — not blind, not in the metrics: other models on the one permitted system. */
export const PROBE: [string, string, VehicleIdentity][] = [
  ['P1', 'probe', moto('SYM', 'JET X', 2023, 125)],
  ['P2', 'probe', moto('SYM', 'Joyride S', 2023, 200)],
];

const deps = (catalog: KnowledgeEntry[]) => ({
  http,
  registry: SOURCE_SYSTEMS,
  aliases: MANUFACTURER_ALIASES,
  robots: new Map<string, string | null>(),
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

function vehicleReport(id: string, label: string, v: VehicleIdentity, r: PipelineResult) {
  const key = makeKeyOf(v.make, MANUFACTURER_ALIASES) ?? v.make.toLowerCase();
  const candidates = candidateSystems(v, SOURCE_SYSTEMS, MANUFACTURER_ALIASES);
  const failures = r.trace.discovery.flatMap((d) => d.failures ?? []);
  const resolved = r.resolutions.filter((x) => x.status === 'resolved');
  const docs = r.trace.documents.filter((d) => d.authority !== 'user_upload');
  const official = officialSourcesFor(v.make, SOURCE_SYSTEMS, MANUFACTURER_ALIASES, v.kind);
  return {
    id,
    label,
    identity: v,
    identityResolution: { manufacturerKey: key },
    candidates: candidates.map((c) => ({
      id: c.system.sourceSystemId,
      priority: c.priority,
      status: c.system.status,
      type: c.system.sourceType,
    })),
    accessDecisions: candidates.map((c) => {
      const f = failures.find((x) => x.sourceSystemId === c.system.sourceSystemId);
      return {
        id: c.system.sourceSystemId,
        decision: f ? f.code : 'DOCUMENTS_FOUND',
        detail: f?.detail,
      };
    }),
    discoveredOfficialSource:
      r.trace.discovery
        .flatMap((d) => d.leads)
        .map((l) => ({ url: l.url, system: l.sourceSystemId }))[0] ?? null,
    documents: docs.map((d) => ({
      url: d.url,
      sha256: d.sha256,
      system: d.sourceSystemId,
      version: d.version,
      versionStatus: d.versionStatus,
      match: d.vehicleMatch,
      unresolved: d.unresolved,
      sections: d.sections.length,
      extracted: d.extracted,
      grounded: d.grounded,
      failure: d.failure,
      detail: d.failureDetail,
    })),
    exactApplicability: docs.some((d) => d.vehicleMatch === 'exact'),
    extracted: docs.reduce((a, d) => a + d.extracted, 0),
    levelsConsidered: r.trace.levels,
    usableSchedule: resolved.length > 0,
    scheduledItems: resolved.map((x) => ({
      task: x.task,
      action: x.action,
      level: x.level,
      interval: x.effective?.interval,
    })),
    israeliAuthority: resolved.some((x) => x.level === 'A'),
    userIntervention: resolved.length === 0,
    userFallback: official.map((o) => ({ system: o.sourceSystemId, reason: o.reason, url: o.url })),
    failureCodes: [...new Set(r.trace.failures.map((f) => f.class))],
    failureDetails: r.trace.failures,
  };
}

const f = (r: Ratio) =>
  `${r.numerator.toLocaleString('en')} / ${r.denominator.toLocaleString('en')} (${pct(r).toFixed(2)}%)`;

jest.setTimeout(60 * 60 * 1000);

it('M-SOURCE: representative adapters, blind set, regression, probe and coverage', async () => {
  mkdirSync(EVIDENCE, { recursive: true });
  const out: Record<string, unknown> = {
    ranAt: new Date().toISOString(),
    sourceSystems: SOURCE_SYSTEMS.length,
  };

  // 1. Representative adapters on real systems (different source patterns).
  const probeVehicle: Record<string, VehicleIdentity> = {
    'il-champion-service-routine': car('Skoda', 'Octavia', 2018, 'petrol', 1395),
    'global-sym-global': moto('SYM', 'JET X', 2023, 125),
    'il-union-motors-toyota': car('Toyota', 'C-HR', 2019, 'hybrid', 1798),
    'global-kia-ownersmanual': car('Kia', 'Sportage', 2023, 'petrol', 1598),
    'il-delek-mazda': car('Mazda', '3', 2011, 'petrol', 1598),
  };
  const adapters = [];
  for (const [id, v] of Object.entries(probeVehicle)) {
    const system = SOURCE_SYSTEMS.find((s) => s.sourceSystemId === id)!;
    const before = REQUESTED.length;
    const { adapterId, result } = await runAdapter(system, v, deps([]));
    adapters.push({
      system: id,
      type: system.sourceType,
      adapter: adapterId,
      result:
        result.status === 'documents'
          ? {
              status: 'documents',
              documents: result.documents.map((d) => ({
                url: d.url,
                modelMatch: d.modelMatch,
                statedYears: d.statedYears,
              })),
            }
          : result,
      requests: REQUESTED.slice(before),
    });
  }
  out.adapters = adapters;

  // 2. Blind + regression (production registry: approved systems only).
  const catalog: KnowledgeEntry[] = [];
  const rows = [];
  for (const [id, label, v] of [...BLIND, ...REGRESSION]) {
    const r = await runMaintenancePipeline(v, deps(catalog));
    catalog.splice(
      0,
      catalog.length,
      ...admitToCatalog(catalog, r.catalogCandidates, TODAY).entries,
    );
    rows.push(vehicleReport(id, label, v, r));
  }
  out.vehicles = rows;

  // 3. Capability probe.
  const probe = [];
  for (const [id, label, v] of PROBE) {
    const r = await runMaintenancePipeline(v, deps([]));
    probe.push({
      ...vehicleReport(id, label, v, r),
      requirements: r.trace.requirements.map((q) => ({
        task: q.task,
        action: q.action,
        interval: q.interval,
        verification: q.verification,
        grounded: q.extraction.grounded,
        page: q.evidence[0]?.page,
        locator: q.evidence[0]?.locator,
        coverageUnknown: q.applicability.coverageUnknown,
      })),
    });
  }
  out.probe = probe;

  // 4. Coverage.
  const universe = JSON.parse(
    readFileSync(join(DOCS, 'data', 'fleet_universe_2026-09-30.json'), 'utf8'),
  ) as FleetUniverse;
  const fleet = fleetCoverage(universe, SOURCE_SYSTEMS, MANUFACTURER_ALIASES);
  const blind = rows.filter((r) => r.id.startsWith('B'));
  const sample = sampleCoverage(
    blind.map((r): SampleOutcome => ({
      id: r.id,
      documentRetrieved: r.documents.length > 0,
      exactApplicability: r.exactApplicability,
      scheduled: r.usableSchedule,
      israeliAuthority: r.israeliAuthority,
      failures: r.failureCodes,
    })),
  );
  out.coverage = { fleet: { ...fleet, manufacturers: fleet.manufacturers.slice(0, 60) }, sample };
  writeFileSync(join(EVIDENCE, 'msource_results.json'), JSON.stringify(out, null, 2));

  writeFileSync(join(DOCS, 'ISRAEL_COVERAGE_MATRIX.md'), coverageMatrix(fleet, sample, blind));
  writeFileSync(join(DOCS, 'COVERAGE_GAPS.md'), coverageGaps(fleet));
  expect(rows).toHaveLength(15);
});

function coverageMatrix(
  fleet: ReturnType<typeof fleetCoverage>,
  sample: ReturnType<typeof sampleCoverage>,
  blind: ReturnType<typeof vehicleReport>[],
): string {
  const L: string[] = [];
  L.push('# Israel maintenance coverage matrix (generated)');
  L.push('');
  L.push(
    `Generated by \`npm run test:live -- blindMatrix\` on ${TODAY} from the committed registry`,
  );
  L.push(
    '(`src/discovery/maintenance/registry/israelSources.ts`, ' +
      SOURCE_SYSTEMS.length +
      ' source systems) and the committed',
  );
  L.push(
    'Ministry fleet universe (`docs/maintenance/data/fleet_universe_2026-09-30.json`). Deterministic: same inputs → same numbers.',
  );
  L.push('');
  L.push('## What the numbers measure');
  L.push('');
  L.push(
    '- **Denominator (fleet):** active vehicle records in the Ministry of Transport datasets on data.gov.il, private & commercial vehicles `' +
      fleet.denominator.source[0]?.resource +
      '` (' +
      fleet.denominator.cars.toLocaleString('en') +
      ') plus two-wheelers (' +
      fleet.denominator.motorcycles.toLocaleString('en') +
      ') = **' +
      fleet.denominator.vehicles.toLocaleString('en') +
      '**. Counted per manufacturer (`tozeret_nm`); no plate or VIN kept.',
  );
  L.push(
    '- **Fleet figures are CEILINGS.** The registry decides per manufacturer whether AutoKeep may automatically obtain official documents at all; per-model availability, applicability and extraction are only known by running the pipeline, so the true coverage is at most the ceiling.',
  );
  L.push(
    '- **Sample figures are exact** pipeline outcomes on the committed blind set (12 vehicles). A sample result is NOT Israeli fleet coverage.',
  );
  L.push('');
  L.push('| Metric | Definition | Fleet (ceiling) | Blind sample (exact) |');
  L.push('| --- | --- | --- | --- |');
  L.push(
    `| DOCUMENT COVERAGE | AutoKeep may and does automatically obtain an official maintenance-bearing document (approved system, discovery + fetch + extraction ALLOWED) | ${f(fleet.documentCeiling)} | ${f(sample.document)} |`,
  );
  L.push(
    `| MAINTENANCE-SCHEDULE COVERAGE | ≥ 1 maintenance item scheduled at evidence level A or B | ≤ document ceiling: ${f(fleet.scheduleCeiling)} | ${f(sample.schedule)} |`,
  );
  L.push(
    `| EXACT-APPLICABILITY COVERAGE | a retrieved document is proven for the exact vehicle (model + model years stated by the source) | not computable at fleet level | ${f(sample.exactApplicability)} |`,
  );
  L.push(
    `| ISRAEL-AUTHORITY COVERAGE | Israeli importer/manufacturer evidence (fleet: automatable approved Israeli system; sample: ≥ 1 item at level A) | ${f(fleet.israelAuthorityCeiling)} | ${f(sample.israelAuthority)} |`,
  );
  L.push('');
  L.push('Context (fleet):');
  L.push('');
  L.push(
    `- An approved Israeli importer system that publishes documents exists but is blocked by access policy alone (UNKNOWN / REQUIRES_PERMISSION / NOT_ALLOWED): ${f(fleet.israeliSourceBlockedByPolicy)}.`,
  );
  L.push(
    `- No source system known for the manufacturer (incl. unmapped makes): ${f(fleet.noSourceSystem)}; unmapped Ministry makes: ${f(fleet.unmappedVehicles)}.`,
  );
  L.push(
    '- Vehicles by deciding failure code: ' +
      Object.entries(fleet.byFailure)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${k} ${n.toLocaleString('en')}`)
        .join(', ') +
      '.',
  );
  L.push('');
  L.push('## Blind sample B1–B12');
  L.push('');
  L.push(
    '| # | Vehicle | Source-system candidates | Document | Exact applicability | Extracted | Usable schedule | Israeli authority | User action | Failure codes |',
  );
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const b of blind) {
    const v = b.identity;
    L.push(
      `| ${b.id} | ${v.make} ${v.model} ${v.modelYear} | ${b.candidates.map((c) => `${c.id} (${c.status})`).join(', ') || '—'} | ${b.documents.length ? b.documents.map((d) => d.system).join(', ') : 'none'} | ${b.exactApplicability ? 'yes' : 'no'} | ${b.extracted} | ${b.usableSchedule ? 'yes' : 'no'} | ${b.israeliAuthority ? 'yes' : 'no'} | ${
        b.userIntervention
          ? b.userFallback.length
            ? b.userFallback.map((u) => `${u.reason}`).join(', ') + ' + upload'
            : b.candidates.length
              ? 'source identified, under review + upload'
              : 'upload'
          : 'none'
      } | ${b.failureCodes.join(', ') || '—'} |`,
    );
  }
  L.push('');
  L.push('## Manufacturers by fleet size (top 40)');
  L.push('');
  L.push(
    '| Manufacturer | Vehicles | Share | Systems (status / deciding blocker) | Document ceiling | Deciding failure |',
  );
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const m of fleet.manufacturers.slice(0, 40)) {
    L.push(
      `| ${m.manufacturer} | ${m.vehicles.toLocaleString('en')} | ${((100 * m.vehicles) / fleet.denominator.vehicles).toFixed(2)}% | ${m.systems.map((s) => `${s.id} (${s.status}; ${s.blocker ?? 'automatable'})`).join('<br>') || '—'} | ${m.documentCeiling ? 'yes' : 'no'} | ${m.failure ?? '—'} |`,
    );
  }
  return `${L.join('\n')}\n`;
}

function coverageGaps(fleet: ReturnType<typeof fleetCoverage>): string {
  const L: string[] = [];
  const share = (n: number) => `${((100 * n) / fleet.denominator.vehicles).toFixed(1)}%`;
  L.push('# Coverage gaps (generated)');
  L.push('');
  L.push(
    `Generated with ISRAEL_COVERAGE_MATRIX.md (${TODAY}). Gaps are ranked by the fleet share they block; each`,
  );
  L.push('names the deciding standard failure code and what would change it. Nothing here is a');
  L.push('guess: blockers come from the registry evidence (docs/maintenance/data/research/).');
  L.push('');
  L.push('## By failure code');
  L.push('');
  L.push('| Failure code | Vehicles | Share | What would change it |');
  L.push('| --- | --- | --- | --- |');
  const change: Record<string, string> = {
    PERMISSION_REQUIRED:
      'written permission from the rights holder (importer/manufacturer), or owner approval of a proposed system as an authority',
    POLICY_UNKNOWN:
      'a reviewable terms-of-use decision (terms unreadable or silent) — an owner/legal decision, never a guess',
    TERMS_OR_RIGHTS_BLOCK: 'written permission (the terms or robots.txt prohibit automated access)',
    AUTH_REQUIRED:
      'an access agreement with the importer (documents behind a login), or the user supplies the document',
    SOURCE_UNAVAILABLE:
      'the source exposes no readable document listing (JS app / form); user upload',
    NO_DIGITAL_SOURCE:
      'no official digital source known — user upload of the vehicle’s own booklet',
  };
  for (const [k, n] of Object.entries(fleet.byFailure).sort((a, b) => b[1] - a[1])) {
    L.push(`| ${k} | ${n.toLocaleString('en')} | ${share(n)} | ${change[k] ?? '—'} |`);
  }
  L.push('');
  L.push('## Largest manufacturer gaps');
  L.push('');
  L.push(
    '| Manufacturer | Vehicles | Share | Deciding failure | Israeli system(s) | Global system(s) |',
  );
  L.push('| --- | --- | --- | --- | --- | --- |');
  for (const m of fleet.manufacturers.filter((x) => !x.documentCeiling).slice(0, 30)) {
    const il =
      m.systems
        .filter((s) => s.israeli)
        .map((s) => `${s.id} (${s.blocker})`)
        .join('<br>') || '—';
    const gl =
      m.systems
        .filter((s) => !s.israeli)
        .map((s) => `${s.id} (${s.blocker})`)
        .join('<br>') || '—';
    L.push(
      `| ${m.manufacturer} | ${m.vehicles.toLocaleString('en')} | ${share(m.vehicles)} | ${m.failure} | ${il} | ${gl} |`,
    );
  }
  return `${L.join('\n')}\n`;
}
