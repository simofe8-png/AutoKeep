import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import type { AcquiredFile } from '@/providers/acquisition/types';

import { extensionFor, toHex, type OriginalFileStore, type StoredOriginal } from './types';

/** Originals live in the app's private document directory (not the cache: they must persist). */
const ROOT = 'originals';

function dir(): Directory {
  const d = new Directory(Paths.document, ROOT);
  if (!d.exists) d.create({ intermediates: true });
  return d;
}

export const expoFileStore: OriginalFileStore = {
  async importFile(file: AcquiredFile): Promise<StoredOriginal> {
    const name = `${Crypto.randomUUID()}.${extensionFor(file.mimeType)}`;
    const target = new File(dir(), name);
    await new File(file.uri).copy(target);
    const bytes = await target.bytes();
    if (bytes.length === 0) {
      target.delete();
      throw new Error('Empty file');
    }
    const sha256 = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
    return {
      storageKey: `${ROOT}/${name}`,
      mimeType: file.mimeType,
      sizeBytes: bytes.length,
      sha256,
    };
  },

  uriFor(storageKey: string) {
    return new File(Paths.document, storageKey).uri;
  },

  async remove(storageKey: string) {
    const f = new File(Paths.document, storageKey);
    if (f.exists) f.delete();
  },
};
