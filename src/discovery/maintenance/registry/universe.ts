import type { VehicleType } from '@/domain';

import { normalizeManufacturer, type ManufacturerAliases } from '../../authority';
import type { SourceSystem } from './sourceSystem';

/**
 * Israeli fleet universe → source-system candidates (M-SOURCE Step 5).
 *
 * The universe is AGGREGATE Ministry-of-Transport data (vehicle counts per `tozeret_nm`, e.g.
 * "טויוטה טורקיה"); no plate, VIN or owner field is used or kept. A vehicle identity maps to its
 * manufacturer key, then to the registered source systems of that manufacturer, ordered by the
 * runtime source priority. Deterministic; no per-model rule.
 */

export interface FleetMake {
  /** Ministry manufacturer string (make + country of manufacture). */
  ministryMake: string;
  ministryCode: number;
  count: number;
  category: 'car' | 'motorcycle';
}

export interface FleetUniverse {
  /** Ministry dataset resource id and when the counts were read. */
  source: { resource: string; retrievedAt: string; category: 'car' | 'motorcycle' }[];
  /** Total records in each dataset (the denominator); makes may not sum to it exactly. */
  totals: Record<'car' | 'motorcycle', number>;
  makes: FleetMake[];
}

/**
 * Manufacturer key of a Ministry make string, or null when no known alias names it. Unknown makes
 * stay unmapped — never guessed from similar spellings.
 */
export function makeKeyOf(ministryMake: string, aliases: ManufacturerAliases): string | null {
  const key = normalizeManufacturer(ministryMake, aliases);
  return Object.values(aliases).includes(key) ? key : null;
}

/**
 * Runtime source priority (M-SOURCE):
 *   1 AutoKeep verified catalog (not a system — consulted first by the pipeline)
 *   2 Israeli direct maintenance schedule
 *   3 Israeli service / warranty / maintenance booklet
 *   4 Israeli full owner manual (maintenance section) / structured web manual
 *   5 applicable official global manufacturer documentation
 *   6 private user-uploaded official documentation (not a system)
 *   7 secondary evidence (investigation only; never a registry system)
 * A restricted Israeli system (type D) is still returned (rank 8) so the product can name it and
 * link to it; it is never a retrieval source.
 */
export function sourcePriority(s: SourceSystem): number {
  const il = s.origin === 'israeli';
  if (s.sourceType === 'D_RESTRICTED_OR_UNAVAILABLE') return 8;
  if (il && s.sourceType === 'A_DIRECT_MAINTENANCE_SCHEDULE') return 2;
  if (il && s.documentCategories.some((c) => c === 'service_booklet' || c === 'warranty_booklet')) {
    return 3;
  }
  if (il) return 4;
  return 5;
}

export interface SourceCandidate {
  system: SourceSystem;
  priority: number;
  /** For Israeli importer systems: does the vehicle's importer (when known) match? */
  importerMatch: 'same' | 'different' | 'unknown' | 'not_applicable';
}

export interface CandidateIdentity {
  make: string;
  kind?: VehicleType;
  /** Importer of the vehicle when known (e.g. Ministry importer data); parallel imports differ. */
  importer?: string;
}

const normName = (s: string) => s.replace(/["'׳״.\s-]+/g, '').toLowerCase();

export function candidateSystems(
  v: CandidateIdentity,
  systems: readonly SourceSystem[],
  aliases: ManufacturerAliases,
): SourceCandidate[] {
  const key = normalizeManufacturer(v.make, aliases);
  const kind = v.kind === 'scooter' ? 'motorcycle' : v.kind;
  return (
    systems
      .filter((s) => s.status !== 'rejected' && s.manufacturers.includes(key))
      // A car importer never answers for a two-wheeler of the same brand, and vice versa.
      .filter((s) => !kind || s.vehicleKinds.includes(kind))
      .map((system) => ({
        system,
        priority: sourcePriority(system),
        importerMatch:
          system.authorityClass !== 'importer'
            ? ('not_applicable' as const)
            : !v.importer || !system.importer
              ? ('unknown' as const)
              : normName(system.importer).includes(normName(v.importer)) ||
                  normName(v.importer).includes(normName(system.importer))
                ? ('same' as const)
                : ('different' as const),
      }))
      .sort(
        (a, b) =>
          a.priority - b.priority || a.system.sourceSystemId.localeCompare(b.system.sourceSystemId),
      )
  );
}

/**
 * Fleet makes grouped by manufacturer key AND category ("honda|car", "honda|motorcycle"); unmapped
 * makes listed separately.
 */
export function fleetByManufacturer(u: FleetUniverse, aliases: ManufacturerAliases) {
  const mapped = new Map<
    string,
    { key: string; category: 'car' | 'motorcycle'; count: number; makes: string[] }
  >();
  const unmapped: FleetMake[] = [];
  for (const m of u.makes) {
    const key = makeKeyOf(m.ministryMake, aliases);
    if (!key) {
      unmapped.push(m);
      continue;
    }
    const id = `${key}|${m.category}`;
    const e = mapped.get(id) ?? { key, category: m.category, count: 0, makes: [] };
    e.count += m.count;
    e.makes.push(m.ministryMake);
    mapped.set(id, e);
  }
  return { mapped, unmapped };
}
