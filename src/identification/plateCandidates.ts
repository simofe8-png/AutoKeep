import { parseRegistration, type RegistrationNumber } from '@/domain';

/**
 * Deterministic registration-number candidates from OCR lines of an Israeli vehicle license
 * (license scan). OCR is evidence, never authority: the user always confirms or corrects the
 * plate, and only then is the official registry consulted.
 *
 * Rules:
 * - a candidate has exactly 7 digits (2-3-2) or 8 digits (3-2-3);
 * - STRONG = printed in the canonical dashed grouping, on/next to a plate label, or read
 *   identically by ≥ 2 independent digits-only passes (voting);
 * - WEAK = a bare 7/8-digit run, or a run that needed a letter→digit correction;
 * - rejected: longer digit runs (e.g. a 9-digit ID number), dates, runs inside alphanumeric
 *   tokens (e.g. a VIN), and lines labelled as owner / ID / address data.
 * Exactly one strong plate → "single"; otherwise "ambiguous" (strong first); none → "none".
 */

export interface OcrTextLine {
  text: string;
  confidence: number;
}

export interface PlateCandidate {
  plate: RegistrationNumber;
  strength: 'strong' | 'weak';
  /** How many times this plate was seen (a license often prints it more than once). */
  occurrences: number;
}

export type PlateExtraction =
  | { kind: 'single'; plate: RegistrationNumber; candidates: PlateCandidate[] }
  | { kind: 'ambiguous'; candidates: PlateCandidate[] }
  | { kind: 'none' };

/** Plate labels as printed on the license (Hebrew OCR may drop the geresh / quotes). */
const PLATE_LABEL = /(מספר|מס['׳"]?|מס)\s*(ה?רכב|רישוי)|מספר\s*רישום/;
/** Lines that carry owner data: never a source of plate candidates. */
const PERSONAL_LABEL = /ת\s*[.״"']?\s*ז|זהות|בעל(ים|י)?\s*ה?רכב|שם\s*ה?בעל|כתובת|מען/;

/** One separator: a dash / dot / maqaf with optional spaces around it, or a single space. */
const SEP = '(?:\\s?[-.־]\\s?|\\s)';
const DASH_CANON = new RegExp(`^(\\d{2}${SEP}\\d{3}${SEP}\\d{2}|\\d{3}${SEP}\\d{2}${SEP}\\d{3})$`);
/** A run of digits/separators; letters commonly confused with digits are allowed in the middle. */
const RUN = new RegExp(
  `(?<![A-Za-z0-9/])[0-9OoIl|][0-9OoIl|]*(?:${SEP}[0-9OoIl|]+)*(?![A-Za-z0-9/])`,
  'g',
);

const FIX: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', '|': '1' };

type LineCandidate = PlateCandidate & { corrected: boolean };

function candidatesInLine(line: string, labelled: boolean): LineCandidate[] {
  const out: LineCandidate[] = [];
  for (const m of line.matchAll(RUN)) {
    const raw = m[0].replace(/\s+$/, '');
    const letters = raw.replace(/[^OoIl|]/g, '').length;
    const fixed = raw.replace(/[OoIl|]/g, (c) => FIX[c]);
    const digits = fixed.replace(/\D/g, '');
    if (digits.length !== 7 && digits.length !== 8) continue;
    // A correction is allowed only in an otherwise digit-dominated token (one character).
    if (letters > 1 || digits.length - letters < 6) continue;
    // Date-like runs ("12.03.2024") are not plates.
    if (/^\d{1,2}[.\s]\d{1,2}[.\s]\d{2,4}$/.test(fixed)) continue;
    const plate = parseRegistration(digits);
    if (!plate) continue;
    const compact = fixed.replace(/\s*([-.־])\s*/g, '$1');
    const canonical = DASH_CANON.test(compact) && /[-־]/.test(compact);
    const strong = letters === 0 && (canonical || labelled);
    out.push({
      plate,
      strength: strong ? 'strong' : 'weak',
      occurrences: 1,
      corrected: letters > 0,
    });
  }
  return out;
}

/** One independent digits-only reading (a preprocessing × segmentation pass). */
export interface DigitPass {
  pass: string;
  lines: readonly OcrTextLine[];
}

/** Independent passes that must agree before a bare digit run counts as strong. */
export const AGREEING_PASSES = 2;

export function extractPlateCandidates(
  lines: readonly OcrTextLine[],
  /**
   * Digits-only readings of independently preprocessed versions of the image. There are no labels
   * there, so a candidate is strong only in the canonical dashed format, or when at least
   * AGREEING_PASSES different passes read exactly the same number (voting).
   */
  digitPasses: readonly DigitPass[] = [],
): PlateExtraction {
  const found = new Map<string, PlateCandidate>();
  const passesOf = new Map<string, Set<string>>();
  const add = (c: LineCandidate, pass: string | null) => {
    const prev = found.get(c.plate);
    found.set(c.plate, {
      plate: c.plate,
      strength: prev?.strength === 'strong' || c.strength === 'strong' ? 'strong' : 'weak',
      occurrences: (prev?.occurrences ?? 0) + 1,
    });
    // Only an uncorrected reading votes (a letter→digit fix is a guess).
    if (pass && !c.corrected) {
      passesOf.set(c.plate, (passesOf.get(c.plate) ?? new Set()).add(pass));
    }
  };
  lines.forEach((l, i) => {
    if (PERSONAL_LABEL.test(l.text)) return;
    const labelled = PLATE_LABEL.test(l.text) || PLATE_LABEL.test(lines[i - 1]?.text ?? '');
    for (const c of candidatesInLine(l.text, labelled)) add(c, null);
  });
  for (const p of digitPasses) {
    for (const l of p.lines) for (const c of candidatesInLine(l.text, false)) add(c, p.pass);
  }
  // Voting: the same number from independent readings.
  for (const [plate, passes] of passesOf) {
    const c = found.get(plate)!;
    if (passes.size >= AGREEING_PASSES) found.set(plate, { ...c, strength: 'strong' });
  }
  const all = [...found.values()].sort(
    (a, b) =>
      (a.strength === b.strength ? 0 : a.strength === 'strong' ? -1 : 1) ||
      b.occurrences - a.occurrences,
  );
  if (all.length === 0) return { kind: 'none' };
  const strong = all.filter((c) => c.strength === 'strong');
  if (strong.length === 1) return { kind: 'single', plate: strong[0].plate, candidates: all };
  return { kind: 'ambiguous', candidates: all.slice(0, 4) };
}
