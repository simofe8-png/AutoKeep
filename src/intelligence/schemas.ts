import { z } from 'zod';

/**
 * T089: structured schemas for AI output. Output is untrusted: it is parsed with these schemas and
 * anything that does not validate is rejected, never repaired by guessing. Unknown keys are
 * stripped. Every maintenance fact must carry an evidence reference (page + verbatim quote) that
 * is later grounded against the original document (evidence.ts).
 */

const confidence = z.number().min(0).max(1);

export const evidenceRefSchema = z.object({
  page: z.number().int().min(1).max(2000),
  section: z.string().trim().max(80).optional(),
  table: z.string().trim().max(80).optional(),
  /** Verbatim text from the page supporting the fact. */
  quote: z.string().trim().min(3).max(400),
});
export type EvidenceRef = z.infer<typeof evidenceRefSchema>;

const itemSchema = z.object({
  title: z.string().trim().min(1).max(120),
  actionType: z.enum(['inspection', 'replacement', 'other']),
  manufacturerText: z.string().trim().min(1).max(400),
  evidence: evidenceRefSchema,
  confidence,
});

const intervalSchema = z
  .object({
    label: z.string().trim().min(1).max(80),
    rule: z.enum(['earliest_of', 'distance_only', 'time_only']),
    everyKm: z.number().int().positive().max(500_000).optional(),
    everyMonths: z.number().int().positive().max(240).optional(),
    firstAtKm: z.number().int().positive().max(500_000).optional(),
    firstAtMonths: z.number().int().positive().max(240).optional(),
    evidence: evidenceRefSchema,
    items: z.array(itemSchema).min(1).max(80),
  })
  .refine(
    (i) =>
      (i.rule === 'earliest_of' && i.everyKm !== undefined && i.everyMonths !== undefined) ||
      (i.rule === 'distance_only' && i.everyKm !== undefined) ||
      (i.rule === 'time_only' && i.everyMonths !== undefined),
    { message: 'interval rule does not match its limits' },
  );

export const coverageSchema = z.object({
  manufacturer: z.string().trim().max(60).optional(),
  models: z.array(z.string().trim().min(1).max(60)).max(40),
  yearFrom: z.number().int().min(1950).max(2100).optional(),
  yearTo: z.number().int().min(1950).max(2100).optional(),
  engines: z.array(z.string().trim().max(40)).max(40).optional(),
  modelCodes: z.array(z.string().trim().max(40)).max(80).optional(),
  markets: z.array(z.string().trim().max(20)).max(40).optional(),
  edition: z.string().trim().max(80).optional(),
  documentKind: z.enum(['owners_manual', 'maintenance_schedule', 'other']),
  evidence: evidenceRefSchema.optional(),
});

export const maintenanceExtractionSchema = z.object({
  coverage: coverageSchema,
  intervals: z.array(intervalSchema).max(40),
});
export type MaintenanceExtraction = z.infer<typeof maintenanceExtractionSchema>;

const valueWithConfidence = <T extends z.ZodTypeAny>(v: T) =>
  z.object({ value: v, confidence, evidence: evidenceRefSchema.optional() });

export const invoiceExtractionSchema = z.object({
  date: valueWithConfidence(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  odometerKm: valueWithConfidence(z.number().int().min(0).max(2_000_000)).optional(),
  garageName: valueWithConfidence(z.string().trim().min(1).max(120)).optional(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(200),
        actionType: z.enum(['inspection', 'replacement', 'other']).optional(),
        confidence,
      }),
    )
    .max(100),
});
export type InvoiceExtraction = z.infer<typeof invoiceExtractionSchema>;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export function parseUntrusted<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  const r = schema.safeParse(raw);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
}
