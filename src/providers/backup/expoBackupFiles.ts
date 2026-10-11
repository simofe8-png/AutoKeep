import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { BackupCrypto } from '@/persistence/backup/backup';
import { toHex } from '@/providers/storage/types';

import type { BackupFiles, SaveOutcome } from './types';

const MIME = 'application/json';

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
    const file = new File(Paths.cache, fileName);
    try {
      if (file.exists) file.delete();
      file.create();
      file.write(text);
      await Sharing.shareAsync(file.uri, { mimeType: MIME, dialogTitle: fileName });
      return 'saved';
    } catch {
      return 'failed';
    } finally {
      // The share target has its own copy; the temporary file holds all user data.
      try {
        if (file.exists) file.delete();
      } catch {
        // Best effort: the cache directory is private to the app.
      }
    }
  },

  async pick(): Promise<string | null> {
    const r = await DocumentPicker.getDocumentAsync({
      type: [MIME, 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (r.canceled || !r.assets?.[0]) return null;
    const file = new File(r.assets[0].uri);
    try {
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
