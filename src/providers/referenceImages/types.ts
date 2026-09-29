/**
 * Approved vehicle MODEL reference images (owner decisions 2026-09-29). The catalog holds only
 * images whose rights were verified (license, attribution, modification permission); the full
 * provenance record is stored server-side, independently of the binary. Lookups send only class
 * keys (make/model/generation/phase/body/color) — never a plate, VIN or user identity.
 */
export interface ReferenceImageRecord {
  id: string;
  classKey: string;
  /** Public URL of the approved binary in AutoKeep-controlled storage. */
  imageUrl: string;
  imageSha256: string;
  width: number;
  height: number;
  /** "תמונת דגם להמחשה". */
  label: string;
  /** Attribution line as required by the license. */
  credit: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  author: string;
  modificationNotice?: string;
}

export type CatalogLookup =
  | { status: 'ok'; records: ReferenceImageRecord[] }
  /** Connectivity / service failure — NOT "no image exists". */
  | { status: 'unavailable' };

export type ImageFetch = { status: 'ok'; uri: string } | { status: 'unavailable' };

export interface ReferenceImageCatalog {
  /** Approved records whose class key starts with any of the given prefixes. */
  lookup(prefixes: readonly string[]): Promise<CatalogLookup>;
  /** Local (cached, hash-verified) copy of the record's binary. */
  fetchImage(record: ReferenceImageRecord): Promise<ImageFetch>;
}
