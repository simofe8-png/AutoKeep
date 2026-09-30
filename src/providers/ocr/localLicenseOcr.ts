import { requireOptionalNativeModule } from 'expo';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import type { OcrTextLine } from '@/identification/plateCandidates';

/**
 * On-device license OCR: Tesseract 5 in the local native module `modules/license-ocr`. The image
 * and the recognized text never leave the device; nothing here logs, stores or uploads them.
 * Unavailable (null) in Expo Go and tests, where no native module exists — the flow then offers
 * manual plate entry only.
 */
export interface OcrPass {
  /** Preprocessing and segmentation of this digits-only reading, e.g. "otsu:line". */
  pass: string;
  lines: OcrTextLine[];
}

export interface LicenseOcrResult {
  /** Labelled reading (heb+eng): gives the "מספר רכב" label context. */
  lines: OcrTextLine[];
  /** Independent digits-only readings of preprocessed versions of the image (for voting). */
  digitPasses: OcrPass[];
  /** Tesseract mean word confidence of the labelled reading, 0–100. */
  meanConfidence: number;
  /** Rotation that produced the best labelled reading (0 / 90 / 270). */
  rotation: number;
  /** On-device recognition time in milliseconds. */
  ms: number;
}

export interface LicenseOcr {
  readonly id: string;
  recognize(uri: string): Promise<LicenseOcrResult>;
}

interface NativeLicenseOcr {
  recognize(uri: string, languages: string): Promise<LicenseOcrResult>;
}

export function localLicenseOcr(): LicenseOcr | null {
  const native = requireOptionalNativeModule<NativeLicenseOcr>('LicenseOcr');
  if (!native) return null;
  return {
    id: 'tesseract4android@4.9.0 (tesseract 5.5.1, on-device)',
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
