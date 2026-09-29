import type { VehicleIdentity } from './types';

/**
 * Vehicle ↔ source-metadata matching helpers (pure): model names as whole names, stated years,
 * URL templates. No per-model rule.
 */

export const compact = (s: string) => s.toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '');

export function modelSlugs(model: string): Record<string, string> {
  const lower = model.trim().toLowerCase();
  return {
    model: encodeURIComponent(model.trim()),
    modelSlug: compact(model),
    'model-slug': lower.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    model_slug: lower.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
  };
}

export function fillTemplate(t: string, v: VehicleIdentity, locale?: string): string {
  const vars: Record<string, string> = {
    ...modelSlugs(v.model),
    year: String(v.modelYear),
    locale: locale ?? '',
  };
  return t.replace(/\{([a-zA-Z_-]+)\}/g, (m, k: string) => vars[k] ?? m);
}

const YEAR = /\b(19[89]\d|20[0-4]\d)\b/g;

/**
 * Does a text name the vehicle's model — as a whole name, not as part of another one? Separators
 * are ignored ("MT-07" ~ "mt07", "C-HR" ~ "chr"); a token equal to the displacement ("PCX 125") is
 * optional; "sx250" or "jet14evo" never name "SX" or "Jet 14".
 */
export function namesModel(
  hay: string,
  v: Pick<VehicleIdentity, 'model' | 'displacementCc'>,
): boolean {
  const all = v.model
    .toLowerCase()
    .split(/[^a-z0-9֐-׿]+/)
    .filter(Boolean);
  if (!all.length) return false;
  const sep = '[\\s_.-]*';
  const body = all
    .map((t, i) => {
      const e = `${i === 0 ? '' : sep}${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`;
      const optional = v.displacementCc && /^\d+$/.test(t) && Number(t) === v.displacementCc;
      return optional ? `(?:${e})?` : e;
    })
    .join('');
  // Not followed by another number ("SX 250" is not "SX 125"), except a model year.
  const tail = '(?![a-z0-9])(?![\\s_.-]*(?!(?:19|20)\\d\\d(?!\\d))\\d)';
  return new RegExp(`(?<![a-z0-9])${body}${tail}`, 'i').test(hay.toLowerCase());
}

/** The model's letters appear but not as the model's whole name (e.g. "jet14evo" for "Jet 14"). */
export function nearMiss(
  hay: string,
  v: Pick<VehicleIdentity, 'model' | 'displacementCc'>,
): boolean {
  const core = v.model
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .filter((t) => !(v.displacementCc && Number(t) === v.displacementCc))
    .join('');
  return core.length >= 3 && compact(hay).includes(core);
}

/**
 * Does a link (its text + URL) name this vehicle? The model must appear (compacted); a stated
 * year or year range must include the vehicle's year. No year stated → kept (checked later).
 */
export function linkNamesVehicle(text: string, href: string, v: VehicleIdentity): boolean {
  let path = href;
  try {
    path = decodeURIComponent(new URL(href).pathname);
  } catch {
    // keep raw
  }
  const hay = `${text} ${path}`;
  if (!namesModel(hay, v)) return false;
  const range = /\b(19[89]\d|20[0-4]\d)\s*[-–—]\s*(19[89]\d|20[0-4]\d)\b/.exec(hay);
  if (range) return v.modelYear >= Number(range[1]) && v.modelYear <= Number(range[2]);
  const years = [...hay.matchAll(YEAR)].map((m) => Number(m[1]));
  return years.length === 0 || years.includes(v.modelYear);
}

/** Sitemaps often list http:// URLs of an https site: same-host links are upgraded to https. */
export function upgradeSameHost(href: string, page: string): string {
  try {
    const h = new URL(href);
    const p = new URL(page);
    if (h.protocol === 'http:' && p.protocol === 'https:' && h.hostname === p.hostname) {
      h.protocol = 'https:';
      return h.toString();
    }
  } catch {
    // keep as is
  }
  return href;
}
