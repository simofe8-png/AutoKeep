import type { OfficialDomainEntry } from '../authority';
import { LIMITS, OfficialSiteDiscoveryProvider, robotsAllows } from '../officialSiteDiscovery';
import { MANUFACTURER_ALIASES } from '../registry';
import type { VehicleIdentityQuery } from '../types';

// TEST FIXTURE — not a real verified domain.
const REGISTRY: OfficialDomainEntry[] = [
  {
    manufacturer: 'toyota',
    kind: 'official_importer',
    domain: 'importer.example',
    market: 'IL',
    verifiedBy: 'fixture',
    verifiedAt: '2026-09-26',
  },
];
const corolla: VehicleIdentityQuery = {
  type: 'car',
  manufacturer: 'טויוטה',
  model: 'Corolla',
  year: 2020,
  market: 'IL',
};

function site(pages: Record<string, string>) {
  const fetched: string[] = [];
  const get = async (url: string) => {
    fetched.push(url);
    return url in pages ? { ok: true, text: pages[url] } : { ok: false, text: '' };
  };
  return { get, fetched };
}

describe('zero-cost official-site discovery (G3)', () => {
  it('reads robots-declared sitemaps (incl. indexes) and proposes manual PDFs on the official domain', async () => {
    const s = site({
      'https://importer.example/robots.txt':
        'User-agent: *\nDisallow: /private/\nSitemap: https://importer.example/sitemap-index.xml',
      'https://importer.example/sitemap-index.xml':
        '<sitemapindex><sitemap><loc>https://importer.example/sm-docs.xml</loc></sitemap></sitemapindex>',
      'https://importer.example/sm-docs.xml': `<urlset>
        <url><loc>https://importer.example/docs/corolla-2019-owner-manual.pdf</loc></url>
        <url><loc>https://importer.example/private/corolla-draft.pdf</loc></url>
        <url><loc>https://importer.example/docs/price-list.pdf</loc></url>
        <url><loc>https://other.example/corolla-manual.pdf</loc></url>
        <url><loc>https://importer.example/docs/yaris-maintenance.pdf</loc></url>
      </urlset>`,
    });
    const p = new OfficialSiteDiscoveryProvider(REGISTRY, MANUFACTURER_ALIASES, s.get);
    const urls = (await p.search(corolla)).map((c) => c.url);
    expect(urls).toEqual([
      'https://importer.example/docs/corolla-2019-owner-manual.pdf',
      // Manual-like documents are candidates too; applicability decides later.
      'https://importer.example/docs/yaris-maintenance.pdf',
    ]);
    // robots Disallow respected; other hosts never proposed; unrelated PDFs ignored.
    expect(urls.some((u) => u.includes('/private/'))).toBe(false);
    expect(urls.some((u) => u.includes('other.example'))).toBe(false);
  });

  it('only crawls verified domains of THIS manufacturer; none → nothing fetched', async () => {
    const s = site({});
    const p = new OfficialSiteDiscoveryProvider(REGISTRY, MANUFACTURER_ALIASES, s.get);
    expect(await p.search({ ...corolla, manufacturer: 'מאזדה' })).toEqual([]);
    expect(s.fetched).toEqual([]);
  });

  it('is bounded', async () => {
    const many = Array.from(
      { length: 50 },
      (_, i) => `<url><loc>https://importer.example/m/corolla-${i}-manual.pdf</loc></url>`,
    ).join('');
    const s = site({ 'https://importer.example/sitemap.xml': `<urlset>${many}</urlset>` });
    const p = new OfficialSiteDiscoveryProvider(REGISTRY, MANUFACTURER_ALIASES, s.get);
    expect((await p.search(corolla)).length).toBe(LIMITS.candidates);
  });

  it('robots rules: longest match wins, other agents ignored', () => {
    const r =
      'User-agent: badbot\nDisallow: /\n\nUser-agent: *\nDisallow: /docs/\nAllow: /docs/public/';
    expect(robotsAllows(r, '/docs/secret.pdf')).toBe(false);
    expect(robotsAllows(r, '/docs/public/manual.pdf')).toBe(true);
    expect(robotsAllows(r, '/other.pdf')).toBe(true);
  });

  it('robots wildcards (RFC 9309): "Disallow: /*.pdf$" blocks every PDF, not other paths', () => {
    // Real-world shape seen on an importer site during candidate research (2026-09-26).
    const r = 'User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp*/x';
    expect(robotsAllows(r, '/manuals/octavia.pdf')).toBe(false);
    expect(robotsAllows(r, '/manuals/octavia.pdf.html')).toBe(true);
    expect(robotsAllows(r, '/tmp-1/x')).toBe(false);
    expect(robotsAllows(r, '/a.b/c')).toBe(true);
  });
});
