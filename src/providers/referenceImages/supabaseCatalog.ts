import type { SupabaseClient } from '@supabase/supabase-js';
import * as Crypto from 'expo-crypto';
import * as LegacyFileSystem from 'expo-file-system/legacy';

import type {
  CatalogLookup,
  ImageFetch,
  ReferenceImageCatalog,
  ReferenceImageRecord,
} from './types';

const BUCKET = 'vehicle-references';
const COLUMNS =
  'id, class_key, storage_path, image_sha256, width, height, label, credit, source_url, license, license_url, author, modification_notice';

interface Row {
  id: string;
  class_key: string;
  storage_path: string;
  image_sha256: string;
  width: number;
  height: number;
  label: string;
  credit: string;
  source_url: string;
  license: string;
  license_url: string;
  author: string;
  modification_notice: string | null;
}

/** Class keys contain only [a-z0-9-/]; anything else is refused before it reaches a query. */
const SAFE_PREFIX = /^v1(\/[a-z0-9-]+){0,6}\/?$/;

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Catalog in AutoKeep's Supabase project: table `vehicle_reference_images` (read-only for the
 * app) and the public bucket `vehicle-references`. Binaries are cached in app storage by their
 * SHA-256 (the licenses permit copying) and verified against the record before first use.
 */
export class SupabaseReferenceCatalog implements ReferenceImageCatalog {
  constructor(
    private readonly sb: SupabaseClient,
    private readonly cacheDir: string | null = LegacyFileSystem.documentDirectory
      ? `${LegacyFileSystem.documentDirectory}reference-images/`
      : null,
  ) {}

  async lookup(prefixes: readonly string[]): Promise<CatalogLookup> {
    if (prefixes.length === 0 || !prefixes.every((p) => SAFE_PREFIX.test(p))) {
      return { status: 'ok', records: [] };
    }
    try {
      const { data, error } = await this.sb
        .from('vehicle_reference_images')
        .select(COLUMNS)
        .eq('status', 'approved')
        .or(prefixes.map((p) => `class_key.like.${p}%`).join(','));
      if (error || !data) return this.fromIndex(prefixes);
      const records = (data as Row[]).map((r) => this.toRecord(r));
      await this.saveIndex(prefixes, records).catch(() => undefined);
      return { status: 'ok', records };
    } catch {
      return this.fromIndex(prefixes);
    }
  }

  /**
   * Offline: approved records seen before whose binary is already cached are still valid (the
   * approved image exists). Without them the result is "unavailable" — never "no image".
   */
  private async fromIndex(prefixes: readonly string[]): Promise<CatalogLookup> {
    const index = await this.readIndex();
    const known = prefixes.flatMap((p) => index[p] ?? []);
    const cached: ReferenceImageRecord[] = [];
    for (const r of known) {
      if (
        this.cacheDir &&
        (await LegacyFileSystem.getInfoAsync(`${this.cacheDir}${r.imageSha256}.png`)).exists
      ) {
        cached.push(r);
      }
    }
    return known.length > 0 && cached.length === known.length
      ? { status: 'ok', records: cached }
      : { status: 'unavailable' };
  }

  private async readIndex(): Promise<Record<string, ReferenceImageRecord[]>> {
    if (!this.cacheDir) return {};
    try {
      return JSON.parse(await LegacyFileSystem.readAsStringAsync(`${this.cacheDir}index.json`));
    } catch {
      return {};
    }
  }

  private async saveIndex(prefixes: readonly string[], records: ReferenceImageRecord[]) {
    if (!this.cacheDir) return;
    const index = await this.readIndex();
    for (const p of prefixes) index[p] = records.filter((r) => r.classKey.startsWith(p));
    await LegacyFileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
    await LegacyFileSystem.writeAsStringAsync(`${this.cacheDir}index.json`, JSON.stringify(index));
  }

  async fetchImage(record: ReferenceImageRecord): Promise<ImageFetch> {
    if (!this.cacheDir) return { status: 'unavailable' };
    const target = `${this.cacheDir}${record.imageSha256}.png`;
    try {
      if ((await LegacyFileSystem.getInfoAsync(target)).exists)
        return { status: 'ok', uri: target };
      await LegacyFileSystem.makeDirectoryAsync(this.cacheDir, { intermediates: true });
      const tmp = `${target}.part`;
      const r = await LegacyFileSystem.downloadAsync(record.imageUrl, tmp);
      if (r.status !== 200) {
        await LegacyFileSystem.deleteAsync(tmp, { idempotent: true });
        return { status: 'unavailable' };
      }
      // The binary must be exactly the approved one.
      const bytes = base64ToBytes(
        await LegacyFileSystem.readAsStringAsync(tmp, { encoding: 'base64' }),
      );
      const digest = hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));
      if (digest !== record.imageSha256) {
        await LegacyFileSystem.deleteAsync(tmp, { idempotent: true });
        return { status: 'unavailable' };
      }
      await LegacyFileSystem.moveAsync({ from: tmp, to: target });
      return { status: 'ok', uri: target };
    } catch {
      return { status: 'unavailable' };
    }
  }

  private toRecord(r: Row): ReferenceImageRecord {
    return {
      id: r.id,
      classKey: r.class_key,
      imageUrl: this.sb.storage.from(BUCKET).getPublicUrl(r.storage_path).data.publicUrl,
      imageSha256: r.image_sha256,
      width: r.width,
      height: r.height,
      label: r.label,
      credit: r.credit,
      sourceUrl: r.source_url,
      license: r.license,
      licenseUrl: r.license_url,
      author: r.author,
      modificationNotice: r.modification_notice ?? undefined,
    };
  }
}
