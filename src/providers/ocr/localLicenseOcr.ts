import { requireOptionalNativeModule } from 'expo';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import type { OcrTextLine } from '@/identification/plateCandidates';

/**
 * On-device license OCR (POC, owner decision 2026-09-28; DEFERRED 2026-09-29): Tesseract 5 in the local native module
 * `modules/license-ocr`. The image and the recognized text never leave the device; nothing here
 * logs, stores or uploads them. Unavailable (null) in Expo Go and tests, where no native module
 * exists — the flow then falls back to manual plate entry.
 */
export interface LicenseOcrResult {
  lines: OcrTextLine[];
  /** Second pass restricted to digits and dashes (plate digits on photographed cards). */
  digitLines: OcrTextLine[];
  /** Tesseract mean word confidence, 0–100. */
  meanConfidence: number;
  /** Rotation that produced the best result (0 / 90 / 270). */
  rotation: number;
  width: number;
  height: number;
  /** On-device recognition time in milliseconds (decode + OCR). */
  ms: number;
}

export interface LicenseOcr {
  readonly id: string;
  recognize(uri: string): Promise<LicenseOcrResult>;
}

interface NativeLicenseOcr {
  recognize(uri: string, languages: string): Promise<LicenseOcrResult>;
}

/**
 * License OCR is DEFERRED (owner decision 2026-09-29): the real-license test on the Galaxy A54 did
 * not give acceptable recognition. The native module and the research stay for a future
 * investigation, but the reader is enabled only in a measurement build made with
 * EXPO_PUBLIC_OCR_POC=1. Normal builds get null, so the license scan is not offered.
 */
export const LICENSE_OCR_POC_BUILD = process.env.EXPO_PUBLIC_OCR_POC === '1';

export function localLicenseOcr(enabled = LICENSE_OCR_POC_BUILD): LicenseOcr | null {
  if (!enabled) return null;
  const native = requireOptionalNativeModule<NativeLicenseOcr>('LicenseOcr');
  if (!native) return null;
  return {
    id: 'tesseract4android@4.9.0 (tesseract 5.5.1, heb+eng, on-device)',
    recognize: (uri) => native.recognize(uri, 'heb+eng'),
  };
}

/**
 * Deletes a captured image once it is no longer needed — only inside this app's cache (the
 * picker/camera copy), never a file elsewhere (e.g. the user's gallery original).
 */
export async function discardCapturedImage(uri: string): Promise<boolean> {
  const cache = LegacyFileSystem.cacheDirectory;
  if (!cache || !uri.startsWith(cache)) return false;
  await LegacyFileSystem.deleteAsync(uri, { idempotent: true });
  return !(await LegacyFileSystem.getInfoAsync(uri)).exists;
}
