import { isoDate, type MaintenanceRequirement } from '@/domain';
import { triangulate, type Grounding } from '@/discovery/maintenance/triangulation';

import { GROUNDING, OBSERVATIONS } from './triangulatedData';

/**
 * Requirements from source-agnostic triangulation (2026-09-30): research observations (verbatim,
 * any credible source) × deterministic grounding → requirements with a computed confidence.
 * Keyed by vehicle class (make / model / years / engine), never by vehicle, plate or user.
 */
let cache: MaintenanceRequirement[] | null = null;

export function triangulatedRequirements(): MaintenanceRequirement[] {
  if (!cache) {
    const grounding = new Map<string, Grounding>(Object.entries(GROUNDING));
    cache = triangulate(OBSERVATIONS, grounding, isoDate('2026-09-30')).requirements;
  }
  return cache;
}
