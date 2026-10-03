import { makeKey, makeLabel, normalizeModel } from '@/discovery/maintenance/msource/fingerprint';

import type { ReferenceImageRecord } from './types';

/**
 * General MODEL photo from Wikipedia / Wikimedia Commons (owner decision 2026-10-03, "checked
 * Wikimedia"). Free and open, used under its license: an image is accepted only when its Commons
 * metadata grants commercial use and adaptation (public domain, CC0, CC BY, CC BY-SA), and its
 * attribution is shown. It is a GENERAL model photo — the article's lead image may show another
 * generation, body or color — so it ranks below the user's photo and the approved references, and
 * is always labelled as such. Only make + model are sent: never a plate, VIN or user identity.
 */

export interface ModelPhotoQuery {
  /** Cache key of the model ("wm1/toyota/corolla"): no vehicle-specific data. */
  classKey: string;
  make: string;
  model: string;
}

export interface ModelPhotoRecord extends ReferenceImageRecord {
  articleTitle: string;
  retrievedAt: string;
}

export type ModelPhotoLookup =
  | { status: 'found'; record: ModelPhotoRecord }
  /** Nothing suitable (no article, no free image): remembered, not retried every time. */
  | { status: 'none'; reason: string }
  /** Network / service failure — NOT "no image exists". */
  | { status: 'unavailable'; reason: string };

const API = 'https://en.wikipedia.org/w/api.php';
/** Wikimedia's image hosts (thumbnails are currently served from thumb.wikimedia.org). */
export const IMAGE_HOSTS: readonly string[] = ['upload.wikimedia.org', 'thumb.wikimedia.org'];

/**
 * "https://thumb.wikimedia.org/a/b.jpg?utm_source=…" → "https://thumb.wikimedia.org/a/b.jpg"
 * when the URL is HTTPS on a Wikimedia image host; otherwise null. String-based (React Native's
 * URL implementation is incomplete). Tracking parameters are dropped; the image is the same.
 */
export function wikimediaImageUrl(raw: string): string | null {
  const m = /^https:\/\/([a-z0-9.-]+)(\/[^?#\s]*)/i.exec(raw);
  return m && IMAGE_HOSTS.includes(m[1].toLowerCase())
    ? `https://${m[1].toLowerCase()}${m[2]}`
    : null;
}

const THUMB_WIDTH = 800;

/** "טויוטה יפן" + "COROLLA" → { make: "Toyota", model: "Corolla" }; unknown make → null. */
export function modelPhotoQuery(manufacturer: string, model: string): ModelPhotoQuery | null {
  const key = makeKey(manufacturer);
  const m = normalizeModel(model ?? '');
  if (!key || !m || /[֐-׿]/.test(m)) return null;
  const slug = m
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) return null;
  return { classKey: `wm1/${key}/${slug}`, make: makeLabel(key), model: m };
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** A search hit is accepted only when its title names both the make and the model. */
export function plausibleTitle(title: string, q: Pick<ModelPhotoQuery, 'make' | 'model'>): boolean {
  const t = words(title);
  return words(q.make).every((w) => t.includes(w)) && words(q.model).every((w) => t.includes(w));
}

const text = (v: unknown) =>
  typeof v === 'string'
    ? v
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()
    : '';

type Meta = Record<string, { value?: unknown } | undefined>;

/**
 * License gate on Commons extmetadata: public domain, CC0, CC BY and CC BY-SA only. Non-free
 * (fair use), non-commercial (NC), no-derivatives (ND), unknown or missing → rejected.
 */
export function licenseVerdict(
  meta: Meta | undefined,
):
  | { ok: true; license: string; licenseUrl: string; author: string }
  | { ok: false; reason: string } {
  if (!meta) return { ok: false, reason: 'no license metadata' };
  if (/^true$/i.test(text(meta.NonFree?.value))) return { ok: false, reason: 'non-free' };
  const code = text(meta.License?.value).toLowerCase();
  const short = text(meta.LicenseShortName?.value);
  const label = `${code} ${short}`.toLowerCase();
  if (/\bnc\b|non-?commercial|\bnd\b|no-?deriv/.test(label.replace(/[-_]/g, ' ')))
    return { ok: false, reason: `restricted license (${short || code})` };
  const free =
    /^(pd|cc0|cc-zero|public domain)/.test(code) ||
    /^cc-by(-sa)?-\d/.test(code) ||
    /^(public domain|cc0|cc by(-sa)? \d)/i.test(short);
  if (!free) return { ok: false, reason: `unrecognized license (${short || code || 'none'})` };
  return {
    ok: true,
    license: short || code,
    licenseUrl: text(meta.LicenseUrl?.value),
    author: text(meta.Artist?.value) || text(meta.Credit?.value),
  };
}

type GetJson = (url: string) => Promise<unknown>;

const qs = (p: Record<string, string>) =>
  Object.entries(p)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

interface PageImage {
  title: string;
  fileName: string;
}

function pageImageOf(json: unknown, accept: (title: string) => boolean): PageImage | null {
  const pages = (json as { query?: { pages?: unknown[] } })?.query?.pages;
  if (!Array.isArray(pages)) return null;
  for (const p of pages as {
    title?: string;
    missing?: boolean;
    pageimage?: string;
    pageprops?: Record<string, unknown>;
  }[]) {
    if (!p || p.missing || !p.title || !p.pageimage) continue;
    if (p.pageprops && 'disambiguation' in p.pageprops) continue;
    if (!accept(p.title)) continue;
    return { title: p.title, fileName: p.pageimage };
  }
  return null;
}

/**
 * Two-step lookup: the article titled "<Make> <Model>" (redirects followed), else the first
 * search hit whose title names both; then the lead image's Commons file is license-checked.
 */
export async function lookupModelPhoto(
  q: ModelPhotoQuery,
  getJson: GetJson,
  now: () => string,
): Promise<ModelPhotoLookup> {
  const props = {
    action: 'query',
    format: 'json',
    formatversion: '2',
    redirects: '1',
    prop: 'pageimages|pageprops',
    piprop: 'name',
    origin: '*',
  };
  try {
    const name = `${q.make} ${q.model}`;
    let page = pageImageOf(await getJson(`${API}?${qs({ ...props, titles: name })}`), () => true);
    if (!page) {
      const hit = await getJson(
        `${API}?${qs({ ...props, generator: 'search', gsrsearch: name, gsrlimit: '1', gsrnamespace: '0' })}`,
      );
      page = pageImageOf(hit, (t) => plausibleTitle(t, q));
    }
    if (!page) return { status: 'none', reason: 'no article with a lead image' };
    const info = await getJson(
      `${API}?${qs({
        action: 'query',
        format: 'json',
        formatversion: '2',
        prop: 'imageinfo',
        iiprop: 'url|extmetadata|mime',
        iiurlwidth: String(THUMB_WIDTH),
        titles: `File:${page.fileName}`,
        origin: '*',
      })}`,
    );
    const file = (
      info as {
        query?: {
          pages?: {
            imageinfo?: {
              thumburl?: string;
              thumbwidth?: number;
              thumbheight?: number;
              descriptionurl?: string;
              mime?: string;
              extmetadata?: Meta;
            }[];
          }[];
        };
      }
    )?.query?.pages?.[0]?.imageinfo?.[0];
    if (!file?.thumburl || !/^image\/(jpeg|png|webp)$/.test(file.mime ?? '')) {
      return { status: 'none', reason: `no usable image (${file?.mime ?? 'no file info'})` };
    }
    const imageUrl = wikimediaImageUrl(file.thumburl);
    if (!imageUrl) return { status: 'none', reason: 'image host not allowed' };
    const lic = licenseVerdict(file.extmetadata);
    if (!lic.ok) return { status: 'none', reason: lic.reason };
    const sourceUrl =
      file.descriptionurl && file.descriptionurl.startsWith('https://')
        ? file.descriptionurl
        : `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(page.fileName)}`;
    return {
      status: 'found',
      record: {
        id: `wm:${page.fileName}`,
        classKey: q.classKey,
        imageUrl,
        // Not a pinned binary: the thumbnail is fetched once and cached (see the image store).
        imageSha256: '',
        width: file.thumbwidth ?? THUMB_WIDTH,
        height: file.thumbheight ?? 0,
        label: 'general-model-photo',
        credit: [lic.author, lic.license, 'Wikimedia Commons'].filter(Boolean).join(' · '),
        sourceUrl,
        license: lic.license,
        licenseUrl: lic.licenseUrl,
        author: lic.author,
        articleTitle: page.title,
        retrievedAt: now(),
      },
    };
  } catch (e) {
    return { status: 'unavailable', reason: String((e as Error)?.message ?? e).slice(0, 120) };
  }
}
