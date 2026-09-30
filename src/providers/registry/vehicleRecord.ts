/**
 * Normalized Ministry of Transport vehicle record (data.gov.il). Every value comes from a source
 * field — nothing is derived, estimated or invented. Pure: no I/O.
 *
 * Rules (owner instruction, Add Vehicle by plate):
 *  - no statistics (e.g. how many vehicles of a model are on the road) are read or kept;
 *  - safety / equipment indicators are kept ONLY when positive: a "no", 0 or absent value is
 *    dropped, never shown as a missing feature;
 *  - every available environmental value is kept;
 *  - the VIN is kept as a fact but never displayed in full (see `maskVin`).
 */

export type RegistryFactGroup =
  'identity' | 'registration' | 'technical' | 'tires' | 'safety' | 'environment';

export type RegistryFactKind =
  /** Free text as published. */
  | 'text'
  /** ISO date (YYYY-MM-DD) or month (YYYY-MM). */
  | 'date'
  /** A positive number with an optional unit. */
  | 'number'
  /** A yes/no indicator: kept only when "yes". */
  | 'flag'
  /** A score / level / count: kept only when > 0. */
  | 'positive';

export interface RegistryFact {
  key: string;
  group: RegistryFactGroup;
  kind: RegistryFactKind;
  value: string | number | true;
  unit?: string;
}

export interface VehicleRegistryRecord {
  /** Source resources the facts came from (provenance). */
  sources: string[];
  retrievedAt: string;
  facts: RegistryFact[];
}

interface FieldSpec {
  /** Source field name(s), first non-empty wins. */
  from: readonly string[];
  key: string;
  group: RegistryFactGroup;
  kind: RegistryFactKind;
  unit?: string;
}

const f = (
  from: string | readonly string[],
  key: string,
  group: RegistryFactGroup,
  kind: RegistryFactKind,
  unit?: string,
): FieldSpec => ({ from: typeof from === 'string' ? [from] : from, key, group, kind, unit });

/** The plate record (private & commercial vehicles, and its continuation resource). */
export const PLATE_FIELDS: readonly FieldSpec[] = [
  f('tozeret_nm', 'manufacturerRegistered', 'identity', 'text'),
  f('kinuy_mishari', 'commercialName', 'identity', 'text'),
  f('degem_nm', 'modelCode', 'identity', 'text'),
  f('degem_cd', 'homologationCode', 'identity', 'text'),
  f('tozeret_cd', 'manufacturerCode', 'identity', 'text'),
  f('ramat_gimur', 'trim', 'identity', 'text'),
  f('shnat_yitzur', 'modelYear', 'identity', 'number'),
  f('tzeva_rechev', 'color', 'identity', 'text'),
  f('misgeret', 'vin', 'identity', 'text'),
  f('sug_delek_nm', 'fuel', 'technical', 'text'),
  f('degem_manoa', 'engineCode', 'technical', 'text'),
  f('moed_aliya_lakvish', 'roadDate', 'registration', 'date'),
  f('baalut', 'ownership', 'registration', 'text'),
  f('mivchan_acharon_dt', 'lastTest', 'registration', 'date'),
  f('tokef_dt', 'licenseValidUntil', 'registration', 'date'),
  f('horaat_rishum', 'registrationOrder', 'registration', 'text'),
  f('zmig_kidmi', 'tireFront', 'tires', 'text'),
  f('zmig_ahori', 'tireRear', 'tires', 'text'),
  f('kod_omes_tzmig_kidmi', 'tireFrontLoad', 'tires', 'text'),
  f('kod_omes_tzmig_ahori', 'tireRearLoad', 'tires', 'text'),
  f('kod_mehirut_tzmig_kidmi', 'tireFrontSpeed', 'tires', 'text'),
  f('kod_mehirut_tzmig_ahori', 'tireRearSpeed', 'tires', 'text'),
  f('grira_nm', 'towHitch', 'technical', 'text'),
  f('ramat_eivzur_betihuty', 'safetyEquipmentLevel', 'safety', 'positive'),
  f('kvutzat_zihum', 'pollutionGroup', 'environment', 'positive'),
];

/** The model catalog (WLTP), joined by manufacturer code + model code + year. */
export const MODEL_FIELDS: readonly FieldSpec[] = [
  f('tozar', 'manufacturer', 'identity', 'text'),
  f('tozeret_eretz_nm', 'countryOfManufacture', 'identity', 'text'),
  f('merkav', 'body', 'identity', 'text'),
  f('nefah_manoa', 'displacement', 'technical', 'number', 'סמ״ק'),
  f('koah_sus', 'horsepower', 'technical', 'number', 'כ״ס'),
  f('mishkal_kolel', 'grossWeight', 'technical', 'number', 'ק״ג'),
  f('gova', 'height', 'technical', 'number', 'ס״מ'),
  f('hanaa_nm', 'drive', 'technical', 'text'),
  f('technologiat_hanaa_nm', 'propulsion', 'technical', 'text'),
  f('mispar_dlatot', 'doors', 'technical', 'number'),
  f('mispar_moshavim', 'seats', 'technical', 'number'),
  f('kosher_grira_im_blamim', 'towingBraked', 'technical', 'number', 'ק״ג'),
  f('kosher_grira_bli_blamim', 'towingUnbraked', 'technical', 'number', 'ק״ג'),
  f('sug_tkina_nm', 'standard', 'technical', 'text'),
  f('automatic_ind', 'automatic', 'technical', 'flag'),
  f('hege_koah_ind', 'powerSteering', 'technical', 'flag'),
  f('mazgan_ind', 'airConditioning', 'technical', 'flag'),
  f('halon_bagg_ind', 'sunroof', 'technical', 'flag'),
  f('galgaley_sagsoget_kala_ind', 'alloyWheels', 'technical', 'flag'),
  f('mispar_halonot_hashmal', 'electricWindows', 'technical', 'positive'),
  // Safety equipment: positive only.
  f('abs_ind', 'abs', 'safety', 'flag'),
  f('mispar_kariot_avir', 'airbags', 'safety', 'positive'),
  f('bakarat_yatzivut_ind', 'stabilityControl', 'safety', 'flag'),
  f('bakarat_stiya_menativ_ind', 'laneDepartureWarning', 'safety', 'flag'),
  f('bakarat_stiya_activ_s', 'laneKeepingAssist', 'safety', 'flag'),
  f('nitur_merhak_milfanim_ind', 'forwardDistanceMonitoring', 'safety', 'flag'),
  f('zihuy_beshetah_nistar_ind', 'blindSpotDetection', 'safety', 'flag'),
  f('bakarat_shyut_adaptivit_ind', 'adaptiveCruise', 'safety', 'flag'),
  f('zihuy_holchey_regel_ind', 'pedestrianDetection', 'safety', 'flag'),
  f('maarechet_ezer_labalam_ind', 'brakeAssist', 'safety', 'flag'),
  f('matzlemat_reverse_ind', 'reverseCamera', 'safety', 'flag'),
  f('hayshaney_lahatz_avir_batzmigim_ind', 'tirePressureSensors', 'safety', 'flag'),
  f('hayshaney_hagorot_ind', 'seatbeltSensors', 'safety', 'flag'),
  f('teura_automatit_benesiya_kadima_ind', 'autoHeadlights', 'safety', 'flag'),
  f('shlita_automatit_beorot_gvohim_ind', 'autoHighBeams', 'safety', 'flag'),
  f('zihuy_matzav_hitkarvut_mesukenet_ind', 'collisionWarning', 'safety', 'flag'),
  f('zihuy_tamrurey_tnua_ind', 'trafficSignRecognition', 'safety', 'flag'),
  f('zihuy_rechev_do_galgali', 'twoWheelerDetection', 'safety', 'flag'),
  f('blima_otomatit_nesia_leahor', 'rearAutoBraking', 'safety', 'flag'),
  f('bakarat_mehirut_isa', 'intelligentSpeedAssist', 'safety', 'flag'),
  f('blimat_hirum_lifnei_holhei_regel_ofanaim', 'emergencyBrakingVulnerable', 'safety', 'flag'),
  f('hitnagshut_cad_shetah_met', 'blindSpotCollisionWarning', 'safety', 'flag'),
  f('alco_lock', 'alcoLock', 'safety', 'flag'),
  f('nikud_betihut', 'safetyScore', 'safety', 'positive'),
  f('ramat_eivzur_betihuty', 'safetyEquipmentLevel', 'safety', 'positive'),
  // Environment: everything available.
  f('madad_yarok', 'greenIndex', 'environment', 'positive'),
  f('kvutzat_zihum', 'pollutionGroup', 'environment', 'positive'),
  f(['CO2_WLTP', 'kamut_CO2'], 'co2', 'environment', 'number', 'גרם/ק״מ'),
  f('kamut_CO2_city', 'co2City', 'environment', 'number', 'גרם/ק״מ'),
  f('kamut_CO2_hway', 'co2Highway', 'environment', 'number', 'גרם/ק״מ'),
  f('CO2_WLTP_NEDC', 'co2Nedc', 'environment', 'number', 'גרם/ק״מ'),
  f(['NOX_WLTP', 'kamut_NOX'], 'nox', 'environment', 'number', 'גרם/ק״מ'),
  f(['PM_WLTP', 'kamut_PM10'], 'pm', 'environment', 'number', 'גרם/ק״מ'),
  f(['HC_WLTP', 'kamut_HC'], 'hc', 'environment', 'number', 'גרם/ק״מ'),
  f('kamut_HC_NOX', 'hcNox', 'environment', 'number', 'גרם/ק״מ'),
  f(['CO_WLTP', 'kamut_CO'], 'co', 'environment', 'number', 'גרם/ק״מ'),
];

/** Two-wheelers (their own dataset: no model catalog join). The engine serial is not kept. */
export const TWO_WHEELER_FIELDS: readonly FieldSpec[] = [
  f('tozeret_nm', 'manufacturerRegistered', 'identity', 'text'),
  f('tozeret_eretz_nm', 'countryOfManufacture', 'identity', 'text'),
  f('degem_nm', 'modelCode', 'identity', 'text'),
  f('shnat_yitzur', 'modelYear', 'identity', 'number'),
  f('sug_rechev_nm', 'vehicleCategory', 'identity', 'text'),
  f('misgeret', 'vin', 'identity', 'text'),
  f('mkoriut_nm', 'origin', 'identity', 'text'),
  f('sug_delek_nm', 'fuel', 'technical', 'text'),
  f('nefach_manoa', 'displacement', 'technical', 'number', 'סמ״ק'),
  f('hespek', 'power', 'technical', 'number', 'קילוואט'),
  f('mishkal_kolel', 'grossWeight', 'technical', 'number', 'ק״ג'),
  f('mispar_mekomot', 'seats', 'technical', 'number'),
  f('moed_aliya_lakvish', 'roadDate', 'registration', 'date'),
  f('baalut', 'ownership', 'registration', 'text'),
  f('horaat_rishum', 'registrationOrder', 'registration', 'text'),
  f('mida_zmig_kidmi', 'tireFront', 'tires', 'text'),
  f('mida_zmig_ahori', 'tireRear', 'tires', 'text'),
  f('kod_omes_zmig_kidmi', 'tireFrontLoad', 'tires', 'text'),
  f('kod_omes_zmig_ahori', 'tireRearLoad', 'tires', 'text'),
  f('kod_mehirut_zmig_kidmi', 'tireFrontSpeed', 'tires', 'text'),
  f('kod_mehirut_zmig_ahori', 'tireRearSpeed', 'tires', 'text'),
];

type Row = Record<string, unknown>;

/** "yes" in the source: 1, "1", true, "כן" — anything else is not a positive feature. */
export function isYes(v: unknown): boolean {
  return v === 1 || v === true || (typeof v === 'string' && /^(1|כן|yes|true)$/i.test(v.trim()));
}

function toNumber(v: unknown): number | undefined {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

/** "2012-8" → "2012-08"; "2026-09-10" / "2026-09-10T00:00:00" → "2026-09-10"; else undefined. */
export function normalizeDate(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  const day = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (day) return `${day[1]}-${day[2]}-${day[3]}`;
  const month = s.match(/^(\d{4})-(\d{1,2})$/);
  if (month && Number(month[2]) >= 1 && Number(month[2]) <= 12) {
    return `${month[1]}-${month[2].padStart(2, '0')}`;
  }
  return undefined;
}

const NOT_A_VALUE = /^(לא ידוע|אין\s)/;

function factValue(spec: FieldSpec, raw: unknown): RegistryFact['value'] | undefined {
  switch (spec.kind) {
    case 'flag':
      return isYes(raw) ? true : undefined;
    case 'positive':
    case 'number': {
      const n = toNumber(raw);
      return n !== undefined && n > 0 ? n : undefined;
    }
    case 'date':
      return normalizeDate(raw);
    case 'text': {
      if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw);
      if (typeof raw !== 'string' || !raw.trim()) return undefined;
      const t = raw.trim();
      // "לא ידוע קוד …" is the source saying it has no value; "אין …" states a missing feature
      // (e.g. "אין וו גרירה") — neither is shown or kept.
      return NOT_A_VALUE.test(t) ? undefined : t;
    }
  }
}

/** Facts from one source row, by field table. The first non-empty source field wins. */
export function factsFrom(row: Row, specs: readonly FieldSpec[]): RegistryFact[] {
  const out: RegistryFact[] = [];
  for (const spec of specs) {
    for (const name of spec.from) {
      const value = factValue(spec, row[name]);
      if (value === undefined) continue;
      out.push({
        key: spec.key,
        group: spec.group,
        kind: spec.kind,
        value,
        ...(spec.unit ? { unit: spec.unit } : {}),
      });
      break;
    }
  }
  return out;
}

/**
 * Model-catalog facts that ALL matching catalog rows agree on (several trims can share one model
 * code and year): a value that differs between rows is not a fact about this vehicle.
 */
export function agreedModelFacts(rows: readonly Row[]): RegistryFact[] {
  if (rows.length === 0) return [];
  const per = rows.map((r) => factsFrom(r, MODEL_FIELDS));
  return per[0].filter((fact) =>
    per.every((facts) =>
      facts.some((x) => x.key === fact.key && x.value === fact.value && x.group === fact.group),
    ),
  );
}

/** Merge fact lists: the first occurrence of a key (per group) wins; plate record first. */
export function mergeFacts(...lists: RegistryFact[][]): RegistryFact[] {
  const seen = new Set<string>();
  const out: RegistryFact[] = [];
  for (const fact of lists.flat()) {
    const id = `${fact.group}:${fact.key}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(fact);
  }
  return out;
}

export const FACT_GROUPS: readonly RegistryFactGroup[] = [
  'identity',
  'registration',
  'technical',
  'tires',
  'safety',
  'environment',
];
