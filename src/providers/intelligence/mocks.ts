import type {
  ExtractionTask,
  OcrDocument,
  OcrProvider,
  StructuredExtractor,
  UntrustedContent,
} from '@/intelligence/ports';

/**
 * MOCK OCR / AI providers — clearly labeled, never real integrations (G1: no runtime AI provider
 * chosen or purchased). Scripted outputs exercise the full pipeline, including failures.
 */
export class MockOcrProvider implements OcrProvider {
  readonly id = 'mock-ocr@1';
  constructor(private readonly script: () => OcrDocument | Error) {}
  async recognize(): Promise<OcrDocument> {
    const r = this.script();
    if (r instanceof Error) throw r;
    return { ...r, producedBy: this.id };
  }
}

export class MockStructuredExtractor implements StructuredExtractor {
  readonly id = 'mock-extractor@1';
  /** Last content received — lets tests assert that only wrapped, sanitized data was passed. */
  lastContent: UntrustedContent | null = null;
  constructor(
    private readonly script: (task: ExtractionTask, content: UntrustedContent) => unknown,
  ) {}
  async extract(task: ExtractionTask, content: UntrustedContent): Promise<unknown> {
    this.lastContent = content;
    const r = this.script(task, content);
    if (r instanceof Error) throw r;
    return r;
  }
}
