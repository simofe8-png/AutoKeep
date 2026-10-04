import * as Crypto from 'expo-crypto';

import { toHex } from '@/providers/storage/types';

import { uploadPdfReader } from './pdfBridge';
import type { OwnerDocumentsHost } from './service';

/**
 * The phone's host for reading the owner's own documents: SHA-256 via expo-crypto and the on-device
 * PDF reader (WebView pdf.js, no network).
 */
export function deviceOwnerDocumentsHost(): OwnerDocumentsHost {
  return {
    sha256: async (b) =>
      toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(b))),
    uploadPdf: uploadPdfReader(),
  };
}
