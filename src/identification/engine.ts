import {
  parseRegistration,
  parseVin,
  type NewVehicleInput,
  type ProfileId,
  type VehicleIdentity,
  type VehicleType,
} from '@/domain';

import type { RegistrationExtraction, RegistrationField } from './contract';

// ---------- Confidence (T054) ----------

/** At or above: accepted as read. Between: shown but flagged for the user to check. Below: missing. */
export const CONFIDENCE_ACCEPT = 0.9;
export const CONFIDENCE_MIN = 0.6;

export type FieldOrigin = 'scan' | 'user' | 'catalog';

export interface DraftValue {
  value: string;
  origin: FieldOrigin;
  confidence: number | null;
  /** Needs the user's attention before confirmation. */
  uncertain: boolean;
}

export type DraftField = Exclude<RegistrationField, 'vehicleCategory'> | 'type';

export type IdentificationDraft = Partial<Record<DraftField, DraftValue>>;

// ---------- Vehicle type recognition (T053) ----------

export type TypeRecognition =
  | { status: 'recognized'; type: VehicleType }
  | { status: 'ambiguous'; options: VehicleType[] }
  | { status: 'unknown' };

const CAR = /(פרטי|רכב נוסעים|מסחרי קל|M1|N1)/i;
const TWO_WHEEL = /(אופנוע|קטנוע|דו.?גלגלי|L1|L3|L4|L5)/i;
const SCOOTER = /קטנוע/;
const MOTORCYCLE = /אופנוע/;

/**
 * Deterministic type recognition from the registration's vehicle-category text. The license
 * reliably separates cars from two-wheelers; it often does NOT separate motorcycle from scooter,
 * so in that case the user chooses — AutoKeep does not guess.
 */
export function recognizeType(categoryRaw: string | undefined): TypeRecognition {
  if (!categoryRaw) return { status: 'unknown' };
  if (SCOOTER.test(categoryRaw) && !MOTORCYCLE.test(categoryRaw)) {
    return { status: 'recognized', type: 'scooter' };
  }
  if (MOTORCYCLE.test(categoryRaw) && !SCOOTER.test(categoryRaw)) {
    return { status: 'recognized', type: 'motorcycle' };
  }
  if (TWO_WHEEL.test(categoryRaw))
    return { status: 'ambiguous', options: ['motorcycle', 'scooter'] };
  if (CAR.test(categoryRaw)) return { status: 'recognized', type: 'car' };
  return { status: 'unknown' };
}

// ---------- Draft engine (T055) ----------

/** Necessary to identify the vehicle and to match an exact official source. */
export const REQUIRED_FIELDS: readonly DraftField[] = [
  'type',
  'manufacturer',
  'model',
  'year',
  'registration',
  'engine',
];

function fieldValid(field: DraftField, value: string, currentYear: number): boolean {
  switch (field) {
    case 'registration':
      return parseRegistration(value) !== null;
    case 'vin':
      return parseVin(value) !== null;
    case 'year': {
      const y = Number(value);
      return Number.isInteger(y) && y >= 1950 && y <= currentYear + 1;
    }
    case 'type':
      return value === 'car' || value === 'motorcycle' || value === 'scooter';
    default:
      return value.trim().length > 0;
  }
}

/** Builds a draft from validated extraction output, applying confidence thresholds. */
export function draftFromExtraction(
  ex: RegistrationExtraction,
  currentYear: number,
): {
  draft: IdentificationDraft;
  typeRecognition: TypeRecognition;
} {
  const draft: IdentificationDraft = {};
  for (const [key, v] of Object.entries(ex.fields) as [
    RegistrationField,
    { value: string; confidence: number },
  ][]) {
    if (key === 'vehicleCategory' || !v) continue;
    if (v.confidence < CONFIDENCE_MIN) continue; // treated as missing
    if (!fieldValid(key, v.value, currentYear)) continue; // malformed → missing, never guessed
    draft[key] = {
      value: v.value.trim(),
      origin: 'scan',
      confidence: v.confidence,
      uncertain: v.confidence < CONFIDENCE_ACCEPT,
    };
  }
  const category = ex.fields.vehicleCategory;
  const typeRecognition =
    category && category.confidence >= CONFIDENCE_MIN
      ? recognizeType(category.value)
      : { status: 'unknown' as const };
  if (typeRecognition.status === 'recognized') {
    draft.type = {
      value: typeRecognition.type,
      origin: 'scan',
      confidence: category!.confidence,
      uncertain: category!.confidence < CONFIDENCE_ACCEPT,
    };
  }
  return { draft, typeRecognition };
}

/** Only the necessary fields that are still missing — known data is never re-asked. */
export function missingFields(draft: IdentificationDraft): DraftField[] {
  return REQUIRED_FIELDS.filter((f) => !draft[f] || draft[f]!.value.trim() === '');
}

export function uncertainFields(draft: IdentificationDraft): DraftField[] {
  return (Object.keys(draft) as DraftField[]).filter((f) => draft[f]?.uncertain);
}

export interface FieldError {
  field: DraftField;
  code: 'invalid';
}

/**
 * Applies user input (confirmation of uncertain values or completion of missing ones). A user
 * value replaces the scanned one and is marked as user-entered; it is never promoted to "scan".
 */
export function applyUserInput(
  draft: IdentificationDraft,
  input: Partial<Record<DraftField, string>>,
  currentYear: number,
): { draft: IdentificationDraft; errors: FieldError[] } {
  const next: IdentificationDraft = { ...draft };
  const errors: FieldError[] = [];
  for (const [field, raw] of Object.entries(input) as [DraftField, string][]) {
    const value = raw.trim();
    if (value === '') continue;
    if (!fieldValid(field, value, currentYear)) {
      errors.push({ field, code: 'invalid' });
      continue;
    }
    next[field] = { value, origin: 'user', confidence: null, uncertain: false };
  }
  return { draft: next, errors };
}

/** Marks an uncertain scanned value as checked by the user (keeps origin "scan"). */
export function confirmUncertain(
  draft: IdentificationDraft,
  field: DraftField,
): IdentificationDraft {
  const v = draft[field];
  return v ? { ...draft, [field]: { ...v, uncertain: false } } : draft;
}

export type ReadyCheck =
  | { ready: true; input: NewVehicleInput }
  | { ready: false; missing: DraftField[]; uncertain: DraftField[] };

/** The draft can become a vehicle only when nothing necessary is missing or unconfirmed. */
export function toVehicleInput(draft: IdentificationDraft, ownerProfileId: ProfileId): ReadyCheck {
  const missing = missingFields(draft);
  const uncertain = uncertainFields(draft);
  if (missing.length > 0 || uncertain.length > 0) return { ready: false, missing, uncertain };
  const val = (f: DraftField) => draft[f]?.value;
  const identity: VehicleIdentity = {
    manufacturer: val('manufacturer')!,
    model: val('model')!,
    year: Number(val('year')),
    trim: val('trim'),
    modelCode: val('modelCode'),
    engine: val('engine'),
    fuel: val('fuel'),
  };
  return {
    ready: true,
    input: {
      ownerProfileId,
      type: val('type') as VehicleType,
      identity,
      registration: val('registration')!,
      vin: val('vin') ?? null,
    },
  };
}

// ---------- Candidate resolution / ambiguity (T054) ----------

/** A specific vehicle variant (e.g. from a model catalog) that could match the scanned identity. */
export interface VehicleVariant {
  manufacturer: string;
  model: string;
  year: number;
  trim?: string;
  engine?: string;
  type?: VehicleType;
}

export type IdentificationResult =
  | { kind: 'failed'; reason: 'unreadable' | 'error' | 'not_a_license' }
  | { kind: 'needs_selection'; draft: IdentificationDraft; candidates: VehicleVariant[] }
  | { kind: 'draft'; draft: IdentificationDraft; missing: DraftField[]; uncertain: DraftField[] };

/**
 * Combines extraction with catalog candidates. Exactly one candidate fills the gaps (origin
 * "catalog"); several exact candidates require the user to choose — AutoKeep does not guess.
 */
export function resolveIdentification(
  extraction: RegistrationExtraction | null,
  candidates: readonly VehicleVariant[],
  currentYear: number,
): IdentificationResult {
  if (!extraction) return { kind: 'failed', reason: 'unreadable' };
  if (extraction.documentType !== 'vehicle_license')
    return { kind: 'failed', reason: 'not_a_license' };
  const { draft } = draftFromExtraction(extraction, currentYear);
  const matching = candidates.filter(
    (c) =>
      (!draft.manufacturer || c.manufacturer === draft.manufacturer.value) &&
      (!draft.model || c.model === draft.model.value) &&
      (!draft.year || String(c.year) === draft.year.value),
  );
  if (matching.length > 1) return { kind: 'needs_selection', draft, candidates: matching };
  const resolved = matching.length === 1 ? applyVariant(draft, matching[0]) : draft;
  return {
    kind: 'draft',
    draft: resolved,
    missing: missingFields(resolved),
    uncertain: uncertainFields(resolved),
  };
}

/** Fills only fields the scan did not provide; scanned values are never overwritten. */
export function applyVariant(draft: IdentificationDraft, v: VehicleVariant): IdentificationDraft {
  const next: IdentificationDraft = { ...draft };
  const fill = (f: DraftField, value: string | number | undefined) => {
    if (value === undefined || next[f]) return;
    next[f] = { value: String(value), origin: 'catalog', confidence: null, uncertain: false };
  };
  fill('manufacturer', v.manufacturer);
  fill('model', v.model);
  fill('year', v.year);
  fill('trim', v.trim);
  fill('engine', v.engine);
  fill('type', v.type);
  return next;
}

// ---------- Manual fallback (T056) ----------

/** Manual entry always produces the same draft shape, marked as user-entered. */
export function manualDraft(
  input: Partial<Record<DraftField, string>>,
  currentYear: number,
): { draft: IdentificationDraft; errors: FieldError[] } {
  return applyUserInput({}, input, currentYear);
}
