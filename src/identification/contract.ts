import { z } from 'zod';

/**
 * Registration-document extraction contract (T052). Any OCR/AI provider must return data in this
 * shape; output is validated before use (SECURITY.md: validate AI structured output).
 *
 * Data minimization: the contract has NO fields for the owner's name, national ID or address —
 * identification never needs them, so providers must not return them and they are dropped if sent.
 */

export const REGISTRATION_FIELDS = [
  'registration',
  'manufacturer',
  'model',
  'year',
  'trim',
  'modelCode',
  'engine',
  'engineCode',
  'fuel',
  'color',
  'exteriorPhase',
  'firstRegistration',
  'vin',
  'vehicleCategory',
] as const;
export type RegistrationField = (typeof REGISTRATION_FIELDS)[number];

const extractedValue = z.object({
  value: z.string().trim().min(1).max(80),
  /** Provider confidence in [0,1]. */
  confidence: z.number().min(0).max(1),
});

export const registrationExtractionSchema = z
  .object({
    documentType: z.enum(['vehicle_license', 'unknown']),
    fields: z.object(
      Object.fromEntries(REGISTRATION_FIELDS.map((f) => [f, extractedValue.optional()])) as Record<
        RegistrationField,
        z.ZodOptional<typeof extractedValue>
      >,
    ),
  })
  // Unknown keys (e.g. an owner name a provider might add) are stripped, never kept.
  .strip();

export type RegistrationExtraction = z.infer<typeof registrationExtractionSchema>;

export type ExtractorOutcome =
  | { status: 'ok'; output: RegistrationExtraction; producedBy: string }
  | { status: 'unreadable'; producedBy: string }
  | { status: 'error'; message: string; producedBy: string };

/** Provider port. Implementations: MockRegistrationExtractor (labeled), real OCR/AI in M11. */
export interface RegistrationExtractor {
  readonly id: string;
  extract(fileUri: string, mimeType: string): Promise<ExtractorOutcome>;
}

/** Parses untrusted provider output. Invalid output is treated as unreadable, never guessed. */
export function parseExtraction(raw: unknown): RegistrationExtraction | null {
  const r = registrationExtractionSchema.safeParse(raw);
  if (!r.success) return null;
  // Explicitly drop any unexpected keys inside `fields` as well.
  const fields = Object.fromEntries(
    REGISTRATION_FIELDS.filter((f) => r.data.fields[f]).map((f) => [f, r.data.fields[f]]),
  ) as RegistrationExtraction['fields'];
  return { documentType: r.data.documentType, fields };
}
