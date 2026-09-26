import type { AcquiredFile } from '@/providers/acquisition/types';

/**
 * Original-file storage port (spec §13: the original file is retained). Files are copied into
 * app-private storage; the stored key is opaque (never a public URL) and the content hash is
 * computed from the stored bytes so the original can later be verified as unmodified.
 */
export interface StoredOriginal {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

/** Result of re-hashing a stored original against the hash recorded when it was imported. */
export type Integrity = 'intact' | 'modified' | 'missing';

export interface OriginalFileStore {
  importFile(file: AcquiredFile): Promise<StoredOriginal>;
  /** Local URI for viewing the original (app sandbox). */
  uriFor(storageKey: string): string;
  remove(storageKey: string): Promise<void>;
  verify(storageKey: string, sha256: string): Promise<Integrity>;
  /** Hands the original to the system viewer (share sheet); false if it cannot be opened. */
  open(storageKey: string, mimeType: string): Promise<boolean>;
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
};

export function extensionFor(mimeType: string): string {
  return EXT[mimeType] ?? 'bin';
}

export function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** In-memory store for tests (records imports; hash is derived from the uri, not real bytes). */
export class MemoryFileStore implements OriginalFileStore {
  readonly files = new Map<string, StoredOriginal>();
  failNext = false;
  private n = 0;

  async importFile(file: AcquiredFile): Promise<StoredOriginal> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('storage full');
    }
    this.n += 1;
    const key = `originals/test-${this.n}.${extensionFor(file.mimeType)}`;
    const hex = [...file.uri].map((c) => c.charCodeAt(0).toString(16)).join('');
    const stored = {
      storageKey: key,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes ?? 1,
      sha256: hex.padEnd(64, '0').slice(0, 64),
    };
    this.files.set(key, stored);
    return stored;
  }

  uriFor(storageKey: string) {
    return `memory://${storageKey}`;
  }

  async remove(storageKey: string) {
    this.files.delete(storageKey);
  }

  /** Simulates tampering with a stored original (tests). */
  corrupt(storageKey: string) {
    const f = this.files.get(storageKey);
    if (f) this.files.set(storageKey, { ...f, sha256: 'f'.repeat(64) });
  }

  async verify(storageKey: string, sha256: string): Promise<Integrity> {
    const f = this.files.get(storageKey);
    if (!f) return 'missing';
    return f.sha256 === sha256 ? 'intact' : 'modified';
  }

  readonly opened: string[] = [];
  async open(storageKey: string): Promise<boolean> {
    if (!this.files.has(storageKey)) return false;
    this.opened.push(storageKey);
    return true;
  }
}
