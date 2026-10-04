import type { DocumentKind, SourceAuthority } from './types';

/**
 * Authority of a document the USER uploads (T122). An upload is never manufacturer or importer
 * evidence (only verified source discovery can be — domain rule): a manual or schedule uploaded
 * by the user stays a user report until an official source verifies it.
 */
export function uploadAuthority(
  kind: DocumentKind,
): Exclude<
  SourceAuthority,
  'manufacturer' | 'official_importer' | 'vehicle_document_edited' | 'technical_source'
> {
  switch (kind) {
    case 'invoice':
      return 'garage_document';
    case 'registration':
      return 'vehicle_document';
    default:
      return 'user_report';
  }
}
