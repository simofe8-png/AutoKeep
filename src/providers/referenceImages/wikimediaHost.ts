import * as Crypto from 'expo-crypto';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import { wikimediaImageUrl } from './wikimedia';

/**
 * Device I/O for general model photos: JSON from the Wikipedia API and the thumbnail download,
 * each limited to its own host over HTTPS, with a timeout. Only make + model ever appear in a
 * request. Thumbnails are kept in app storage (`model-photos/`) so they show offline.
 */
export interface ModelPhotoHost {
  getJson: (url: string) => Promise<unknown>;
  download: (url: string) => Promise<string | null>;
  exists: (uri: string) => Promise<boolean>;
}

const API_PREFIX = 'https://en.wikipedia.org/w/api.php?';
const TIMEOUT_MS = 10_000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Wikimedia asks API clients to identify themselves. */
const HEADERS = { 'Api-User-Agent': 'AutoKeep/1.0 (vehicle model photo lookup)' };

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await work(ctl.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function wikimediaHost(
  cacheDir: string | null = LegacyFileSystem.documentDirectory
    ? `${LegacyFileSystem.documentDirectory}model-photos/`
    : null,
): ModelPhotoHost {
  return {
    getJson: (url) => {
      if (!url.startsWith(API_PREFIX)) return Promise.reject(new Error('host not allowed'));
      return withTimeout(async (signal) => {
        const r = await fetch(url, { headers: HEADERS, signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<unknown>;
      });
    },
    download: async (url) => {
      // Only a clean HTTPS URL on a Wikimedia image host (string checks: RN's URL is partial).
      if (!cacheDir || wikimediaImageUrl(url) !== url) return null;
      const name = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, url);
      const ext = /\.png$/i.test(url) ? 'png' : /\.webp$/i.test(url) ? 'webp' : 'jpg';
      const target = `${cacheDir}${name}.${ext}`;
      try {
        if ((await LegacyFileSystem.getInfoAsync(target)).exists) return target;
        await LegacyFileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
        const tmp = `${target}.part`;
        const r = await LegacyFileSystem.downloadAsync(url, tmp, { headers: HEADERS });
        const info = await LegacyFileSystem.getInfoAsync(tmp);
        const size = info.exists && 'size' in info ? (info.size ?? 0) : 0;
        if (r.status !== 200 || size === 0 || size > MAX_IMAGE_BYTES) {
          await LegacyFileSystem.deleteAsync(tmp, { idempotent: true });
          return null;
        }
        await LegacyFileSystem.moveAsync({ from: tmp, to: target });
        return target;
      } catch {
        return null;
      }
    },
    exists: async (uri) => (await LegacyFileSystem.getInfoAsync(uri)).exists,
  };
}
