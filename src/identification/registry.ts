import { parseRegistration } from '@/domain';
import type { RegistryVehicle, VehicleRegistryProvider } from '@/providers/registry/types';

import {
  missingFields,
  uncertainFields,
  type DraftField,
  type IdentificationDraft,
  type IdentificationResult,
} from './engine';

/**
 * Official registry integration (ADR-0012). Registry facts outrank OCR: a registry value replaces
 * a differing scanned value (and resolves its uncertainty); user-entered values are never
 * overwritten. Several registry candidates require the user to choose.
 */
export function applyRegistry(draft: IdentificationDraft, v: RegistryVehicle): IdentificationDraft {
  const next: IdentificationDraft = { ...draft };
  const set = (f: DraftField, value: string | number | undefined) => {
    if (value === undefined || value === '' || value === 0) return;
    if (next[f]?.origin === 'user') return;
    next[f] = { value: String(value), origin: 'registry', confidence: null, uncertain: false };
  };
  set('type', v.type);
  set('manufacturer', v.manufacturer);
  set('model', v.model);
  set('year', v.year);
  set('trim', v.trim);
  set('engine', v.engine);
  set('engineCode', v.engineCode);
  set('fuel', v.fuel);
  set('color', v.color);
  set('modelCode', v.modelCode);
  set('exteriorPhase', v.exteriorPhase);
  set('vin', v.vin);
  return next;
}

/**
 * Identify by registration number via the official registry. Only the plate is sent and only
 * with consent; every failure is returned in context (scan / manual remain available).
 */
export async function identifyByRegistration(
  plateRaw: string,
  registry: VehicleRegistryProvider,
  consent: boolean,
  base: IdentificationDraft = {},
): Promise<IdentificationResult> {
  const plate = parseRegistration(plateRaw);
  if (!plate) return { kind: 'failed', reason: 'registry_not_found' };
  const r = await registry.lookup(plate, { consent });
  switch (r.status) {
    case 'consent_required':
      return { kind: 'failed', reason: 'consent_required' };
    case 'unavailable':
      return { kind: 'failed', reason: 'registry_unavailable' };
    case 'not_found':
      return { kind: 'failed', reason: 'registry_not_found' };
  }
  const withPlate: IdentificationDraft = {
    ...base,
    registration:
      base.registration?.origin === 'user'
        ? base.registration
        : { value: plateRaw.trim(), origin: 'registry', confidence: null, uncertain: false },
  };
  if (r.candidates.length > 1) {
    return { kind: 'needs_selection', draft: withPlate, candidates: r.candidates };
  }
  const draft = applyRegistry(withPlate, r.candidates[0]);
  return { kind: 'draft', draft, missing: missingFields(draft), uncertain: uncertainFields(draft) };
}
