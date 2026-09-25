import type { AcquisitionResult } from '@/providers/acquisition/types';

import type { RegistrationExtractor } from './contract';
import { resolveIdentification, type IdentificationResult, type VehicleVariant } from './engine';

/**
 * Optional catalog of exact vehicle variants (provider-independent). Used to fill gaps and to
 * surface ambiguity; a real catalog/registry source is an approval-gated provider choice.
 */
export interface VehicleCatalog {
  variantsFor(query: {
    manufacturer?: string;
    model?: string;
    year?: number;
  }): Promise<VehicleVariant[]>;
}

export const emptyCatalog: VehicleCatalog = { variantsFor: async () => [] };

export type PipelineResult =
  | IdentificationResult
  | { kind: 'acquisition'; result: Exclude<AcquisitionResult, { status: 'acquired' }> };

/**
 * acquisition → extraction (untrusted, schema-validated) → catalog resolution → result.
 * Every failure is returned in context so the UI can offer retry / upload / manual entry.
 */
export async function identifyFromAcquisition(
  acquisition: AcquisitionResult,
  extractor: RegistrationExtractor,
  catalog: VehicleCatalog,
  currentYear: number,
): Promise<PipelineResult> {
  if (acquisition.status !== 'acquired') return { kind: 'acquisition', result: acquisition };
  const outcome = await extractor.extract(acquisition.file.uri, acquisition.file.mimeType);
  if (outcome.status === 'error') return { kind: 'failed', reason: 'error' };
  if (outcome.status === 'unreadable') return { kind: 'failed', reason: 'unreadable' };
  const f = outcome.output.fields;
  const candidates = await catalog.variantsFor({
    manufacturer: f.manufacturer?.value,
    model: f.model?.value,
    year: f.year ? Number(f.year.value) : undefined,
  });
  return resolveIdentification(outcome.output, candidates, currentYear);
}
