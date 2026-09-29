import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { AcquiredFile } from '@/providers/acquisition/types';

import {
  extensionFor,
  toHex,
  type Integrity,
  type OriginalFileStore,
  type StoredOriginal,
} from './types';

/** android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION. */
const FLAG_GRANT_READ_URI_PERMISSION = 1;

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

  async importBytes(bytes: Uint8Array, mimeType: string): Promise<StoredOriginal> {
    if (bytes.length === 0) throw new Error('Empty file');
    const name = `${Crypto.randomUUID()}.${extensionFor(mimeType)}`;
    const target = new File(dir(), name);
    target.create();
    target.write(bytes);
    const sha256 = toHex(
      await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)),
    );
    return { storageKey: `${ROOT}/${name}`, mimeType, sizeBytes: bytes.length, sha256 };
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

  async readBytes(storageKey: string): Promise<Uint8Array> {
    return new File(Paths.document, storageKey).bytes();
  },

  async writeBytes(storageKey: string, bytes: Uint8Array): Promise<void> {
    dir();
    const f = new File(Paths.document, storageKey);
    if (f.exists) f.delete();
    f.create();
    f.write(bytes);
  },

  /**
   * Opens the original directly in the device's viewer (Android ACTION_VIEW with a temporary
   * read grant on a content URI of the private file; nothing is copied or uploaded). Falls back
   * to the system share sheet when no viewer app handles the type.
   */
  async open(storageKey: string, mimeType: string): Promise<boolean> {
    const f = new File(Paths.document, storageKey);
    if (!f.exists) return false;
    if (Platform.OS === 'android') {
      try {
        const data = await LegacyFileSystem.getContentUriAsync(f.uri);
        // The promise settles only when the viewer returns, but a missing viewer rejects at
        // once: wait briefly for that, never for the user.
        const viewing = IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
          data,
          type: mimeType,
          flags: FLAG_GRANT_READ_URI_PERMISSION,
        }).then(
          () => 'launched' as const,
          () => 'failed' as const,
        );
        const outcome = await Promise.race([
          viewing,
          new Promise<'launched'>((r) => setTimeout(() => r('launched'), 1000)),
        ]);
        if (outcome === 'launched') return true;
      } catch {
        // No content URI: fall through to the share sheet.
      }
      // No viewer for this type: the share sheet still lets the user pick an app.
    }
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(f.uri, { mimeType, dialogTitle: '' });
    return true;
  },
};
