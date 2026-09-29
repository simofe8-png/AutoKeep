import type { SourceRegistryEntry } from './types';

/**
 * Official maintenance-source registry — DATA, not code. Adding a manufacturer or a model never
 * changes the pipeline; a manufacturer only needs entries here.
 *
 * status
 *  - approved: the owner approved the host as an authority (P1 decision 2026-09-27: the 21
 *    Israeli importer domains; sym-global.com for the SYM pilot).
 *  - proposed: researched 2026-09-29 (docs/sources/MAINTENANCE_SOURCE_RESEARCH_2026-09-29.md),
 *    awaiting the owner's approval. Never an authority in the app until approved.
 * automation / reuse (P1 §8.4–8.5): 'permitted' only when robots AND terms allow it; any known
 * restriction → 'prohibited'; unreadable or uncertain terms → 'unknown' (= no automation).
 * Prohibited hosts are still useful: their entry points become official links the USER can open
 * (personal use), never fetched by AutoKeep.
 */

const P1 = 'P1 decision 2026-09-27 (docs/sources/P1_SOURCE_VERIFICATION.md §1, §3, §8)';
const R = 'Research 2026-09-29 (docs/sources/MAINTENANCE_SOURCE_RESEARCH_2026-09-29.md)';

const il = (
  manufacturers: string[],
  host: string,
  automation: SourceRegistryEntry['automation'],
  note: string,
  entryPoints?: SourceRegistryEntry['entryPoints'],
): SourceRegistryEntry => ({
  manufacturers,
  host,
  role: 'importer',
  markets: ['IL'],
  defaultDocumentMarkets: ['IL'],
  status: 'approved',
  automation,
  reuse: automation === 'permitted' ? 'permitted' : 'prohibited',
  entryPoints,
  evidence: `${P1}; ${note}`,
});

export const SOURCE_REGISTRY: readonly SourceRegistryEntry[] = [
  // ---------- Israeli importers (approved as authorities; automation per their terms) ----------
  il(
    ['toyota'],
    'toyota.co.il',
    'unknown',
    'terms host unreadable (Incapsula); schedules behind a JS selector',
    [{ kind: 'listing', url: 'https://www.toyota.co.il/owners' }],
  ),
  il(
    ['mazda'],
    'mazda.co.il',
    'prohibited',
    'terms forbid copying without Delek Motors written consent',
    [{ kind: 'listing', url: 'https://www.mazda.co.il/service-plans' }],
  ),
  il(['hyundai'], 'hyundaimotors.co.il', 'prohibited', 'terms ban crawlers/robots and copying', [
    { kind: 'listing', url: 'https://www.hyundaimotors.co.il/maintenance/' },
  ]),
  il(['hyundai'], 'colmobil.co.il', 'prohibited', 'Colmobil group; same terms'),
  il(
    ['kia'],
    'kia-israel.co.il',
    'prohibited',
    'terms ban automated retrieval and copying without Talcar permission',
    [{ kind: 'listing', url: 'https://www.kia-israel.co.il/' }],
  ),
  il(['skoda'], 'skoda.co.il', 'prohibited', 'robots Disallow /*.pdf$; terms ban automation'),
  il(
    ['volkswagen', 'seat'],
    'championmotors.co.il',
    'prohibited',
    'Champion Motors (VW group importer); terms ban automation',
  ),
  il(['volkswagen'], 'vw.co.il', 'prohibited', 'Champion Motors; terms ban automation'),
  il(
    ['suzuki'],
    'suzuki.co.il',
    'prohibited',
    'terms explicitly ban robots/crawlers/spiders and copying',
    [{ kind: 'listing', url: 'https://suzuki.co.il/content/ספרי-נהג-סוזוקי' }],
  ),
  il(
    ['honda'],
    'honda.co.il',
    'prohibited',
    'Mayer; terms forbid copying without prior written consent',
  ),
  il(['honda'], 'hondabike.co.il', 'prohibited', 'Mayer (motorcycles); terms forbid copying'),
  il(['yamaha'], 'yamaha-motor.co.il', 'prohibited', 'Metro Motor; personal use only'),
  il(['kawasaki'], 'kawasaki.co.il', 'prohibited', 'Metro Motor; personal use only; Cloudflare'),
  il(['sym'], 'sanyang.co.il', 'prohibited', 'Metro Motor; personal use only'),

  // ---------- Manufacturers ----------
  {
    manufacturers: ['sym'],
    host: 'sym-global.com',
    role: 'manufacturer',
    status: 'approved',
    automation: 'permitted',
    reuse: 'permitted',
    entryPoints: [
      {
        kind: 'listing',
        url: 'https://www.sym-global.com/sitemap.xml',
        follow: '^https://www\\.sym-global\\.com/[a-z0-9-]+/?(\\?.*)?$',
        depth: 1,
      },
    ],
    evidence: `${P1}: manufacturer domain (Sanyang Motor Co.), robots allow all, no terms of use found; SYM pilot approved. ${R}: sitemap → model page → manual PDF.`,
  },
  {
    manufacturers: ['tesla'],
    host: 'tesla.com',
    role: 'manufacturer',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [
      {
        kind: 'template',
        url: 'https://www.tesla.com/ownersmanual/{modelSlug}/en_il/',
        locales: [''],
      },
    ],
    evidence: `${R}: Tesla direct sales in Israel (tesla.com/he_il); all hosts behind Akamai bot filter (403); anti-scrape clause in terms (search index only).`,
  },
  {
    manufacturers: ['kia'],
    host: 'ownersmanual.kia.com',
    role: 'manual_library',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [{ kind: 'listing', url: 'https://ownersmanual.kia.com/' }],
    evidence: `${R}: Kia global owner's-manual portal (JSON API, Israel he_IL); Kia Corporation terms forbid reproduction without written consent.`,
  },
  {
    manufacturers: ['hyundai'],
    host: 'ownersmanual.hyundai.com',
    role: 'manual_library',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [{ kind: 'listing', url: 'https://ownersmanual.hyundai.com/' }],
    evidence: `${R}: Hyundai global owner's-manual portal; HMC terms forbid copying without permission.`,
  },
  {
    manufacturers: ['skoda'],
    host: 'skoda-auto.com',
    role: 'manufacturer',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [{ kind: 'listing', url: 'https://www.skoda-auto.com/apps/manuals' }],
    evidence: `${R}: Škoda manuals app (JSON API; Hebrew editions); copyright notice prohibits duplication without consent.`,
  },
  {
    manufacturers: ['mazda'],
    host: 'owners-manual.mazda.com',
    role: 'manual_library',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    evidence: `${R}: Mazda Motor Corporation e-manual host (EC editions, schedule in chapter 6); mazda.com terms: reproduction without permission strictly prohibited.`,
  },
  {
    manufacturers: ['toyota'],
    host: 'toyota-europe.com',
    role: 'manufacturer',
    status: 'proposed',
    automation: 'unknown',
    reuse: 'unknown',
    entryPoints: [{ kind: 'listing', url: 'https://www.toyota-europe.com/customer/manuals' }],
    evidence: `${R}: TME manual finder (JS app); manuals refer to a separate service booklet; terms unreadable.`,
  },
  {
    manufacturers: ['suzuki'],
    host: 'globalsuzuki.com',
    role: 'manufacturer',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    evidence: `${R}: no car manual library; terms prohibit copying beyond personal use.`,
  },
  {
    manufacturers: ['yamaha'],
    host: 'library.ymcapps.net',
    role: 'manual_library',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [{ kind: 'listing', url: 'https://library.ymcapps.net/library/om/app/' }],
    evidence: `${R}: Yamaha Motor Co. owner's-manual library (ownership evidence: © line, API on yamaha-motor.co.jp); Incapsula; terms: no copying without permission.`,
  },
  {
    manufacturers: ['honda'],
    host: 'hondamotopub.com',
    role: 'manual_library',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [{ kind: 'listing', url: 'https://www.hondamotopub.com/model/MCT/' }],
    evidence: `${R}: Honda Motor Co. MOTOPUB (Israel region MCT); licence click-through: no copying without Honda's permission.`,
  },
  {
    manufacturers: ['mg'],
    host: 'mg-israel.co.il',
    role: 'importer',
    markets: ['IL'],
    defaultDocumentMarkets: ['IL'],
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [{ kind: 'listing', url: 'https://www.mg-israel.co.il/guide-books/' }],
    evidence: `${R}: Car East (Lubinski group); terms bar copying except personal non-commercial use; no maintenance plan published.`,
  },
  {
    manufacturers: ['mg'],
    host: 'mgmotor.eu',
    role: 'manufacturer',
    status: 'proposed',
    automation: 'unknown',
    reuse: 'unknown',
    evidence: `${R}: SAIC Motor Europe B.V.; VIN-driven JS library; no terms found → uncertain.`,
  },
  {
    manufacturers: ['peugeot'],
    host: 'online.peugeot.co.il',
    role: 'importer',
    markets: ['IL'],
    defaultDocumentMarkets: ['IL'],
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [{ kind: 'listing', url: 'https://online.peugeot.co.il/guide-books/' }],
    evidence: `${R}: David Lubinski; terms bar copying except personal use; quick guides only.`,
  },
  {
    manufacturers: ['peugeot'],
    host: 'public.servicebox.peugeot.com',
    role: 'manual_library',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    evidence: `${R}: Stellantis handbook library (he_il editions); legal notice prohibits reproduction; schedules in a separate unpublished booklet.`,
  },
  {
    manufacturers: ['seat'],
    host: 'seat.com',
    role: 'manufacturer',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    entryPoints: [{ kind: 'listing', url: 'https://www.seat.com/owners/manuals' }],
    evidence: `${R}: SEAT S.A.U. manuals JSON (incl. maintenance booklets); terms: reproduction prohibited except for private purposes.`,
  },
  {
    manufacturers: ['ford'],
    host: 'ford.co.il',
    role: 'importer',
    markets: ['IL'],
    defaultDocumentMarkets: ['IL'],
    status: 'proposed',
    automation: 'unknown',
    reuse: 'unknown',
    entryPoints: [{ kind: 'listing', url: 'https://www.ford.co.il/' }],
    evidence:
      'Run 2 (2026-09-29): Delek Motors "תוכנית טיפול" page; Fiesta plan behind a sign-in; terms not reviewed.',
  },
  {
    manufacturers: ['ford'],
    host: 'fordservicecontent.com',
    role: 'manual_library',
    status: 'proposed',
    automation: 'prohibited',
    reuse: 'prohibited',
    evidence: `${R}: Ford owner-information PDFs (Akamai 403); imprint forbids storage in a retrieval system.`,
  },
];
