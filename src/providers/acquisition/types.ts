/**
 * Camera / file acquisition boundary (T051). Provider-independent: UI and identification logic
 * depend on this interface only. Acquired files are untrusted input (SECURITY.md).
 */

export interface AcquiredFile {
  /** Local, app-private URI (cache directory). Never a public URL. */
  uri: string;
  mimeType: string;
  sizeBytes: number | null;
  width?: number;
  height?: number;
  source: 'camera' | 'library' | 'file';
}

export type AcquisitionResult =
  | { status: 'acquired'; file: AcquiredFile }
  | { status: 'cancelled' }
  | { status: 'permission_denied' }
  | { status: 'rejected'; reason: 'unsupported_type' | 'too_large' | 'empty' }
  | { status: 'error'; message: string };

export interface CaptureOptions {
  /** Let the user crop the image (system cropper) — e.g. to the plate-number line of a license. */
  crop?: boolean;
}

export interface AcquisitionProvider {
  captureWithCamera(options?: CaptureOptions): Promise<AcquisitionResult>;
  pickImage(options?: CaptureOptions): Promise<AcquisitionResult>;
  pickDocument(): Promise<AcquisitionResult>;
}

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic'] as const;
export const ACCEPTED_DOCUMENT_TYPES = [...ACCEPTED_IMAGE_TYPES, 'application/pdf'] as const;
export const MAX_ACQUIRED_BYTES = 50 * 1024 * 1024;
/** Same per-type limits as the domain and the server (P2A). */
export const MAX_ACQUIRED_IMAGE_BYTES = 15 * 1024 * 1024;

/** Validates an acquired file before any processing (type allow-list, size bound). */
export function screenAcquiredFile(
  file: AcquiredFile,
  accepted: readonly string[],
): AcquisitionResult {
  if (!accepted.includes(file.mimeType)) return { status: 'rejected', reason: 'unsupported_type' };
  if (file.sizeBytes !== null && file.sizeBytes <= 0)
    return { status: 'rejected', reason: 'empty' };
  const limit = file.mimeType.startsWith('image/') ? MAX_ACQUIRED_IMAGE_BYTES : MAX_ACQUIRED_BYTES;
  if (file.sizeBytes !== null && file.sizeBytes > limit) {
    return { status: 'rejected', reason: 'too_large' };
  }
  return { status: 'acquired', file };
}
