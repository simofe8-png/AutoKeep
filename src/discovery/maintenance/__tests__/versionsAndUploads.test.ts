import { createHash } from 'crypto';

import { admitToCatalog, type IsoDate, type KnowledgeEntry } from '@/domain';

import { documentKeyOf, recordDocumentVersion, type DocumentVersion } from '../documentVersions';
import { htmlTextReader } from '../htmlText';
import { runMaintenancePipeline } from '../pipeline';
import { fixtureSystem } from '../registry/testing';
import { RegistryDiscovery, UploadDiscovery } from '../sources';
import type { Http, HttpResponse, SourceDiscovery, VehicleIdentity } from '../types';

/** M-SOURCE Steps 8 (document versions) and 10 (private uploads) — SYNTHETIC fixtures only. */
const TODAY = '2026-09-30' as IsoDate;
const enc = (s: string) => new TextEncoder().encode(s);
const sha256 = async (b: Uint8Array) => createHash('sha256').update(b).digest('hex');

const doc = (every: number, years = ' — model year 2020–2022') => `<html><body>
<h1>Synthmoto SX 125 Owner's Manual${years}</h1><p>For Europe.</p>
<h2>Periodic maintenance schedule</h2>
<table>
<tr><th>Item</th><th>km x 1000</th><th>${every}</th><th>${every * 2}</th><th>${every * 3}</th><th>${every * 4}</th></tr>
<tr><td>Engine oil</td><td></td><td>R</td><td>R</td><td>R</td><td>R</td></tr>
</table></body></html>`;

const vehicle: VehicleIdentity = {
  kind: 'motorcycle',
  make: 'Synthmoto',
  model: 'SX 125',
  modelYear: 2021,
  displacementCc: 125,
  powertrain: 'petrol',
  market: 'IL',
};

function site(body: string) {
  const calls: string[] = [];
  const pages: Record<string, string> = {
    'https://synthetic.example/robots.txt': '',
    'https://synthetic.example/manuals': '<a href="/docs/sx125.html">SX 125 owner\'s manual</a>',
    'https://synthetic.example/docs/sx125.html': body,
  };
  const http: Http = async (url) => {
    calls.push(url);
    const b = pages[url];
    const r: HttpResponse =
      b != null
        ? {
            ok: true,
            status: 200,
            url,
            contentType: url.endsWith('.txt') ? 'text/plain' : 'text/html',
            bytes: enc(b),
          }
        : { ok: false, status: 404, url, contentType: 'text/plain', bytes: enc('') };
    return r;
  };
  return { http, calls };
}

const deps = (
  http: Http,
  catalog: KnowledgeEntry[],
  versions: DocumentVersion[] = [],
  adapters: SourceDiscovery[] = [new RegistryDiscovery()],
) => ({
  http,
  registry: [fixtureSystem()],
  aliases: {},
  robots: new Map<string, string | null>(),
  sha256,
  readers: { pdf: htmlTextReader, html: htmlTextReader },
  adapters,
  catalog,
  today: TODAY,
  versions,
});

describe('Step 8 — document identity, fingerprint and versions', () => {
  it('versions are append-only per document; an identical hash is the same version', () => {
    const a = recordDocumentVersion([], {
      sourceSystemId: 's',
      url: 'https://x.example/m.pdf#p2',
      sha256: '1',
      at: TODAY,
    });
    expect(a).toMatchObject({ status: 'first', current: { version: 1 } });
    const b = recordDocumentVersion(a.store, {
      sourceSystemId: 's',
      url: 'https://x.example/m.pdf',
      sha256: '1',
      at: TODAY,
    });
    expect(b.status).toBe('unchanged');
    const c = recordDocumentVersion(b.store, {
      sourceSystemId: 's',
      url: 'https://x.example/m.pdf',
      sha256: '2',
      at: TODAY,
    });
    expect(c).toMatchObject({ status: 'new_version', current: { version: 2 } });
    expect(c.store.map((v) => v.sha256)).toEqual(['1', '2']);
    expect(documentKeyOf('s', 'https://x.example/m.pdf#frag')).toBe(
      documentKeyOf('s', 'https://x.example/m.pdf'),
    );
  });

  it('an unchanged document already turned into knowledge is not extracted again', async () => {
    // No model years stated → level C knowledge: the next run still researches, finds the SAME
    // bytes and reuses them instead of re-extracting.
    const first = await runMaintenancePipeline(vehicle, deps(site(doc(10, '')).http, []));
    expect(first.trace.documents[0]).toMatchObject({ versionStatus: 'first', version: 1 });
    expect(first.trace.documents[0].extracted).toBeGreaterThan(0);
    const catalog = admitToCatalog([], first.catalogCandidates, TODAY).entries;
    const again = await runMaintenancePipeline(
      vehicle,
      deps(site(doc(10, '')).http, catalog, first.versions),
    );
    expect(again.trace.documents[0]).toMatchObject({
      versionStatus: 'unchanged',
      version: 1,
      reused: true,
      extracted: 0,
    });
    expect(again.trace.requirements.map((r) => r.id)).toEqual(
      first.trace.requirements.map((r) => r.id),
    );
  });

  it('a changed document is a new version; earlier verified evidence is kept, not overwritten', async () => {
    const v1 = await runMaintenancePipeline(vehicle, deps(site(doc(10, '')).http, []));
    const cat1 = admitToCatalog([], v1.catalogCandidates, TODAY).entries;
    const v2 = await runMaintenancePipeline(
      vehicle,
      deps(site(doc(12, '')).http, cat1, v1.versions),
    );
    expect(v2.trace.documents[0]).toMatchObject({ versionStatus: 'new_version', version: 2 });
    expect(v2.trace.documents[0].extracted).toBeGreaterThan(0);
    const cat2 = admitToCatalog(cat1, v2.catalogCandidates, TODAY);
    const old = cat2.entries.find((e) => e.id === cat1[0].id)!;
    expect(old.supersededBy).not.toBeNull();
    // Provenance of the old requirement is intact: its own bytes, page and row.
    expect(old.source.sha256).toBe(v1.trace.documents[0].sha256);
    expect(old.requirement.evidence[0]).toMatchObject({
      documentSha256: v1.trace.documents[0].sha256,
      page: 2,
    });
    expect(old.requirement.interval.every).toEqual({ value: 10000, unit: 'km' });
  });

  it('provenance explains why a requirement exists: source, bytes, page, row, extractor, date', async () => {
    const r = await runMaintenancePipeline(vehicle, deps(site(doc(10)).http, []));
    const q = r.trace.requirements[0];
    expect(q.evidence[0]).toMatchObject({ documentSha256: r.trace.documents[0].sha256, page: 2 });
    expect(q.evidence[0].locator).toMatch(/Engine oil/);
    expect(q.extraction).toMatchObject({
      method: 'deterministic_parser',
      at: TODAY,
      grounded: true,
    });
    expect(r.catalogCandidates[0].source).toMatchObject({
      url: 'https://synthetic.example/docs/sx125.html',
      sha256: r.trace.documents[0].sha256,
    });
  });
});

describe('Step 10 — private user-uploaded official documents', () => {
  const upload = (body: string) =>
    new UploadDiscovery([{ name: 'my-manual.html', bytes: enc(body) }]);
  const offline: Http = async () => {
    throw new Error('offline');
  };

  it('an upload alone is never authoritative and never shared', async () => {
    const r = await runMaintenancePipeline(vehicle, deps(offline, [], [], [upload(doc(10))]));
    expect(r.trace.documents[0]).toMatchObject({ authority: 'user_upload', sourceSystemId: null });
    expect(r.trace.requirements.every((q) => q.verification === 'candidate')).toBe(true);
    expect(r.resolutions.every((x) => x.status !== 'resolved')).toBe(true);
    expect(r.catalogCandidates).toEqual([]);
    expect(r.versions).toEqual([]); // uploads never enter the shared version store
  });

  it('an upload identical to a known official version inherits that authority — still private', async () => {
    const official = await runMaintenancePipeline(vehicle, deps(site(doc(10)).http, []));
    const r = await runMaintenancePipeline(
      vehicle,
      deps(offline, [], official.versions, [upload(doc(10))]),
    );
    expect(r.trace.documents[0]).toMatchObject({
      sourceSystemId: 'global-synthmoto',
      officialMatch: official.versions[0].documentKey,
    });
    expect(r.resolutions.find((x) => x.task === 'engine_oil')).toMatchObject({
      status: 'resolved',
      level: 'B',
    });
    expect(r.catalogCandidates).toEqual([]);
    expect(r.versions).toEqual(official.versions);
  });

  it('a different upload does not inherit anything from a known version', async () => {
    const official = await runMaintenancePipeline(vehicle, deps(site(doc(10)).http, []));
    const r = await runMaintenancePipeline(
      vehicle,
      deps(offline, [], official.versions, [upload(doc(11))]),
    );
    expect(r.trace.documents[0]).toMatchObject({ sourceSystemId: null });
    expect(r.trace.requirements.every((q) => q.verification === 'candidate')).toBe(true);
  });

  it('official sources are read before the user upload (upload is the fallback)', async () => {
    const { http } = site(doc(10));
    const r = await runMaintenancePipeline(
      vehicle,
      deps(http, [], [], [upload(doc(11)), new RegistryDiscovery()]),
    );
    expect(r.trace.documents.map((d) => d.authority)).toEqual(['manufacturer', 'user_upload']);
  });
});
