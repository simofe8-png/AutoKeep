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
