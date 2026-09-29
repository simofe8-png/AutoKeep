#!/usr/bin/env node
// Builds src/discovery/maintenance/registry/israelSources.ts from the committed research records
// (docs/maintenance/data/research/R*.json), applying the M-SOURCE evidence rules mechanically:
//
//   node tools/build-source-registry.mjs docs/maintenance/data/research src/discovery/maintenance/registry/israelSources.ts
//
//  - ALLOWED is kept ONLY with explicit permission evidence (a recorded owner decision); robots.txt,
//    ai.txt or "no clause found" become UNKNOWN (the evidence text is preserved in the note);
//  - NOT_ALLOWED / REQUIRES_PERMISSION keep their evidence (terms / robots / access control);
//  - authority status: 'approved' only for hosts the owner approved in P1 (2026-09-27), else 'proposed'.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const R = process.argv[2];
const OUT = process.argv[3];
const TODAY = '2026-09-30';
const DIMS = [
  'discoveryAllowed',
  'automatedFetchAllowed',
  'automatedExtractionAllowed',
  'documentCachingAllowed',
  'structuredFactsStorageAllowed',
  'documentRedistributionAllowed',
];
const TECH = ['discoveryAllowed', 'automatedFetchAllowed'];

// P1 decision §8.2 approved authority domains, + sym-global.com (P1 §8.6 SYM pilot).
const APPROVED = [
  'toyota.co.il',
  'mazda.co.il',
  'hyundaimotors.co.il',
  'colmobil.co.il',
  'kia-israel.co.il',
  'skoda.co.il',
  'vw.co.il',
  'vwcv.co.il',
  'championmotors.co.il',
  'champ.co.il',
  'suzuki.co.il',
  'oferavnir.co.il',
  'honda.co.il',
  'hondacars.co.il',
  'mct.co.il',
  'hondabike.co.il',
  'yamaha-motor.co.il',
  'metro.co.il',
  'kawasaki.co.il',
  'sanyang.co.il',
  'sym-global.com',
];

const BRAND = [
  [/^toyota/i, 'toyota'],
  [/^lexus/i, 'lexus'],
  [/^hyundai/i, 'hyundai'],
  [/^genesis/i, 'genesis'],
  [/^mitsubishi/i, 'mitsubishi'],
  [/^mercedes/i, 'mercedes-benz'],
  [/^smart/i, 'smart'],
  [/^kia/i, 'kia'],
  [/^mazda/i, 'mazda'],
  [/^ford/i, 'ford'],
  [/^nio/i, 'nio'],
  [/^volkswagen/i, 'volkswagen'],
  [/^(škoda|skoda)/i, 'skoda'],
  [/^seat/i, 'seat'],
  [/^cupra/i, 'cupra'],
  [/^audi/i, 'audi'],
  [/^geely/i, 'geely'],
  [/^mg/i, 'mg'],
  [/^byd/i, 'byd'],
  [/^chery/i, 'chery'],
  [/^jaecoo/i, 'jaecoo'],
  [/^omoda/i, 'omoda'],
  [/^ora/i, 'ora'],
  [/^yamaha/i, 'yamaha'],
  [/^sym/i, 'sym'],
  [/^kawasaki/i, 'kawasaki'],
  [/^honda/i, 'honda'],
  [/^kymco/i, 'kymco'],
  [/^piaggio/i, 'piaggio'],
  [/^vespa/i, 'vespa'],
  [/^suzuki/i, 'suzuki'],
  [/^cfmoto/i, 'cfmoto'],
  [/^aprilia/i, 'aprilia'],
  [/^moto guzzi/i, 'moto-guzzi'],
  [/^husqvarna/i, 'husqvarna'],
  [/^gasgas/i, 'gasgas'],
  [/^bmw/i, 'bmw'],
  [/^mini/i, 'mini'],
  [/^ktm/i, 'ktm'],
  [/^harley/i, 'harley-davidson'],
  [/^zontes/i, 'zontes'],
  [/^voge/i, 'voge'],
  [/^renault/i, 'renault'],
  [/^dacia/i, 'dacia'],
  [/^nissan/i, 'nissan'],
  [/^infiniti/i, 'infiniti'],
  [/^volvo/i, 'volvo'],
  [/^polestar/i, 'polestar'],
  [/^peugeot/i, 'peugeot'],
  [/^citro/i, 'citroen'],
  [/^ds/i, 'ds'],
  [/^opel/i, 'opel'],
  [/^chevrolet/i, 'chevrolet'],
  [/^cadillac/i, 'cadillac'],
  [/^subaru/i, 'subaru'],
  [/^daihatsu/i, 'daihatsu'],
  [/^fiat/i, 'fiat'],
  [/^jeep/i, 'jeep'],
  [/^alfa/i, 'alfa-romeo'],
  [/^abarth/i, 'abarth'],
  [/^tesla/i, 'tesla'],
  [/^isuzu/i, 'isuzu'],
  [/^ssangyong|^kgm/i, 'kgm'],
  [/^xpeng/i, 'xpeng'],
  [/^zeekr/i, 'zeekr'],
  [/^lynk/i, 'lynk-co'],
  [/^leapmotor/i, 'leapmotor'],
  [/^land rover/i, 'land-rover'],
  [/^jaguar/i, 'jaguar'],
  [/^porsche/i, 'porsche'],
  [/^maxus/i, 'maxus'],
  [/^jac/i, 'jac'],
  [/^dongfeng/i, 'dongfeng'],
];
const brandKey = (b) => {
  const s = String(b).trim();
  for (const [re, k] of BRAND) if (re.test(s)) return k;
  return null;
};

// Shared third-party CDNs / platforms: never an authority host (P1 §8.3), and shared by many
// systems, so they would misattribute authority.
const SHARED =
  /(^|\.)(cloudinary\.com|azureedge\.net|sharepoint\.com|microsoftonline\.com|amazonaws\.com|cloudfront\.net|flippingbook\.com|calameo\.com|builder\.io)$/;
const hostOf = (d) => {
  const s = typeof d === 'string' ? d : d.domain || d.host || d.url || '';
  try {
    return new URL(/^https?:/.test(s) ? s : `https://${s}`).hostname
      .replace(/^www\./, '')
      .toLowerCase();
  } catch {
    return null;
  }
};

const CATS = [
  [
    /maintenance.?schedule|service.?(plan|routine)|תוכנית טיפול|maintenance_schedule/i,
    'maintenance_schedule',
  ],
  [/service.?booklet|warranty.?(and|&)?.?service|service.?book/i, 'service_booklet'],
  [/warranty/i, 'warranty_booklet'],
  [/owner|car.?book|driver|manual summar|ספר/i, 'owner_manual'],
  [/web manual|html manual|structured/i, 'structured_web_manual'],
  [/quick/i, 'quick_guide'],
  [/price/i, 'service_price_list'],
];
const cats = (list) => {
  const out = new Set();
  for (const c of list || []) {
    const s = typeof c === 'string' ? c : JSON.stringify(c);
    for (const [re, k] of CATS)
      if (re.test(s)) {
        out.add(k);
        break;
      }
  }
  return [...out];
};

const mechanismOf = (disc) => {
  const s = JSON.stringify(disc || '').toLowerCase();
  if (/login|sign-in|sharepoint|microsoftonline|oauth/.test(s)) return 'login';
  if (/public json|json api|\/api\/|json endpoint|embedded json|embeds json|next\.js/.test(s))
    return 'public_json_api';
  if (/e-mail form|email form|form submission|personal-data form|\bform\b/.test(s)) return 'form';
  if (/javascript|js-only|js app|spa|widget|click-through/.test(s)) return 'javascript_app';
  if (/sitemap/.test(s)) return 'sitemap';
  if (/static|<option|href|links/.test(s)) return 'static_links';
  if (/none|no manuals|nothing published|not published/.test(s)) return 'none';
  return 'javascript_app';
};

const text = (x) => (typeof x === 'string' ? x : x == null ? '' : JSON.stringify(x));
const clip = (s, n = 38) => {
  const w = String(s).replace(/\s+/g, ' ').trim().split(' ');
  return w.length > n ? `${w.slice(0, n).join(' ')} …` : w.join(' ');
};

function evidenceKind(ev) {
  const s = ev.toLowerCase();
  if (
    /sharepoint|microsoftonline|login|sign-in|incapsula|captcha|bot protection|akamai|403|cloudflare|click-through|form/.test(
      s,
    ) &&
    !/terms|§|clause|תנאי/.test(s)
  )
    return 'access_control';
  if (/robots/.test(s) && !/terms|§|clause|תנאי|legal|notice|licen/.test(s)) return 'robots';
  if (/licen/.test(s)) return 'licence';
  return 'terms';
}

// A restricted (D) system's mechanism comes from what blocks it: publishes nothing → none; the
// fetch evidence names a login (e.g. SharePoint sign-in) → login; otherwise the discovery text.
function restrictedMechanism(s, sourceType, docCats, discText) {
  if (sourceType !== 'D_RESTRICTED_OR_UNAVAILABLE') return mechanismOf(s.discovery);
  const fetchEv = text(s.accessPolicy?.automatedFetchAllowed);
  const catText = text(s.documentCategories || s.documentCategoriesPresent);
  if (/sharepoint|microsoftonline|sign-in|login/i.test(fetchEv)) return 'login';
  if (/request|לפנות אלינו|e-mail\/phone|by e-?mail/i.test(catText)) return 'form';
  const publishesDocs =
    /manual|booklet|schedule|ספר רכב|car ?book|guide/i.test(catText) &&
    !/none published/i.test(catText);
  if (
    !docCats.length ||
    !publishesDocs ||
    /no manuals|nothing published|not published|publishes no|no documents/i.test(discText)
  ) {
    return 'none';
  }
  if (/imperva|incapsula|challenge/i.test(discText)) return 'javascript_app';
  return mechanismOf(s.discovery);
}

function convert(s, sink, file) {
  const id = String(s.sourceSystemId).replace(/^mfr-/, 'global-');
  const israeli = id.startsWith('il-');
  const brands = s.brandsCovered || s.brands || [];
  const manufacturers = [...new Set(brands.map(brandKey).filter(Boolean))];
  const domainsRaw = s.officialDomains || s.domains || [];
  const hosts = [
    ...new Set((Array.isArray(domainsRaw) ? domainsRaw : [domainsRaw]).map(hostOf).filter(Boolean)),
  ].filter((h) => !SHARED.test(h));
  if (!hosts.length) {
    console.log('DROPPED (no own domain)', id);
    return;
  }
  const urls = (s.policyEvidenceUrls || []).map(String);
  const termsUrl =
    urls.find((u) => /term|legal|licen|תקנון|policy|notice|copyright|imprint/i.test(u)) || urls[0];
  const robotsUrl =
    urls.find((u) => /robots/i.test(u)) ||
    (hosts[0] ? `https://${hosts[0]}/robots.txt` : undefined);
  const evidence = [];
  const dimensions = {};
  const notes = [];
  const sym = id === 'global-sym-global';
  if (sym) {
    evidence.push({
      id: 'owner-p1',
      kind: 'owner_decision',
      quote:
        'P1 decision 2026-09-27 §8.4 (robots allow + no known restricting terms) and §8.6 (SYM verification pilot approved)',
      reviewedAt: '2026-09-27',
      reviewedBy: 'project owner',
    });
  }
  for (const d of DIMS) {
    const raw = s.accessPolicy?.[d];
    let value = (raw && (raw.value || raw.status)) || raw || 'UNKNOWN';
    const ev = text(raw && (raw.evidence || raw.quote || raw.basis || raw.note)) || '';
    let basis = [];
    let note;
    if (sym && d !== 'documentCachingAllowed' && d !== 'documentRedistributionAllowed') {
      // P1 §8.4–8.6: automated retrieval, reading and storing structured facts are an explicit
      // owner decision for the SYM pilot (robots allow; no known restricting terms).
      value = 'ALLOWED';
    }
    if (value === 'ALLOWED') {
      if (sym && d !== 'documentCachingAllowed' && d !== 'documentRedistributionAllowed') {
        basis = ['owner-p1'];
        note = `owner decision; research: ${clip(ev, 25)}`;
      } else {
        value = 'UNKNOWN';
        note = `not explicit permission (${clip(ev, 30)})`;
      }
    } else if (value === 'NOT_ALLOWED' || value === 'REQUIRES_PERMISSION') {
      let kind = evidenceKind(ev);
      if (value === 'REQUIRES_PERMISSION' && kind !== 'terms' && kind !== 'licence') kind = 'terms';
      if (!TECH.includes(d) && (kind === 'robots' || kind === 'access_control')) {
        // A technical signal cannot decide a legal dimension.
        value = 'UNKNOWN';
        note = `technical signal only (${clip(ev, 25)})`;
      } else {
        const url =
          kind === 'robots' ? robotsUrl : kind === 'access_control' ? undefined : termsUrl;
        if ((kind === 'terms' || kind === 'licence' || kind === 'robots') && !url) {
          value = 'UNKNOWN';
          note = `evidence without a reviewable URL (${clip(ev, 25)})`;
        } else {
          const eid = `${d.replace('Allowed', '')}`;
          evidence.push({
            id: eid,
            kind,
            ...(url ? { url } : {}),
            quote: clip(ev || `${value} per ${kind}`),
            reviewedAt: TODAY,
            reviewedBy: 'research agent (M-SOURCE)',
          });
          basis = [eid];
        }
      }
    } else {
      value = 'UNKNOWN';
      if (ev) note = clip(ev, 30);
    }
    dimensions[d] = { value, basis, ...(note ? { note } : {}) };
  }
  if (!manufacturers.length) notes.push(`no manufacturer key for brands ${JSON.stringify(brands)}`);
  const status = hosts.some((h) => APPROVED.includes(h)) ? 'approved' : 'proposed';
  const appl = text(
    s.applicabilityResolution || s.exactApplicabilityResolvable || s.vehicleApplicabilityResolvable,
  ).toLowerCase();
  const applicabilityResolution = /^(yes|automatic)|model and year|deterministic/.test(appl)
    ? 'automatic'
    : /partial|range|year label|model only|free-text/.test(appl)
      ? 'partial'
      : /^no|not|none/.test(appl)
        ? 'none'
        : 'unknown';
  const docCats = cats(s.documentCategories || s.documentCategoriesPresent);
  const sourceType = s.sourceType;
  const pages = [];
  const discText = text(s.discovery);
  for (const m of discText.matchAll(/https:\/\/[^\s"'\\<>)]+/g)) {
    const u = m[0].replace(/[.,;]+$/, '');
    const h = hostOf(u);
    if (
      h &&
      hosts.some((x) => h === x || h.endsWith(`.${x}`)) &&
      !/api|admin-ajax|\.pdf|download|\{|%7B/i.test(u)
    )
      pages.push(u);
  }
  sink.push({
    sourceSystemId: id,
    manufacturers,
    // The two-wheeler research (R4) covers motorcycle/scooter systems; the others are car systems.
    vehicleKinds: [file.startsWith('R4') ? 'motorcycle' : 'car'],
    ...(israeli ? { importer: s.importerLegalName || s.legalName || 'UNVERIFIED' } : {}),
    market: israeli ? 'IL' : 'GLOBAL',
    region: israeli ? 'Israel' : 'global',
    origin: israeli ? 'israeli' : 'global',
    domains: hosts.map((h) => ({ host: h, role: 'site' })),
    sourceType,
    authorityClass: israeli ? 'importer' : 'manufacturer_library',
    discovery: {
      mechanism: restrictedMechanism(s, sourceType, docCats, discText),
      entryPoints: [],
    },
    officialPages: [...new Set(pages)].slice(0, 3),
    documentCategories:
      sourceType === 'D_RESTRICTED_OR_UNAVAILABLE'
        ? docCats
        : docCats.length
          ? docCats
          : ['owner_manual'],
    policy: { versions: [{ version: 1, reviewedAt: TODAY, dimensions, evidence }] },
    status,
    authorityEvidence: clip(text(s.ownershipEvidence), 60),
    limitations: []
      .concat(s.limitations || [])
      .map((l) => clip(text(l), 40))
      .slice(0, 6),
    ...(s.notes ? { notes: clip(text(s.notes), 60) } : {}),
    applicabilityResolution,
    _conversionNotes: notes,
  });
}

const sink = [];
for (const f of [
  'R1_toyota_colmobil_kia',
  'R2_delek_champion_chinese',
  'R3_carasso_european_japanese',
  'R4_two_wheelers',
]) {
  const p = join(R, `${f}.json`);
  if (!existsSync(p)) {
    console.error(`missing ${f}`);
    continue;
  }
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const a = Array.isArray(j)
    ? j
    : j.sourceSystems || j.systems || Object.values(j).find(Array.isArray);
  for (const s of a) convert(s, sink, f);
}
// Entry points: the SYM manufacturer library is walked from its sitemap (the one system whose
// policy permits automation); every other publishing system gets its first official listing page
// as a listing entry point — the policy gate blocks it before any request and offers it to the
// user instead. Restricted systems (D) have none (restricted adapter).
for (const s of sink) {
  if (s.sourceSystemId === 'global-sym-global') {
    s.adapterId = 'listing';
    s.discovery.entryPoints = [
      {
        kind: 'listing',
        url: 'https://www.sym-global.com/sitemap.xml',
        follow: '^https://www[.]sym-global[.]com/[a-z0-9-]+/?([?].*)?$',
        depth: 1,
      },
    ];
  } else if (s.sourceType !== 'D_RESTRICTED_OR_UNAVAILABLE') {
    const page = s.officialPages.find((u) => !/\.(xml|gz)(\?|$)/i.test(u));
    if (page) s.discovery.entryPoints = [{ kind: 'listing', url: page }];
  }
  s.officialPages = s.officialPages.filter((u) => !/\.(xml|gz)(\?|$)/i.test(u));
  if (!s.officialPages.length) delete s.officialPages;
}
const notes = sink.flatMap((s) => s._conversionNotes.map((n) => `${s.sourceSystemId}: ${n}`));
for (const s of sink) delete s._conversionNotes;
const data = JSON.stringify(sink, null, 2).replace(
  /"(reviewedAt|lastCheckedAt)": "(\d{4}-\d\d-\d\d)"/g,
  '"$1": d("$2")',
);
const body = `import type { IsoDate } from '@/domain';

import type { SourceSystem } from './sourceSystem';

const d = (s: string) => s as IsoDate;

/**
 * Israeli Maintenance Source Registry (M-SOURCE) — GENERATED by tools/build-source-registry.mjs
 * from docs/maintenance/data/research/*.json (research of ${TODAY}). Do not edit by hand: fix the
 * research record and regenerate. See docs/maintenance/ISRAEL_SOURCE_REGISTRY.md.
 */
export const SOURCE_SYSTEMS: readonly SourceSystem[] = ${data};
`;
writeFileSync(OUT, body);

// Human-readable table of the same data (docs/maintenance/ISRAEL_SOURCE_REGISTRY_TABLE.md).
const ab = { ALLOWED: 'ALLOWED', NOT_ALLOWED: 'NOT', UNKNOWN: 'unk', REQUIRES_PERMISSION: 'PERM' };
const rows = sink.map((x) => {
  const dm = x.policy.versions[0].dimensions;
  return `| ${x.sourceSystemId} | ${x.origin === 'israeli' ? 'IL' : 'global'} | ${x.vehicleKinds.join(',')} | ${x.manufacturers.join(', ')} | ${x.importer ?? '—'} | ${x.domains.map((d) => d.host).join('<br>')} | ${x.sourceType.slice(0, 1)} | ${x.discovery.mechanism} | ${x.status} | ${DIMS.map((d) => ab[dm[d].value]).join(' / ')} |`;
});
writeFileSync(
  join(process.cwd(), 'docs', 'maintenance', 'ISRAEL_SOURCE_REGISTRY_TABLE.md'),
  `# Israeli source registry — all systems (generated)

Generated by \`tools/build-source-registry.mjs\` from docs/maintenance/data/research (${TODAY}).
Policy columns: discovery / fetch / extraction / caching / structured facts / redistribution
(ALLOWED, NOT = NOT_ALLOWED, unk = UNKNOWN, PERM = REQUIRES_PERMISSION). Evidence per dimension is in the
registry record (\`src/discovery/maintenance/registry/israelSources.ts\`).

| System | Origin | Kinds | Manufacturers | Importer | Domains | Type | Discovery | Status | Policy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.join('\n')}
`,
);
console.log(sink.length, 'systems');
for (const n of notes) console.log('NOTE', n);
