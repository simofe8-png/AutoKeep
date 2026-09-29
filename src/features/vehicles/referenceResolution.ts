import type { ExteriorPhase } from '@/domain';
import type { VehicleClass } from '@/identification/vehicleClass';
import type {
  ReferenceImageCatalog,
  ReferenceImageRecord,
} from '@/providers/referenceImages/types';

/**
 * Resolves the approved model reference image for a vehicle class (owner decisions 2026-09-29).
 * Distinct outcomes, never conflated:
 *  - reference     an approved image for the exact class (correct color preferred; the correct
 *                  generation/phase/body is never traded for color)
 *  - choose_phase  the exterior phase is unknown: the user picks the matching front
 *  - not_found     the approved catalog has nothing suitable (or the vehicle is out of scope)
 *  - unavailable   connectivity / service failure or timeout — NOT "no image exists"
 */
export type ReferenceResolution =
  | { kind: 'reference'; uri: string; record: ReferenceImageRecord }
  | {
      kind: 'choose_phase';
      options: { phase: ExteriorPhase; uri: string; record: ReferenceImageRecord }[];
    }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

/** No endless spinner: after this the search is reported as a failure the user can retry. */
export const IMAGE_SEARCH_TIMEOUT_MS = 15_000;

/** "v1/…/hatchback-5d/black" → "v1/…/hatchback-5d/" (all colors of the same exact class). */
const classPrefix = (key: string) => key.slice(0, key.lastIndexOf('/') + 1);

/** Exact color first, else the same class in its original color (no recoloring here). */
function best(records: readonly ReferenceImageRecord[], key: string) {
  const exact = records.filter((r) => r.classKey === key);
  const sameClass = records.filter((r) => r.classKey.startsWith(classPrefix(key)));
  const byId = (a: ReferenceImageRecord, b: ReferenceImageRecord) => a.id.localeCompare(b.id);
  return [...exact].sort(byId)[0] ?? [...sameClass].sort(byId)[0] ?? null;
}

export async function resolveReferenceImage(
  cls: VehicleClass,
  catalog: ReferenceImageCatalog,
  timeoutMs = IMAGE_SEARCH_TIMEOUT_MS,
): Promise<ReferenceResolution> {
  if (cls.kind === 'unsupported') return { kind: 'not_found' };
  const wanted: [ExteriorPhase | null, string][] =
    cls.kind === 'key'
      ? [[null, cls.key]]
      : (Object.entries(cls.keys) as [ExteriorPhase, string][]);

  const work = async (): Promise<ReferenceResolution> => {
    const lookup = await catalog.lookup([...new Set(wanted.map(([, k]) => classPrefix(k)))]);
    if (lookup.status !== 'ok') return { kind: 'unavailable' };
    const picks = wanted
      .map(([phase, key]) => ({ phase, record: best(lookup.records, key) }))
      .filter((p): p is { phase: ExteriorPhase | null; record: ReferenceImageRecord } =>
        Boolean(p.record),
      );
    if (picks.length === 0) return { kind: 'not_found' };
    const fetched: { phase: ExteriorPhase | null; record: ReferenceImageRecord; uri: string }[] =
      [];
    for (const p of picks) {
      const f = await catalog.fetchImage(p.record);
      if (f.status !== 'ok') return { kind: 'unavailable' };
      fetched.push({ ...p, uri: f.uri });
    }
    if (cls.kind === 'key')
      return { kind: 'reference', uri: fetched[0].uri, record: fetched[0].record };
    return {
      kind: 'choose_phase',
      options: fetched.map((f) => ({ phase: f.phase!, uri: f.uri, record: f.record })),
    };
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ReferenceResolution>((resolve) => {
    timer = setTimeout(() => resolve({ kind: 'unavailable' }), timeoutMs);
  });
  try {
    return await Promise.race([
      work().catch((): ReferenceResolution => ({ kind: 'unavailable' })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}
