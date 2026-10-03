import * as Crypto from 'expo-crypto';

import { SOURCE_SYSTEMS } from '@/discovery/maintenance/registry/israelSources';
import { toHex } from '@/providers/storage/types';

import { catalogFor } from './catalog';
import { MSOURCE_CATALOG_VERSION } from './catalogData';
import { uploadPdfReader } from './pdfBridge';
import type { MSourceHost } from './service';

/**
 * The phone's M-SOURCE host: guarded HTTPS through the platform fetch (the guard re-checks the
 * final URL, since React Native follows redirects internally), SHA-256 via expo-crypto, the
 * Israeli source registry, and the class-level catalog published by the worker host. No
 * research assistant on the device; PDFs are read on the device only for the owner's own uploads.
 */
export function deviceMSourceHost(): MSourceHost {
  return {
    net: {
      fetch: (url, init) => fetch(url, init),
      userAgent: 'AutoKeepBot/1.0 (+maintenance schedule research; robots.txt respected)',
    },
    sha256: async (b) =>
      toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(b))),
    registry: SOURCE_SYSTEMS,
    catalog: catalogFor,
    catalogVersion: MSOURCE_CATALOG_VERSION,
    research: null,
    // The owner's own PDFs only, read on the device (WebView pdf.js, no network).
    uploadPdf: uploadPdfReader(),
  };
}
