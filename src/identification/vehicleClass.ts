import type { ExteriorPhase } from '@/domain';

/**
 * Vehicle identity CLASS for model reference images (owner decisions 2026-09-29;
 * docs/release/VEHICLE_IMAGE_RESOLVER_RESEARCH.md §4). Pure and deterministic.
 *
 * Key: v1/{make}/{model}/{generation}/{phase}/{body}/{colorFamily}. Built only from class
 * attributes — never a plate, VIN or user identity. A vehicle whose exterior phase is not known
 * with high confidence never gets a phase-specific key (it gets a visual question instead).
 *
 * Scope: the approved catalog currently covers SEAT Ibiza 6J only. Other vehicles resolve to
 * "unsupported" (→ the user is invited to add their own photo).
 */

export type ColorFamily =
  | 'black'
  | 'white'
  | 'silver'
  | 'grey'
  | 'blue'
  | 'red'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'brown'
  | 'beige';

/** Registry / user color → family. Unknown or multi-color → null (never guessed). */
const COLOR_WORDS: [RegExp, ColorFamily][] = [
  [/שחור|black/i, 'black'],
  [/לבן|שנהב|שן פיל|white|ivory/i, 'white'],
  [/כסף|כסוף|silver/i, 'silver'],
  [/אפור|grey|gray|אנטרציט/i, 'grey'],
  [/כחול|תכלת|blue/i, 'blue'],
  [/אדום|בורדו|red|bordeaux/i, 'red'],
  [/ירוק|ירקרק|green/i, 'green'],
  [/צהוב|yellow/i, 'yellow'],
  [/כתום|orange/i, 'orange'],
  [/חום|brown/i, 'brown'],
  [/בז'|בז׳|beige/i, 'beige'],
];

export function colorFamily(color: string | undefined | null): ColorFamily | null {
  if (!color || /רב גווני|multi/i.test(color)) return null;
  const hit = COLOR_WORDS.find(([re]) => re.test(color));
  return hit ? hit[1] : null;
}

const MAKES: Record<string, string> = { seat: 'seat', סיאט: 'seat' };
const MODELS: Record<string, string> = { ibiza: 'ibiza', איביזה: 'ibiza' };

/** Registry names may carry the country ("סיאט ספרד"): the first word is the make. */
export function normalizeMake(make: string): string | null {
  const first = make.trim().toLowerCase().split(/\s+/)[0] ?? '';
  return MAKES[first] ?? null;
}

export function normalizeModel(model: string): string | null {
  return MODELS[model.trim().toLowerCase()] ?? null;
}

interface Generation {
  make: string;
  model: string;
  code: string;
  /** Registry model-code prefix (degem_nm) identifying the generation. */
  modelCodePrefix: string;
  /** Body by model-code prefix (VW group type codes). */
  bodies: Record<string, string>;
  phases: readonly ExteriorPhase[];
}

const GENERATIONS: readonly Generation[] = [
  {
    make: 'seat',
    model: 'ibiza',
    code: '6j',
    modelCodePrefix: '6J',
    // 6J5 = 5-door hatchback (WLTP catalog: 5 doors, "הצ'בק"); 6J1 = 3-door SC; 6J8 = ST estate.
    bodies: { '6J5': 'hatchback-5d', '6J1': 'hatchback-3d', '6J8': 'estate' },
    phases: ['pre-fl', 'fl1'],
  },
];

export interface VehicleClassInput {
  kind: string;
  manufacturer: string;
  model: string;
  modelCode?: string;
  color?: string;
  exteriorPhase?: ExteriorPhase;
}

export type VehicleClass =
  | { kind: 'unsupported' }
  /** Identity is precise except the exterior phase: ask the user (one visual question). */
  | { kind: 'needs_phase'; keys: Record<ExteriorPhase, string> }
  | { kind: 'key'; key: string };

export function classKey(parts: {
  make: string;
  model: string;
  generation: string;
  phase: ExteriorPhase;
  body: string;
  color: ColorFamily | 'any';
}): string {
  const { make, model, generation, phase, body, color } = parts;
  return `v1/${make}/${model}/${generation}/${phase}/${body}/${color}`;
}

export function vehicleClass(v: VehicleClassInput): VehicleClass {
  if (v.kind !== 'car' || !v.modelCode) return { kind: 'unsupported' };
  const make = normalizeMake(v.manufacturer);
  const model = normalizeModel(v.model);
  const code = v.modelCode.trim().toUpperCase();
  const gen = GENERATIONS.find(
    (g) => g.make === make && g.model === model && code.startsWith(g.modelCodePrefix),
  );
  if (!gen) return { kind: 'unsupported' };
  const body = gen.bodies[code.slice(0, 3)];
  if (!body) return { kind: 'unsupported' };
  const color: ColorFamily | 'any' = colorFamily(v.color) ?? 'any';
  const base = { make: gen.make, model: gen.model, generation: gen.code, body, color };
  if (v.exteriorPhase && gen.phases.includes(v.exteriorPhase)) {
    return { kind: 'key', key: classKey({ ...base, phase: v.exteriorPhase }) };
  }
  return {
    kind: 'needs_phase',
    keys: Object.fromEntries(gen.phases.map((p) => [p, classKey({ ...base, phase: p })])) as Record<
      ExteriorPhase,
      string
    >,
  };
}

// ---------- High-confidence exterior-phase rules (Israeli registry evidence) ----------

export interface RegistryPhaseFacts {
  manufacturer: string;
  modelCode?: string;
  /** Homologation code (`degem_cd`). */
  homologationCode?: number;
  /** Production year (`shnat_yitzur`). */
  productionYear?: number;
  /** First registration "YYYY-M" (`moed_aliya_lakvish`). */
  firstRegistration?: string;
  vin?: string;
}

/** VIN position 10 → model year (2001–2009 = 1–9, 2010 = A … 2017 = H). */
function vinModelYear(vin: string | undefined): number | null {
  if (!vin || vin.length !== 17) return null;
  const c = vin[9].toUpperCase();
  if (/[1-9]/.test(c)) return 2000 + Number(c);
  const idx = 'ABCDEFGH'.indexOf(c);
  return idx < 0 ? null : 2010 + idx;
}

function registrationMonth(s: string | undefined): number | null {
  const m = s?.match(/^(\d{4})-(\d{1,2})$/);
  return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

/**
 * Only rules backed by evidence with HIGH confidence (research §4.1–4.2). Anything else →
 * null (unknown), which leads to the visual question — never to a guessed front.
 */
export function exteriorPhaseFromRegistry(f: RegistryPhaseFacts): ExteriorPhase | null {
  if (normalizeMake(f.manufacturer) !== 'seat' || !f.modelCode?.toUpperCase().startsWith('6J')) {
    return null;
  }
  const my = vinModelYear(f.vin);
  // Model year 2013+ Ibiza 6J production is entirely facelift; model year 2011 or earlier ended
  // before facelift production began (2012).
  if (my !== null && my >= 2013) return 'fl1';
  if (my !== null && my <= 2011) return 'pre-fl';
  if (f.homologationCode === 58) return 'fl1';
  const firstReg = registrationMonth(f.firstRegistration);
  if (
    f.homologationCode === 26 &&
    (f.productionYear === 2011 || (firstReg !== null && firstReg <= 2012 * 12 + 1))
  ) {
    return 'pre-fl';
  }
  return null;
}
