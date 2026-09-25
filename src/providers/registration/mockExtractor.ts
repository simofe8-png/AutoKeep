import {
  parseExtraction,
  type ExtractorOutcome,
  type RegistrationExtractor,
} from '@/identification/contract';

/**
 * MOCK registration extractor — clearly labeled, never a real integration (ADR-0004).
 * Returns a scripted raw provider response so the identification pipeline can be exercised end to
 * end. The raw response goes through the same schema validation a real provider's would.
 * Replaced by an approved OCR/AI provider in M11.
 */
export class MockRegistrationExtractor implements RegistrationExtractor {
  readonly id = 'mock-registration-extractor@1';

  /** `script` returns raw provider JSON, the string 'unreadable', or an Error to simulate failure. */
  constructor(private readonly script: () => unknown) {}

  async extract(): Promise<ExtractorOutcome> {
    const raw = this.script();
    if (raw === 'unreadable') return { status: 'unreadable', producedBy: this.id };
    if (raw instanceof Error) return { status: 'error', message: raw.message, producedBy: this.id };
    const output = parseExtraction(raw);
    return output
      ? { status: 'ok', output, producedBy: this.id }
      : { status: 'unreadable', producedBy: this.id };
  }
}
