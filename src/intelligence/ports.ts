/**
 * Document intelligence ports (M11, T087/T088). Provider-independent: no runtime OCR/AI provider is
 * chosen yet (G1) — implementations are clearly labeled mocks until an approved provider exists.
 *
 * AI is never authoritative: it proposes structured data; AutoKeep validates the schema, grounds
 * every fact in the original document's text, and the domain decides verification.
 */

export interface OcrLine {
  text: string;
  /** Recognition confidence in [0,1]. */
  confidence: number;
}

export interface OcrPage {
  /** 1-based page number in the original document. */
  number: number;
  lines: OcrLine[];
}

export interface OcrDocument {
  pages: OcrPage[];
  /** Provider label for audit (never for trust). */
  producedBy: string;
}

export interface DocumentInput {
  /** App-private storage URI of the ORIGINAL file (never a public URL). */
  uri: string;
  mimeType: string;
}

/** T087: OCR port. */
export interface OcrProvider {
  readonly id: string;
  recognize(doc: DocumentInput, options: { languages: ('he' | 'en')[] }): Promise<OcrDocument>;
}

export type ExtractionTask = 'maintenance_schedule' | 'invoice';

/**
 * T088: structured-extraction port. The signature separates AutoKeep's fixed task definition from
 * the UNTRUSTED document content, which may only be passed as delimited data (see injection.ts).
 * Implementations must never concatenate document text into instructions.
 */
export interface StructuredExtractor {
  readonly id: string;
  extract(task: ExtractionTask, content: UntrustedContent): Promise<unknown>;
}

/** Document text wrapped for transport to an extractor (created only by wrapUntrusted). */
export interface UntrustedContent {
  readonly kind: 'untrusted_document';
  /** Random per-request delimiter the document cannot forge. */
  readonly boundary: string;
  readonly pages: { number: number; text: string }[];
  readonly flags: InjectionFlag[];
}

export type InjectionFlag =
  'instruction_like_text' | 'role_markers' | 'hidden_characters_removed' | 'truncated';
