import { accessDecision, hostOf, type Activity } from '../access';
import { anchorsOf } from '../htmlText';
import { fillTemplate, linkNamesVehicle, namesModel, nearMiss, upgradeSameHost } from '../match';
import type { EntryPoint, SourceSystem } from '../registry/sourceSystem';
import type { BlockedAccess, DiscoveryContext, UserSourceAction, VehicleIdentity } from '../types';
import type {
  AdapterFailureCode,
  AdapterResult,
  AdapterRun,
  DocumentRef,
  SourceAdapter,
} from './types';

/**
 * Generic adapters for document SYSTEMS (not models), all configured by registry data, and the
 * policy gate every adapter runs behind: no adapter code touches a source whose policy does not
 * explicitly allow the activity.
 */

/** Deterministic mapping of an access block to a standard failure code. */
export function failureOfBlock(reason: BlockedAccess['reason']): AdapterFailureCode {
  switch (reason) {
    case 'policy_not_allowed':
    case 'robots_disallow':
      return 'TERMS_OR_RIGHTS_BLOCK';
    case 'policy_unknown':
      return 'POLICY_UNKNOWN';
    case 'permission_required':
    case 'registry_not_approved':
      return 'PERMISSION_REQUIRED';
    case 'login_or_bot_wall':
      return 'AUTH_REQUIRED';
    case 'http_error':
    case 'network_error':
    case 'not_a_document':
    case 'too_large':
      return 'SOURCE_UNAVAILABLE';
    default:
      return 'OTHER';
  }
}

const USER_OPENABLE: readonly BlockedAccess['reason'][] = [
  'policy_not_allowed',
  'policy_unknown',
  'permission_required',
  'robots_disallow',
  'login_or_bot_wall',
];

/** An official page the user may open (only for systems the owner approved as authorities). */
function userAction(
  run: AdapterRun,
  url: string,
  reason: BlockedAccess['reason'],
): UserSourceAction | undefined {
  const approved =
    run.system.status === 'approved' ||
    (run.system.status === 'proposed' && !!run.ctx.assumeProposedApproved);
  if (!approved || !USER_OPENABLE.includes(reason)) return undefined;
  return {
    url,
    host: hostOf(url) ?? run.system.domains[0].host,
    title: run.system.sourceSystemId,
    reason,
  };
}

async function gate(
  run: AdapterRun,
  url: string,
  activity: Activity,
): Promise<AdapterResult | null> {
  const d = await accessDecision(url, run.ctx, activity);
  if (d.ok) return null;
  return {
    status: 'failed',
    failure: failureOfBlock(d.blocked.reason),
    detail: `${d.blocked.reason}${d.blocked.detail ? ` (${d.blocked.detail})` : ''}: ${url}`,
    userAction: userAction(run, url, d.blocked.reason),
  };
}

async function read(ctx: DiscoveryContext, url: string): Promise<string | AdapterResult> {
  try {
    const r = await ctx.http(url, { maxBytes: 8 * 1024 * 1024 });
    if (!r.ok) {
      return {
        status: 'failed',
        failure: r.status === 401 || r.status === 403 ? 'AUTH_REQUIRED' : 'SOURCE_UNAVAILABLE',
        detail: `HTTP ${r.status}: ${url}`,
      };
    }
    return new TextDecoder().decode(r.bytes);
  } catch (e) {
    return { status: 'failed', failure: 'SOURCE_UNAVAILABLE', detail: `${String(e)}: ${url}` };
  }
}

const DOC_LINK = /\.pdf(\?|#|$)/i;
const YEAR_RANGE = /\b(19[89]\d|20[0-4]\d)\s*[-–—]\s*(19[89]\d|20[0-4]\d)\b/;

function statedYears(text: string): DocumentRef['statedYears'] {
  const r = YEAR_RANGE.exec(text);
  if (r) return { from: Number(r[1]), to: Number(r[2]) };
  const ys = [...text.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)].map((m) => Number(m[1]));
  return ys.length ? { from: Math.min(...ys), to: Math.max(...ys) } : undefined;
}

/** Static HTML listings and XML sitemaps, breadth-first over the system's own pages. */
export class ListingAdapter implements SourceAdapter {
  readonly id = 'listing';

  constructor(private readonly limits = { pages: 40, documents: 12 }) {}

  async findDocuments(run: AdapterRun): Promise<AdapterResult> {
    const { system, vehicle: v, ctx } = run;
    const documents: DocumentRef[] = [];
    const notes: string[] = [];
    const failures: AdapterResult[] = [];
    let budget = this.limits.pages;
    let sawLinks = false;
    let sawYearMismatch = false;
    for (const ep of system.discovery.entryPoints) {
      if (ep.kind !== 'listing') continue;
      const follow = ep.follow ? new RegExp(ep.follow, 'i') : null;
      const docs = ep.documents ? new RegExp(ep.documents, 'i') : DOC_LINK;
      let frontier = [fillTemplate(ep.url, v)];
      const visited = new Set<string>();
      for (let depth = 0; depth <= (ep.depth ?? 1) && frontier.length; depth++) {
        const next: string[] = [];
        for (const url of frontier) {
          if (visited.has(url) || budget-- <= 0) continue;
          visited.add(url);
          const blocked = await gate(run, url, 'discovery');
          if (blocked) {
            failures.push(blocked);
            continue;
          }
          const body = await read(ctx, url);
          if (typeof body !== 'string') {
            failures.push(body);
            continue;
          }
          const anchors = (
            /<(urlset|sitemapindex)\b/i.test(body.slice(0, 2000))
              ? [...body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => ({
                  href: m[1].replace(/&amp;/g, '&'),
                  text: '',
                }))
              : anchorsOf(body, url)
          ).map((a) => ({ ...a, href: upgradeSameHost(a.href, url) }));
          if (anchors.length) sawLinks = true;
          else notes.push(`${url}: no static links (JavaScript app?)`);
          // A page reached by following a link that named the vehicle is the vehicle's own
          // page: its document links need not repeat the model name.
          const vehiclePage = depth > 0;
          for (const a of anchors) {
            const named = linkNamesVehicle(a.text, a.href, v);
            if (!named && nearMiss(`${a.text} ${a.href}`, v)) {
              notes.push(`near miss (different model name?): ${a.href}`);
            }
            if (!named && namesModel(`${a.text} ${a.href}`, v)) sawYearMismatch = true;
            if (docs.test(a.href) && (named || vehiclePage)) {
              if (documents.length >= this.limits.documents) continue;
              if (documents.some((d) => d.url === a.href)) continue;
              const title = vehiclePage ? `(${url}) ${a.text}`.trim() : a.text;
              documents.push({
                sourceSystemId: system.sourceSystemId,
                url: a.href,
                title,
                category: system.documentCategories[0] ?? 'owner_manual',
                modelMatch: named || vehiclePage ? 'exact' : 'unstated',
                statedYears: statedYears(a.text),
              });
            } else if (follow?.test(a.href) && named && hostOf(a.href) === hostOf(url)) {
              next.push(a.href);
            }
          }
        }
        frontier = next;
      }
    }
    if (documents.length) return { status: 'documents', documents, notes };
    if (failures.length && !sawLinks) return failures[0];
    const near = notes.filter((n) => n.startsWith('near miss'));
    if (sawYearMismatch) {
      return {
        status: 'failed',
        failure: 'MODEL_YEAR_NOT_LISTED',
        detail: 'the model is listed, but not for this model year',
      };
    }
    if (near.length) {
      return {
        status: 'failed',
        failure: 'MODEL_YEAR_NOT_LISTED',
        detail: `only a differently named model is listed: ${near.map((n) => n.replace('near miss (different model name?): ', '')).join(', ')}`,
      };
    }
    if (!sawLinks) {
      return {
        status: 'failed',
        failure: 'SOURCE_UNAVAILABLE',
        detail: notes.join('; ') || 'no readable listing',
      };
    }
    return {
      status: 'failed',
      failure: 'MODEL_YEAR_NOT_LISTED',
      detail: 'no document for this model on the source',
    };
  }
}

/** Direct document URL patterns (e.g. …/{modelSlug}/{locale}/manual.pdf). */
export class TemplateAdapter implements SourceAdapter {
  readonly id = 'url-template';

  async findDocuments(run: AdapterRun): Promise<AdapterResult> {
    const documents: DocumentRef[] = [];
    let first: AdapterResult | null = null;
    for (const ep of run.system.discovery.entryPoints) {
      if (ep.kind !== 'template') continue;
      for (const locale of ep.locales ?? ['']) {
        const url = fillTemplate(ep.url, run.vehicle, locale);
        const blocked = await gate(run, url, 'fetch');
        if (blocked) {
          first ??= blocked;
          continue;
        }
        documents.push({
          sourceSystemId: run.system.sourceSystemId,
          url,
          title: `${run.system.sourceSystemId} ${run.vehicle.model}`,
          category: run.system.documentCategories[0] ?? 'owner_manual',
          // A template is built FROM the model name: the document's own coverage is unknown.
          modelMatch: 'unstated',
        });
      }
    }
    if (documents.length) return { status: 'documents', documents, notes: [] };
    return (
      first ?? { status: 'failed', failure: 'NO_DIGITAL_SOURCE', detail: 'no template entry point' }
    );
  }
}

const at = (o: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (x, k) => (x && typeof x === 'object' ? (x as Record<string, unknown>)[k] : undefined),
      o,
    );

/** Public JSON manual listings (model / year / document fields configured in the registry). */
export class JsonManualApiAdapter implements SourceAdapter {
  readonly id = 'json-manual-api';

  async findDocuments(run: AdapterRun): Promise<AdapterResult> {
    const { system, vehicle: v, ctx } = run;
    const documents: DocumentRef[] = [];
    let first: AdapterResult | null = null;
    let modelSeen = false;
    for (const ep of system.discovery.entryPoints) {
      if (ep.kind !== 'json_api') continue;
      const url = fillTemplate(ep.url, v);
      const blocked = await gate(run, url, 'discovery');
      if (blocked) {
        first ??= blocked;
        continue;
      }
      const body = await read(ctx, url);
      if (typeof body !== 'string') {
        first ??= body;
        continue;
      }
      let items: unknown;
      try {
        items = at(JSON.parse(body), ep.items);
      } catch {
        first ??= { status: 'failed', failure: 'SOURCE_UNAVAILABLE', detail: `not JSON: ${url}` };
        continue;
      }
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const model = String(at(item, ep.model) ?? '');
        if (!namesModel(model, v)) continue;
        modelSeen = true;
        const year = ep.year ? Number(at(item, ep.year)) : NaN;
        if (Number.isFinite(year) && year !== v.modelYear) continue;
        const doc = String(at(item, ep.document) ?? '');
        if (!/^https:\/\//.test(doc)) continue;
        documents.push({
          sourceSystemId: system.sourceSystemId,
          url: doc,
          title:
            `${model} ${Number.isFinite(year) ? year : ''} ${ep.title ? String(at(item, ep.title) ?? '') : ''}`.trim(),
          category: system.documentCategories[0] ?? 'owner_manual',
          modelMatch: 'exact',
          statedYears: Number.isFinite(year) ? { from: year, to: year } : undefined,
        });
      }
    }
    if (documents.length) return { status: 'documents', documents, notes: [] };
    if (first) return first;
    return {
      status: 'failed',
      failure: 'MODEL_YEAR_NOT_LISTED',
      detail: modelSeen
        ? 'the model is listed, but not for this model year'
        : 'the model is not listed',
    };
  }
}

/** Systems that publish nothing usable (type D): the reason, from registry data, no network. */
export class RestrictedAdapter implements SourceAdapter {
  readonly id = 'restricted';

  async findDocuments(run: AdapterRun): Promise<AdapterResult> {
    const s = run.system;
    const failure: AdapterFailureCode =
      s.discovery.mechanism === 'login'
        ? 'AUTH_REQUIRED'
        : s.discovery.mechanism === 'none'
          ? 'NO_DIGITAL_SOURCE'
          : 'SOURCE_UNAVAILABLE';
    const root = s.officialPages?.[0] ?? `https://${s.domains[0].host}/`;
    const approved =
      s.status === 'approved' || (s.status === 'proposed' && !!run.ctx.assumeProposedApproved);
    return {
      status: 'failed',
      failure,
      detail: `${s.sourceSystemId}: ${s.discovery.mechanism}; ${s.limitations.join('; ')}`,
      userAction:
        approved && failure !== 'NO_DIGITAL_SOURCE'
          ? {
              url: root,
              host: hostOf(root) ?? s.domains[0].host,
              title: s.sourceSystemId,
              reason: 'login_or_bot_wall',
            }
          : undefined,
    };
  }
}

export const ADAPTERS: Record<string, SourceAdapter> = {
  listing: new ListingAdapter(),
  'url-template': new TemplateAdapter(),
  'json-manual-api': new JsonManualApiAdapter(),
  restricted: new RestrictedAdapter(),
};
export const ADAPTER_IDS = Object.keys(ADAPTERS);

/** The adapter for a system: the registry's adapterId, else derived from its entry points. */
export function adapterFor(system: SourceSystem): SourceAdapter {
  if (system.sourceType === 'D_RESTRICTED_OR_UNAVAILABLE') return ADAPTERS.restricted;
  if (system.adapterId && ADAPTERS[system.adapterId]) return ADAPTERS[system.adapterId];
  const kinds = new Set(system.discovery.entryPoints.map((e: EntryPoint) => e.kind));
  if (kinds.has('json_api')) return ADAPTERS['json-manual-api'];
  if (kinds.has('template')) return ADAPTERS['url-template'];
  if (kinds.has('listing')) return ADAPTERS.listing;
  return ADAPTERS.restricted;
}

/**
 * Runs the system's adapter. A system without entry points (authority only) reports its
 * mechanism; an adapter error is contained as OTHER — never thrown into the pipeline.
 */
export async function runAdapter(
  system: SourceSystem,
  vehicle: VehicleIdentity,
  ctx: DiscoveryContext,
): Promise<{ adapterId: string; result: AdapterResult }> {
  const adapter = adapterFor(system);
  if (system.sourceType !== 'D_RESTRICTED_OR_UNAVAILABLE' && !system.discovery.entryPoints.length) {
    // A publishing system with no configured entry point: report what actually blocks it —
    // its approval / access policy — never "unavailable" or "no source".
    const root = system.officialPages?.[0] ?? `https://${system.domains[0].host}/`;
    const blocked = await gate({ system, vehicle, ctx }, root, 'discovery');
    return {
      adapterId: adapter.id,
      result: blocked ?? {
        status: 'failed',
        failure: 'OTHER',
        detail: `${system.sourceSystemId}: no adapter entry point configured yet`,
      },
    };
  }
  try {
    return { adapterId: adapter.id, result: await adapter.findDocuments({ system, vehicle, ctx }) };
  } catch (e) {
    return {
      adapterId: adapter.id,
      result: { status: 'failed', failure: 'OTHER', detail: String(e) },
    };
  }
}
