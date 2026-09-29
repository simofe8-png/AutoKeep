import { runAdapter } from './adapters';
import { candidateSystems } from './registry/universe';
import type { DiscoveryContext, DiscoveryOutcome, SourceDiscovery, VehicleIdentity } from './types';

/**
 * Source-discovery adapters (provider-independent). None of them contains a per-model rule:
 *  - RegistryDiscovery walks the DATA entry points (listings, URL templates, sitemaps) of the
 *    official hosts registered for the vehicle's manufacturer, under the access policy;
 *  - UploadDiscovery offers the user's own uploaded documents;
 *  - WebSearchDiscovery is a port for a search provider (none approved → "not configured");
 *  - SecondaryDiscovery is a port for corroboration sources (never authoritative).
 * The reusable knowledge catalog is consulted before any of these (see pipeline.ts).
 */

/** "C-HR" → "chr", "PCX 125" → "pcx125", "Model 3" → "model3". */
export {
  compact,
  fillTemplate,
  linkNamesVehicle,
  modelSlugs,
  namesModel,
  nearMiss,
  upgradeSameHost,
} from './match';

/**
 * Official-source discovery over the source registry: the vehicle's candidate systems in runtime
 * priority order (Israeli direct schedule → Israeli booklet → Israeli manual → global manufacturer
 * documentation; restricted systems last), each through its generic adapter behind the policy
 * gate. Every system's outcome is recorded with a standard failure code.
 */
export class RegistryDiscovery implements SourceDiscovery {
  readonly id = 'official-registry';

  async discover(v: VehicleIdentity, ctx: DiscoveryContext): Promise<DiscoveryOutcome> {
    const outcome: DiscoveryOutcome = {
      adapter: this.id,
      leads: [],
      blocked: [],
      notes: [],
      failures: [],
      userActions: [],
    };
    const candidates = candidateSystems(v, ctx.registry, ctx.aliases);
    if (candidates.length === 0) {
      outcome.notes.push('unsupported_manufacturer: no registered source system');
      return outcome;
    }
    for (const c of candidates) {
      const { adapterId, result } = await runAdapter(c.system, v, ctx);
      if (result.status === 'documents') {
        for (const d of result.documents) {
          if (outcome.leads.some((l) => l.url === d.url)) continue;
          outcome.leads.push({
            url: d.url,
            title: d.title,
            via: 'official_listing',
            adapter: adapterId,
            sourceSystemId: c.system.sourceSystemId,
            priority: c.priority,
          });
        }
        outcome.notes.push(...result.notes);
      } else {
        outcome.failures!.push({
          sourceSystemId: c.system.sourceSystemId,
          adapter: adapterId,
          priority: c.priority,
          code: result.failure,
          detail: result.detail,
        });
        if (
          result.userAction &&
          !outcome.userActions!.some((u) => u.url === result.userAction!.url)
        ) {
          outcome.userActions!.push(result.userAction);
        }
      }
    }
    return outcome;
  }
}

/** The user's own uploaded documents for this vehicle (never authoritative by upload alone). */
export class UploadDiscovery implements SourceDiscovery {
  readonly id = 'user-upload';

  constructor(private readonly uploads: readonly { name: string; bytes: Uint8Array }[]) {}

  async discover(): Promise<DiscoveryOutcome> {
    return {
      adapter: this.id,
      leads: this.uploads.map((u) => ({
        url: `upload:${u.name}`,
        title: u.name,
        via: 'user_upload' as const,
        adapter: this.id,
        upload: u,
      })),
      blocked: [],
      notes: [],
    };
  }
}

/** Web search port: the vendor is an owner decision (G1/G3: zero-cost, none approved). */
export interface WebSearchProvider {
  readonly id: string;
  search(query: string): Promise<{ url: string; title: string }[]>;
}

export class WebSearchDiscovery implements SourceDiscovery {
  readonly id = 'web-search';

  constructor(private readonly provider: WebSearchProvider | null) {}

  async discover(v: VehicleIdentity): Promise<DiscoveryOutcome> {
    const outcome: DiscoveryOutcome = { adapter: this.id, leads: [], blocked: [], notes: [] };
    if (!this.provider) {
      outcome.notes.push('provider_not_configured: no web search provider is approved');
      return outcome;
    }
    const q = `${v.make} ${v.model} ${v.modelYear} owner's manual maintenance schedule`;
    for (const r of await this.provider.search(q)) {
      // Search results are leads only; the access policy and authority decide downstream.
      outcome.leads.push({ url: r.url, title: r.title, via: 'web_search', adapter: this.id });
    }
    return outcome;
  }
}

/** Secondary corroboration sources (forums, press, parts sellers): level D at most. */
export class SecondaryDiscovery implements SourceDiscovery {
  readonly id = 'secondary';

  async discover(): Promise<DiscoveryOutcome> {
    return {
      adapter: this.id,
      leads: [],
      blocked: [],
      notes: ['provider_not_configured: no secondary-source provider is approved'],
    };
  }
}
