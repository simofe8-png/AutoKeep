import type { OcrTextLine } from './plateCandidates';

/**
 * License-scan POC measurements. Answers "what did on-device OCR actually read?" WITHOUT exposing
 * the recognized text: only counts and yes/no matches against the authoritative registry values
 * are produced. The OCR lines themselves are discarded by the caller right after this runs.
 */

const HEBREW = /[֐-׿]/;
const LATIN_OR_DIGIT = /[A-Za-z0-9]/;
/** Printed labels expected on an Israeli vehicle license (Hebrew-recognition usefulness). */
const LICENSE_LABELS = [
  'רישיון',
  'רכב',
  'תוקף',
  'דגם',
  'צבע',
  'שלדה',
  'מנוע',
  'דלק',
  'ייצור',
  'תוצר',
];

export interface OcrTextProbe {
  lines: number;
  hebrewLines: number;
  latinOrDigitLines: number;
  /** How many of the expected Hebrew labels were recognized. */
  labelsFound: number;
  labelsTotal: number;
}

export function probeText(lines: readonly OcrTextLine[]): OcrTextProbe {
  const all = lines.map((l) => l.text).join('\n');
  return {
    lines: lines.length,
    hebrewLines: lines.filter((l) => HEBREW.test(l.text)).length,
    latinOrDigitLines: lines.filter((l) => LATIN_OR_DIGIT.test(l.text)).length,
    labelsFound: LICENSE_LABELS.filter((w) => all.includes(w)).length,
    labelsTotal: LICENSE_LABELS.length,
  };
}

export type ProbeField =
  'manufacturer' | 'model' | 'year' | 'trim' | 'engineCode' | 'color' | 'fuel' | 'vin';
const FIELDS: readonly ProbeField[] = [
  'manufacturer',
  'model',
  'year',
  'trim',
  'engineCode',
  'color',
  'fuel',
  'vin',
];

const squash = (s: string) => s.toUpperCase().replace(/[\s\-.'"״׳]/g, '');

/**
 * For each field the registry supplied: was the same value present in the OCR text?
 * null = the registry has no value to compare with.
 */
export function probeAgainstRegistry(
  lines: readonly OcrTextLine[],
  registry: Partial<Record<ProbeField, string | number>>,
): Record<ProbeField, boolean | null> {
  const text = squash(lines.map((l) => l.text).join(' '));
  const out = {} as Record<ProbeField, boolean | null>;
  for (const f of FIELDS) {
    const v = registry[f];
    if (v === undefined || v === '') {
      out[f] = null;
      continue;
    }
    const value = squash(String(v));
    // Manufacturer names in the registry may carry the country ("סיאט ספרד"): the first word counts.
    const first = f === 'manufacturer' ? squash(String(v).split(/\s+/)[0]) : value;
    out[f] =
      value.length > 0 && (text.includes(value) || (first.length > 1 && text.includes(first)));
  }
  return out;
}
