import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import {
  ACCEPTED_DOCUMENT_TYPES,
  ACCEPTED_IMAGE_TYPES,
  screenAcquiredFile,
  type AcquisitionProvider,
  type AcquisitionResult,
} from './types';

function fromImageResult(
  r: ImagePicker.ImagePickerResult,
  source: 'camera' | 'library',
): AcquisitionResult {
  if (r.canceled || !r.assets?.[0]) return { status: 'cancelled' };
  const a = r.assets[0];
  return screenAcquiredFile(
    {
      uri: a.uri,
      mimeType: a.mimeType ?? 'image/jpeg',
      sizeBytes: a.fileSize ?? null,
      width: a.width,
      height: a.height,
      source,
    },
    ACCEPTED_IMAGE_TYPES,
  );
}

// No EXIF (location data) is requested: only the pixels needed for extraction (data minimization).
const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.85,
  exif: false,
  base64: false,
  allowsEditing: false,
};

/** expo-image-picker / expo-document-picker implementation (bundled in Expo Go). */
export const expoAcquisition: AcquisitionProvider = {
  async captureWithCamera() {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return { status: 'permission_denied' };
      return fromImageResult(await ImagePicker.launchCameraAsync(IMAGE_OPTIONS), 'camera');
    } catch (e) {
      return { status: 'error', message: String(e) };
    }
  },

  async pickImage() {
    try {
      // The system photo picker needs no broad media permission on modern Android.
      return fromImageResult(await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS), 'library');
    } catch (e) {
      return { status: 'error', message: String(e) };
    }
  },

  async pickDocument() {
    try {
      const r = await DocumentPicker.getDocumentAsync({
        type: [...ACCEPTED_DOCUMENT_TYPES],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (r.canceled || !r.assets?.[0]) return { status: 'cancelled' };
      const a = r.assets[0];
      return screenAcquiredFile(
        {
          uri: a.uri,
          mimeType: a.mimeType ?? 'application/octet-stream',
          sizeBytes: a.size ?? null,
          source: 'file',
        },
        ACCEPTED_DOCUMENT_TYPES,
      );
    } catch (e) {
      return { status: 'error', message: String(e) };
    }
  },
};
