import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { BackupCrypto } from '@/persistence/backup/backup';
import { toHex } from '@/providers/storage/types';

import type { BackupFiles, SaveOutcome } from './types';

const MIME = 'application/json';
/** Cache folder holding the last shared backup copy. */
const SHARE_DIR = 'backup-share';

export const expoBackupCrypto: BackupCrypto = {
  async sha256(bytes) {
    return toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
  },
};

/**
 * Where the user keeps a backup file. Everything goes through system pickers and the share sheet:
 * the user chooses the folder, Google Drive or another app; AutoKeep has no storage of its own.
 */
export const expoBackupFiles: BackupFiles = {
  canSaveToFolder: Platform.OS === 'android',

  async saveToFolder(text, fileName): Promise<SaveOutcome> {
    const saf = LegacyFileSystem.StorageAccessFramework;
    const permission = await saf.requestDirectoryPermissionsAsync();
    if (!permission.granted) return 'cancelled';
    try {
      const uri = await saf.createFileAsync(
        permission.directoryUri,
        fileName.replace(/\.json$/, ''),
        MIME,
      );
      await saf.writeAsStringAsync(uri, text);
      return 'saved';
    } catch {
      return 'failed';
    }
  },

  async share(text, fileName): Promise<SaveOutcome> {
    if (!(await Sharing.isAvailableAsync())) return 'failed';
    // Android's chooser returns as soon as a target is picked, while the target (e.g. Drive) may
    // still be reading the file: the copy stays until the next share replaces it. It lives in the
    // app's private cache.
    const dir = new Directory(Paths.cache, SHARE_DIR);
    try {
      if (dir.exists) dir.delete();
      dir.create({ intermediates: true });
      const file = new File(dir, fileName);
      file.create();
      file.write(text);
      await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: fileName });
      return 'saved';
    } catch {
      return 'failed';
    }
  },

  async pick(): Promise<string | null> {
    // The picker's own cache copy can land outside this app's scoped storage (device-verified in
    // Expo Go, as in expoAcquisition), so take the content URI and copy it into our cache.
    const r = await DocumentPicker.getDocumentAsync({
      type: [MIME, 'application/octet-stream', '*/*'],
      copyToCacheDirectory: false,
      multiple: false,
    });
    if (r.canceled || !r.assets?.[0]) return null;
    const file = new File(Paths.cache, 'backup-restore.json');
    try {
      if (file.exists) file.delete();
      await LegacyFileSystem.copyAsync({ from: r.assets[0].uri, to: file.uri });
      return await file.text();
    } finally {
      try {
        if (file.exists) file.delete();
      } catch {
        // Best effort.
      }
    }
  },
};
