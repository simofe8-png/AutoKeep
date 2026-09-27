import {
  issue,
  newMeta,
  validate,
  type DocumentId,
  type EntityMeta,
  type ExtractionId,
  type IdGenerator,
  type Result,
  type SourceId,
  type Timestamp,
  type VehicleId,
} from './core';
import type { SourceAuthority, VerificationRecord } from './provenance';

/**
 * Documents, sources and derived extractions (T040). Invariant 6: originals stay distinct from
 * OCR/AI-derived representations — an extraction never modifies its document.
 */

export type DocumentKind =
  'owners_manual' | 'maintenance_schedule' | 'invoice' | 'registration' | 'other';

export type DocumentOrigin = 'user_upload' | 'camera_scan' | 'source_discovery';

/** Immutable description of the original file. */
export interface OriginalFile {
  /** Opaque storage key (local file / private bucket object); never a public URL. */
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  pageCount?: number;
}

export interface VehicleDocument extends EntityMeta {
  id: DocumentId;
  vehicleId: VehicleId;
  kind: DocumentKind;
  title: string;
  origin: DocumentOrigin;
  authority: SourceAuthority;
  original: OriginalFile;
  verification: VerificationRecord | null;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
] as const;
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
/** Photos of invoices/licenses stay far below this; the server enforces the same limit (P2A). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/** Per-type size limit: PDFs (owner's manuals) up to 50 MB, images up to 15 MB. */
export function maxBytesFor(mimeType: string): number {
  return mimeType.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;
}

export interface NewDocumentInput {
  vehicleId: VehicleId;
  kind: DocumentKind;
  title: string;
  origin: DocumentOrigin;
  authority: SourceAuthority;
  original: OriginalFile;
}

export function createDocument(
  input: NewDocumentInput,
  ids: IdGenerator,
  now: Timestamp,
): Result<VehicleDocument> {
  const { original } = input;
  return validate(
    [
      !input.title.trim() && issue('document.title', 'Title is required', 'title'),
      !(ALLOWED_MIME_TYPES as readonly string[]).includes(original.mimeType) &&
        issue('document.mime', 'Unsupported file type', 'mimeType'),
      (original.sizeBytes <= 0 || original.sizeBytes > maxBytesFor(original.mimeType)) &&
        issue('document.size', 'File size is out of range', 'sizeBytes'),
      !/^[0-9a-f]{64}$/.test(original.sha256) &&
        issue('document.hash', 'Invalid content hash', 'sha256'),
      /^https?:/i.test(original.storageKey) &&
        issue('document.publicUrl', 'Originals must not be referenced by public URL', 'storageKey'),
      // A user cannot upload something and have it count as manufacturer evidence by assertion.
      input.origin !== 'source_discovery' &&
        (input.authority === 'manufacturer' || input.authority === 'official_importer') &&
        issue(
          'document.authority',
          'Official authority requires source discovery provenance',
          'authority',
        ),
    ],
    () => ({
      id: ids.next<'Document'>(),
      vehicleId: input.vehicleId,
      kind: input.kind,
      title: input.title.trim(),
      origin: input.origin,
      authority: input.authority,
      original: { ...original },
      verification: null,
      ...newMeta(now),
    }),
  );
}

// ---------- Sources (T040) ----------

export interface Source extends EntityMeta {
  id: SourceId;
  authority: SourceAuthority;
  title: string;
  publisher: string;
  /** Where it was retrieved from (for provenance), not a way to serve user files. */
  retrievedFrom?: string;
  /** Publication edition/version of the source document. */
  edition?: string;
  retrievedAt?: Timestamp;
  documentId?: DocumentId;
}

// ---------- Derived extraction (OCR/AI output; never authoritative on its own) ----------

export type ExtractionKind = 'registration' | 'maintenance_schedule' | 'invoice';
export type ExtractionStatus = 'draft' | 'validated' | 'partial' | 'rejected' | 'failed';

export interface DerivedExtraction extends EntityMeta {
  id: ExtractionId;
  documentId: DocumentId;
  vehicleId: VehicleId;
  kind: ExtractionKind;
  status: ExtractionStatus;
  /** Provider-independent label, e.g. "mock-ocr@1" — for audit, not for trust. */
  producedBy: string;
  /** Schema-validated structured payload (see M11). */
  payload: unknown;
  /** Field paths the extractor was not confident about. */
  uncertainFields: string[];
}

export function createExtraction(
  input: Omit<DerivedExtraction, 'id' | keyof EntityMeta>,
  ids: IdGenerator,
  now: Timestamp,
): DerivedExtraction {
  return {
    ...input,
    uncertainFields: [...input.uncertainFields],
    id: ids.next<'Extraction'>(),
    ...newMeta(now),
  };
}
