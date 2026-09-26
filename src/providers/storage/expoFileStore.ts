import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import type { AcquiredFile } from '@/providers/acquisition/types';

import {
  extensionFor,
  toHex,
  type Integrity,
  type OriginalFileStore,
  type StoredOriginal,
} from './types';

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
    let step = 'prepare';
    try {
      const target = new File(dir(), name);
      step = 'copy';
      try {
        await new File(file.uri).copy(target);
      } catch {
        // Expo Go scopes the new API's read access; the picker's cache copy may lie outside it
        // (device-verified "Missing 'READ' permission"). The legacy copy has no such scoping.
        await LegacyFileSystem.copyAsync({ from: file.uri, to: target.uri });
      }
      step = 'read';
      const bytes = await target.bytes();
      if (bytes.length === 0) {
        target.delete();
        throw new Error('Empty file');
      }
      step = 'hash';
      const sha256 = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
      return {
        storageKey: `${ROOT}/${name}`,
        mimeType: file.mimeType,
        sizeBytes: bytes.length,
        sha256,
      };
    } catch (e) {
      // Name the failing step: native rejections can carry no message at all.
      throw new Error(`importFile/${step}: ${e instanceof Error ? e.message : String(e)}`);
    }
  },

  uriFor(storageKey: string) {
    return new File(Paths.document, storageKey).uri;
  },

  async remove(storageKey: string) {
    const f = new File(Paths.document, storageKey);
    if (f.exists) f.delete();
  },

  async verify(storageKey: string, sha256: string): Promise<Integrity> {
    const f = new File(Paths.document, storageKey);
    if (!f.exists) return 'missing';
    const hash = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, await f.bytes()));
    return hash === sha256 ? 'intact' : 'modified';
  },

  async open(storageKey: string, mimeType: string): Promise<boolean> {
    const f = new File(Paths.document, storageKey);
    if (!f.exists || !(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: '' });
    return true;
  },
};
