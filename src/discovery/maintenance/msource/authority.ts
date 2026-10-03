import type { DocumentType } from '../types';
import { systemForHost, type SourceSystem } from '../registry/sourceSystem';
import { publisherKey } from '../triangulation';

/**
 * Source IDENTITY / AUTHORITY (owner correction 2026-10-02) — separate from automated access
 * permission (accessEngine.ts), which is unchanged. A document is official when its provenance is
 * verifiable:
 *  - its host belongs to a source system in the registry (any status but "rejected"): the
 *    registry caches the classification; or
 *  - its host is the manufacturer's own brand domain (registrable domain = the make, e.g.
 *    seat.co.uk, seat.com, ford.co.uk — never a look-alike such as seat-manuals.com, never a
 *    community / forum subdomain) AND the document itself is a manufacturer document type
 *    (owner's manual, maintenance booklet / schedule, service manual).
 * "Not yet in our registry" is NOT "not official".
 */

export interface SourceIdentity {
  official: boolean;
  basis: 'registry' | 'brand_domain' | 'none';
  detail: string;
}

const MANUFACTURER_DOCUMENTS: readonly DocumentType[] = [
  'owners_manual',
  'warranty_maintenance_booklet',
  'maintenance_schedule',
  'service_manual',
];

/** Official manual / booklet naming in a document path (any manufacturer, several languages). */
const MANUAL_PATH =
  /(manual|handbook|owners?|booklet|maintenance|service-?(plan|schedule)|betriebsanleitung|bedienungsanleitung|serviceheft|manual-de-instrucciones|notice|carnet|libretto|instrukcja|navod)/i;
const pathOf = (url: string) => {
  try {
    return decodeURIComponent(new URL(url).pathname);
  } catch {
    return '';
  }
};

const COMMUNITY = /(^|\.)(forums?|community|club|blog|answers?|social|support-community)\./i;

const brandLabel = (make: string) => make.toLowerCase().replace(/[^a-z0-9]/g, '');

export function sourceIdentity(
  host: string,
  make: string,
  documentType: DocumentType | null,
  registry: readonly SourceSystem[],
  /** The document URL: an official manual path also establishes a manufacturer document. */
  url?: string,
): SourceIdentity {
  const h = host.toLowerCase();
  const system = systemForHost(h, registry);
  if (system && system.status !== 'rejected') {
    return {
      official: true,
      basis: 'registry',
      detail: `${system.sourceSystemId} (${system.status})`,
    };
  }
  const registrable = publisherKey(`https://${h}/`);
  const label = registrable.split('.')[0].replace(/-/g, '');
  if (
    label === brandLabel(make) &&
    !COMMUNITY.test(`${h}.`) &&
    ((documentType != null && MANUFACTURER_DOCUMENTS.includes(documentType)) ||
      (url != null && MANUAL_PATH.test(pathOf(url))))
  ) {
    return {
      official: true,
      basis: 'brand_domain',
      detail: `${registrable} is the ${make} brand domain; document type ${documentType}`,
    };
  }
  return { official: false, basis: 'none', detail: h };
}

/**
 * Model year from TRUSTED document metadata (official sources only): the manufacturer's own
 * model-year designation in its official URL / filename ("…/my12_w45/…", "model-year-2012").
 * Never applied to third-party hosts.
 */
export function officialMetadataYear(url: string): { year: number; designation: string } | null {
  let path = '';
  try {
    path = decodeURIComponent(new URL(url).pathname);
  } catch {
    return null;
  }
  const my = /(?:^|[/_\-.])MY[_-]?(\d{2})(?=$|[/_\-.])/i.exec(path);
  if (my) return { year: 2000 + Number(my[1]), designation: my[0].replace(/^[/_\-.]/, '') };
  const long = /model[-_ ]?year[-_ ]?((?:19|20)\d\d)/i.exec(path);
  if (long) return { year: Number(long[1]), designation: long[0] };
  return null;
}

/**
 * A body-variant token in an OFFICIAL document's directory naming: "…/{model}_sc/…",
 * "…/{model}-estate/…". Directory segments only (file names carry language codes such as
 * "_EN"); trusted only for official sources.
 */
export function officialVariantToken(url: string, model: string): string | null {
  let path = '';
  try {
    path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  } catch {
    return null;
  }
  const m = model.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (m.length < 2) return null;
  const re = new RegExp(`/${m}[_-]([a-z]{1,12})(?=/)`);
  return re.exec(path)?.[1] ?? null;
}
