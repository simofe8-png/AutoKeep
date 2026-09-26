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
  /** Raw bytes of a stored original (for the encrypted-in-transit cloud backup). */
  readBytes(storageKey: string): Promise<Uint8Array>;
  /** Restores an original under its key (e.g. downloaded from the account's private backup). */
  writeBytes(storageKey: string, bytes: Uint8Array): Promise<void>;
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

export function toHex(buf: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Deterministic 64-hex digest for the in-memory test store (NOT cryptographic). */
function testDigest(bytes: Uint8Array): string {
  let h = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  bytes.forEach((b, i) => {
    const k = i % 4;
    h[k] = Math.imul(h[k] ^ b, 16777619) >>> 0;
  });
  h = h.map((x, i) => Math.imul(x ^ (bytes.length + i), 2246822507) >>> 0);
  return h
    .map((x) => x.toString(16).padStart(8, '0'))
    .join('')
    .repeat(2);
}

/** In-memory store for tests: real bytes (the file URI's text), digest recomputed on verify. */
export class MemoryFileStore implements OriginalFileStore {
  readonly files = new Map<string, { bytes: Uint8Array; mimeType: string }>();
  failNext = false;
  private n = 0;

  async importFile(file: AcquiredFile): Promise<StoredOriginal> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('storage full');
    }
    this.n += 1;
    const key = `originals/test-${this.n}-${Math.random().toString(36).slice(2, 8)}.${extensionFor(file.mimeType)}`;
    const bytes = new TextEncoder().encode(`original:${file.uri}`);
    this.files.set(key, { bytes, mimeType: file.mimeType });
    return {
      storageKey: key,
      mimeType: file.mimeType,
      sizeBytes: bytes.length,
      sha256: testDigest(bytes),
    };
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
    if (f) this.files.set(storageKey, { ...f, bytes: new Uint8Array([...f.bytes, 0x21]) });
  }

  async verify(storageKey: string, sha256: string): Promise<Integrity> {
    const f = this.files.get(storageKey);
    if (!f) return 'missing';
    return testDigest(f.bytes) === sha256 ? 'intact' : 'modified';
  }

  readonly opened: string[] = [];
  async open(storageKey: string): Promise<boolean> {
    if (!this.files.has(storageKey)) return false;
    this.opened.push(storageKey);
    return true;
  }

  async readBytes(storageKey: string): Promise<Uint8Array> {
    const f = this.files.get(storageKey);
    if (!f) throw new Error('missing');
    return f.bytes;
  }

  async writeBytes(storageKey: string, bytes: Uint8Array): Promise<void> {
    this.files.set(storageKey, { bytes, mimeType: 'application/octet-stream' });
  }
}
