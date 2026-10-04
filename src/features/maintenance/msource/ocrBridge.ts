import type { TextReader } from '@/discovery/maintenance/types';

import { PdfBridge } from './pdfBridge';

/**
 * Bridge to the on-device booklet-photo reader (OCR, owner decision 2026-10-04): Tesseract with the
 * Hebrew and English models inside a hidden WebView (assets/ocr/ocr-reader.html, no network). Same
 * protocol and reply validation as the PDF reader; reading a photo takes longer.
 */
export const ocrBridge = new PdfBridge({
  readyTimeoutMs: 30_000,
  readTimeoutMs: 180_000,
  maxBytes: 20 * 1024 * 1024,
});

/** TextReader over the bridge (the owner's booklet photos only). */
export function photoReader(bridge: PdfBridge = ocrBridge): TextReader {
  return { read: (doc) => bridge.read(doc.bytes) };
}
