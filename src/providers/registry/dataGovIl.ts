import type { RegistrationNumber, VehicleType } from '@/domain';
import { recognizeType } from '@/identification/engine';

import type { RegistryLookup, RegistryVehicle, VehicleRegistryProvider } from './types';

/**
 * data.gov.il (Israel Ministry of Transport open data, CKAN DataStore) — ADR-0012.
 * Datasets are resolved at runtime from stable PACKAGE names because the ministry republishes
 * resources. Only the plate number is sent, and only with consent.
 */

export const DATA_GOV_IL_API = 'https://data.gov.il/api/3/action';
export const PACKAGES = {
  cars: 'private-and-commercial-vehicles',
  twoWheelers: 'motorcycle',
  modelCatalog: 'degem-rechev-wltp',
} as const;

type Json = Record<string, unknown>;
export type HttpGet = (url: string, signal: AbortSignal) => Promise<unknown>;

const defaultGet: HttpGet = async (url, signal) => {
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

class RegistryError extends Error {
  constructor(readonly reason: 'network' | 'timeout' | 'bad_response') {
    super(reason);
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined);

/** "הונדה יפן" with country "יפן" → "הונדה". */
function manufacturerName(name: unknown, country: unknown): string | undefined {
  const n = str(name);
  const c = str(country);
  return n && c && n.endsWith(` ${c}`) ? n.slice(0, -(c.length + 1)).trim() : n;
}

const cc = (v: unknown) => (num(v) ? `${num(v)} סמ״ק` : undefined);

export interface DataGovIlOptions {
  get?: HttpGet;
  timeoutMs?: number;
  now?: () => number;
  /** Cache lifetime for resolved resource ids. */
  resourceTtlMs?: number;
}

export class DataGovIlRegistry implements VehicleRegistryProvider {
  readonly id = 'data.gov.il';
  private readonly get: HttpGet;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly ttl: number;
  private cache = new Map<string, { ids: string[]; at: number }>();

  constructor(opts: DataGovIlOptions = {}) {
    this.get = opts.get ?? defaultGet;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.now = opts.now ?? Date.now;
    this.ttl = opts.resourceTtlMs ?? 24 * 3600_000;
  }

  private async call(action: string, params: Record<string, string>): Promise<Json> {
    // Explicit encoding: identical query strings on Hermes and Node (no URLSearchParams polyfill).
    const qs = Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let body: unknown;
    try {
      body = await this.get(`${DATA_GOV_IL_API}/${action}?${qs}`, controller.signal);
    } catch {
      throw new RegistryError(controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }
    const j = body as { success?: boolean; result?: Json };
    if (!j || j.success !== true || !j.result) throw new RegistryError('bad_response');
    return j.result;
  }

  /** Active DataStore resources of a package (cached). */
  async resources(pkg: string): Promise<string[]> {
    const hit = this.cache.get(pkg);
    if (hit && this.now() - hit.at < this.ttl) return hit.ids;
    const result = await this.call('package_show', { id: pkg });
    const res = Array.isArray(result.resources) ? (result.resources as Json[]) : [];
    const ids = res.filter((r) => r.datastore_active === true).map((r) => String(r.id));
    this.cache.set(pkg, { ids, at: this.now() });
    return ids;
  }

  private async search(resourceId: string, filters: Record<string, string | number>, limit = 20) {
    const result = await this.call('datastore_search', {
      resource_id: resourceId,
      filters: JSON.stringify(filters),
      limit: String(limit),
    });
    return Array.isArray(result.records) ? (result.records as Json[]) : [];
  }

  async lookup(
    registration: RegistrationNumber,
    options: { consent: boolean },
  ): Promise<RegistryLookup> {
    if (!options.consent) return { status: 'consent_required' };
    const plate = Number(registration);
    if (!Number.isSafeInteger(plate)) return { status: 'not_found' };
    try {
      const candidates: RegistryVehicle[] = [];
      for (const rid of await this.resources(PACKAGES.twoWheelers)) {
        for (const r of await this.search(rid, { mispar_rechev: plate }, 5)) {
          candidates.push(mapTwoWheeler(r));
        }
      }
      const named: RegistryVehicle[] = [];
      const codeOnly: Json[] = [];
      for (const rid of await this.resources(PACKAGES.cars)) {
        for (const r of await this.search(rid, { mispar_rechev: plate }, 5)) {
          if (str(r.degem_nm) || str(r.tozeret_nm)) named.push(mapCar(r));
          else codeOnly.push(r);
        }
      }
      // The plate's own named record is authoritative. Supplementary code-only rows (e.g. the
      // tires/towing resource) are expanded through the model catalog only when no named record
      // exists — otherwise catalog variants of other years/trims would be offered as matches.
      candidates.push(...named);
      if (named.length === 0) {
        for (const r of codeOnly) candidates.push(...(await this.resolveCodes(r)));
      }
      const unique = dedupe(candidates);
      return unique.length
        ? { status: 'found', candidates: unique, retrievedAt: new Date(this.now()).toISOString() }
        : { status: 'not_found' };
    } catch (e) {
      return { status: 'unavailable', reason: e instanceof RegistryError ? e.reason : 'network' };
    }
  }

  /** Code-only rows → one candidate per matching catalog variant (the user selects). */
  private async resolveCodes(row: Json): Promise<RegistryVehicle[]> {
    const tozeret = num(row.tozeret_cd);
    const degem = num(row.degem_cd);
    if (!tozeret || !degem) return [];
    const filters: Record<string, string | number> = { tozeret_cd: tozeret, degem_cd: degem };
    if (str(row.sug_degem)) filters.sug_degem = String(row.sug_degem);
    const out: RegistryVehicle[] = [];
    for (const rid of await this.resources(PACKAGES.modelCatalog)) {
      for (const c of await this.search(rid, filters, 50))
        out.push(mapCar({ ...c, from_catalog: true }));
    }
    return out;
  }
}

function mapCar(r: Json): RegistryVehicle {
  return {
    type: 'car',
    manufacturer: str(r.tozar) ?? manufacturerName(r.tozeret_nm, r.tozeret_eretz_nm) ?? '',
    model: str(r.kinuy_mishari) ?? str(r.degem_nm) ?? '',
    year: num(r.shnat_yitzur) ?? 0,
    trim: str(r.ramat_gimur),
    // Displacement and engine code are different facts: `degem_manoa` is the engine code (it was
    // previously shown as the engine displacement), `nefah_manoa` the displacement.
    engine: cc(r.nefah_manoa ?? r.nefach_manoa),
    engineCode: str(r.degem_manoa)?.toUpperCase(),
    fuel: str(r.sug_delek_nm) ?? str(r.delek_nm),
    color: str(r.tzeva_rechev),
    vin: str(r.misgeret),
    dataset: r.from_catalog ? PACKAGES.modelCatalog : PACKAGES.cars,
  };
}

function mapTwoWheeler(r: Json): RegistryVehicle {
  const t = recognizeType(str(r.sug_rechev_nm) ?? str(r.sug_rechev_EU_cd));
  const type: VehicleType | undefined = t.status === 'recognized' ? t.type : undefined;
  return {
    type,
    manufacturer: manufacturerName(r.tozeret_nm, r.tozeret_eretz_nm) ?? '',
    model: str(r.degem_nm) ?? '',
    year: num(r.shnat_yitzur) ?? 0,
    engine: cc(r.nefach_manoa),
    fuel: str(r.sug_delek_nm),
    vin: str(r.misgeret),
    dataset: PACKAGES.twoWheelers,
  };
}

function dedupe(list: RegistryVehicle[]): RegistryVehicle[] {
  const seen = new Set<string>();
  return list.filter((v) => {
    const k = JSON.stringify([
      v.type,
      v.manufacturer,
      v.model,
      v.year,
      v.trim,
      v.engine,
      v.engineCode,
      v.color,
      v.vin,
    ]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
