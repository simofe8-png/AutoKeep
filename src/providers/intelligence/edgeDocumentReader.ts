import type { SupabaseClient } from '@supabase/supabase-js';

import type { OcrDocument, OcrProvider, StructuredExtractor } from '@/intelligence/ports';
import type { OriginalFileStore } from '@/providers/storage/types';

/**
 * Client adapter for the server-side `document-intelligence` function (ADR-0017). Implements the
 * provider-independent ports; the app still validates, grounds and flags everything it returns.
 * `not_configured` (no approved vendor yet) surfaces as a failure → "reading unavailable/failed".
 */

export class DocumentIntelligenceUnavailable extends Error {}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return globalThis.btoa(bin);
}

export function edgeDocumentReader(
  sb: SupabaseClient,
  readBytes: (uri: string) => Promise<Uint8Array>,
): { ocr: OcrProvider; extractor: StructuredExtractor } {
  const invoke = async (body: Record<string, unknown>) => {
    const { data, error } = await sb.functions.invoke('document-intelligence', { body });
    if (error) throw new DocumentIntelligenceUnavailable(error.message);
    return data as Record<string, unknown>;
  };
  return {
    ocr: {
      id: 'edge:document-intelligence',
      async recognize(doc) {
        const data = await invoke({
          task: 'ocr',
          mimeType: doc.mimeType,
          dataBase64: toBase64(await readBytes(doc.uri)),
        });
        return { pages: (data.pages ?? []) as OcrDocument['pages'], producedBy: 'edge' };
      },
    },
    extractor: {
      id: 'edge:document-intelligence',
      async extract(task, content) {
        const data = await invoke({
          task: 'extract',
          kind: task,
          boundary: content.boundary,
          pages: content.pages,
        });
        return data.proposal;
      },
    },
  };
}

/** Reads an original by its app URI through the file store (for OCR upload). */
export function fileStoreBytes(files: OriginalFileStore) {
  return async (uri: string) => {
    const key = uri.slice(uri.indexOf('originals/'));
    return files.readBytes(key);
  };
}
