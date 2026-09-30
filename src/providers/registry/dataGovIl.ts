import type { RegistrationNumber, VehicleType } from '@/domain';
import { recognizeType } from '@/identification/engine';
import { exteriorPhaseFromRegistry } from '@/identification/vehicleClass';

import type { RegistryLookup, RegistryVehicle, VehicleRegistryProvider } from './types';
import {
  agreedModelFacts,
  factsFrom,
  mergeFacts,
  PLATE_FIELDS,
  TWO_WHEELER_FIELDS,
  type RegistryFact,
} from './vehicleRecord';

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

  /**
   * Model-catalog rows for the vehicle's manufacturer code + model code + year. Only rows of the
   * technical catalog are used (a row with technical columns); the per-model QUANTITIES resource
   * of the same package is statistics and is never read.
   */
  private async catalogRows(filters: Record<string, string | number>, limit = 50) {
    const rows: Json[] = [];
    for (const rid of await this.resources(PACKAGES.modelCatalog)) {
      for (const r of await this.search(rid, filters, limit)) {
        if ('nefah_manoa' in r || 'koah_sus' in r) rows.push({ ...r, _resource: rid });
      }
    }
    return rows;
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
      const retrievedAt = new Date(this.now()).toISOString();
      const candidates: RegistryVehicle[] = [];
      for (const rid of await this.resources(PACKAGES.twoWheelers)) {
        for (const r of await this.search(rid, { mispar_rechev: plate }, 5)) {
          candidates.push({
            ...mapTwoWheeler(r),
            record: { sources: [rid], retrievedAt, facts: factsFrom(r, TWO_WHEELER_FIELDS) },
          });
        }
      }
      const named: { row: Json; rid: string }[] = [];
      const codeOnly: { row: Json; rid: string }[] = [];
      for (const rid of await this.resources(PACKAGES.cars)) {
        for (const r of await this.search(rid, { mispar_rechev: plate }, 5)) {
          (str(r.degem_nm) || str(r.tozeret_nm) ? named : codeOnly).push({ row: r, rid });
        }
      }
      // The plate's own named record is authoritative; the continuation rows of the same plate
      // (tire codes, towing) and the model catalog complete it.
      for (const n of named) {
        const extra = codeOnly.filter((c) => num(c.row.degem_cd) === num(n.row.degem_cd));
        const catalog = await this.catalogFor(n.row);
        const facts: RegistryFact[] = mergeFacts(
          factsFrom(n.row, PLATE_FIELDS),
          ...extra.map((c) => factsFrom(c.row, PLATE_FIELDS)),
          agreedModelFacts(catalog),
        );
        const sources = [
          n.rid,
          ...extra.map((c) => c.rid),
          ...new Set(catalog.map((c) => String(c._resource))),
        ];
        candidates.push({ ...mapCar(n.row), record: { sources, retrievedAt, facts } });
      }
      // Supplementary code-only rows are expanded through the model catalog only when no named
      // record exists — otherwise catalog variants of other years/trims would be offered.
      if (named.length === 0) {
        for (const c of codeOnly) candidates.push(...(await this.resolveCodes(c.row)));
      }
      const unique = dedupe(candidates);
      return unique.length
        ? { status: 'found', candidates: unique, retrievedAt }
        : { status: 'not_found' };
    } catch (e) {
      return { status: 'unavailable', reason: e instanceof RegistryError ? e.reason : 'network' };
    }
  }

  /** The technical catalog rows of a plate record (same manufacturer, model code and year). */
  private async catalogFor(row: Json): Promise<Json[]> {
    const tozeret = num(row.tozeret_cd);
    const degem = num(row.degem_cd);
    const year = num(row.shnat_yitzur);
    if (!tozeret || !degem || !year) return [];
    const filters: Record<string, string | number> = {
      tozeret_cd: tozeret,
      degem_cd: degem,
      shnat_yitzur: year,
    };
    if (str(row.sug_degem)) filters.sug_degem = String(row.sug_degem);
    return this.catalogRows(filters);
  }

  /** Code-only rows → one candidate per matching catalog variant (the user selects). */
  private async resolveCodes(row: Json): Promise<RegistryVehicle[]> {
    const tozeret = num(row.tozeret_cd);
    const degem = num(row.degem_cd);
    if (!tozeret || !degem) return [];
    const filters: Record<string, string | number> = { tozeret_cd: tozeret, degem_cd: degem };
    if (str(row.sug_degem)) filters.sug_degem = String(row.sug_degem);
    return (await this.catalogRows(filters)).map((c) => mapCar({ ...c, from_catalog: true }));
  }
}

/** "2012-1" / "2012-01" → "2012-01"; anything else → undefined (never guessed). */
function registrationMonthIso(v: string | undefined): string | undefined {
  const m = v?.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!m) return undefined;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${m[1]}-${String(month).padStart(2, '0')}` : undefined;
}

function mapCar(r: Json): RegistryVehicle {
  const manufacturer = str(r.tozar) ?? manufacturerName(r.tozeret_nm, r.tozeret_eretz_nm) ?? '';
  const modelCode = str(r.degem_nm)?.toUpperCase();
  return {
    type: 'car',
    manufacturer,
    modelCode,
    exteriorPhase:
      exteriorPhaseFromRegistry({
        manufacturer,
        modelCode,
        homologationCode: num(r.degem_cd),
        productionYear: num(r.shnat_yitzur),
        firstRegistration: str(r.moed_aliya_lakvish),
        vin: str(r.misgeret),
      }) ?? undefined,
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
    firstRegistration: registrationMonthIso(str(r.moed_aliya_lakvish)),
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
