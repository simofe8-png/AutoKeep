import { fuelOf, makeKey, normalizeEngineCodes } from '@/discovery/maintenance/msource/fingerprint';
import type { Powertrain } from '@/domain';

/**
 * ENGINE-FAMILY maintenance guidance (owner decision 2026-10-04, "option 2"). Intervals for the
 * Israeli market's main engine families as supplied by the owner (2026-10-04), with the owner's
 * resolutions of the conflicts flagged in review (EA211 air filter, G4FJ, H5H without Mercedes,
 * DSG fluid). NOT verified against manufacturer documents:
 *  - shown only in its own labelled card, and only while the vehicle has no schedule item;
 *  - never a requirement — it never enters the plan, dues, reminders or "next service" and is
 *    never counted as verified. Verified manufacturer schedules come only from sourced documents
 *    (catalogData.ts, owner uploads).
 *
 * Matching is exact: the registry engine code (normalized: upper case, no separators) must be one
 * of the family's codes, and the vehicle's make one of the family's makes. A bare code that two
 * families share (e.g. "2ZR" for both the hybrid FXE and the petrol FAE) is listed with the fuel
 * that tells them apart. Several matching families → no guidance (never a guess).
 */

export type GuidanceItem =
  | 'oil_and_filter'
  | 'air_filter'
  | 'cabin_filter'
  | 'brake_fluid'
  | 'spark_plugs'
  | 'coolant'
  | 'hybrid_coolant'
  | 'fuel_filter'
  | 'timing_belt'
  | 'timing_belt_inspection'
  | 'timing_belt_water_pump'
  | 'wet_belt_inspection'
  | 'wet_belt_oil_pump_belt'
  | 'chain_belt_inspection'
  | 'dsg_fluid'
  | 'dct_actuator_fluid'
  | 'adblue_additive_check'
  | 'valve_clearance';

export interface GuidanceInterval {
  item: GuidanceItem;
  km?: number;
  months?: number;
  /** A first occurrence that differs from the repeat ("first at 120,000 km, then every 30,000"). */
  first?: { km?: number; months?: number };
  /** An inspection, not a replacement. */
  inspect?: boolean;
}

export interface EngineFamily {
  id: string;
  /** Display name of the family (the codes as written, with the family name). */
  name: string;
  makes: readonly string[];
  /** Exact codes (normalized). */
  codes: readonly string[];
  /** Bare codes shared by families: matched only together with one of these fuels. */
  fuelCodes?: { codes: readonly string[]; fuels: readonly Powertrain[] };
  intervals: readonly GuidanceInterval[];
}

const HK = ['hyundai', 'kia'];
const TOYOTA = ['toyota', 'lexus'];
const VAG = ['volkswagen', 'skoda', 'seat', 'audi', 'cupra'];
const RNM = ['renault', 'nissan', 'dacia'];
const PSA = ['peugeot', 'citroen', 'opel', 'ds'];

const oil = (km: number, months = 12): GuidanceInterval => ({ item: 'oil_and_filter', km, months });
const air = (km: number, months?: number): GuidanceInterval => ({ item: 'air_filter', km, months });
const cabin = (km: number, months?: number): GuidanceInterval => ({
  item: 'cabin_filter',
  km,
  months,
});
const brake = (km?: number, months = 24): GuidanceInterval => ({ item: 'brake_fluid', km, months });
const plugs = (km: number, months?: number): GuidanceInterval => ({
  item: 'spark_plugs',
  km,
  months,
});
const fuel = (km: number, months?: number): GuidanceInterval => ({
  item: 'fuel_filter',
  km,
  months,
});
const dsg: GuidanceInterval = { item: 'dsg_fluid', km: 60000, months: 48 };

/** Air + cabin at the same interval (most families). */
const filters = (km: number, months?: number) => [air(km, months), cabin(km, months)];

const toyotaHybrid15 = [oil(15000), ...filters(30000, 24), brake(30000), plugs(90000, 72)];
const toyotaHybrid18 = [
  oil(15000),
  cabin(15000, 12),
  air(30000, 24),
  brake(30000),
  plugs(90000, 72),
  { item: 'coolant', km: 90000, first: { km: 150000, months: 120 } } as GuidanceInterval,
];
const mazdaPe = [
  oil(15000),
  ...filters(30000, 24),
  brake(30000),
  plugs(120000),
  { item: 'coolant', km: 100000, first: { km: 200000, months: 120 } } as GuidanceInterval,
];

export const ENGINE_FAMILIES: readonly EngineFamily[] = [
  // ---- Hyundai / Kia ----
  {
    id: 'g4la',
    name: 'G4LA · 1.2 Kappa MPI',
    makes: HK,
    codes: ['G4LA'],
    intervals: [
      oil(15000),
      cabin(15000, 12),
      air(30000, 24),
      brake(30000),
      plugs(45000, 36),
      { item: 'coolant', km: 30000, first: { km: 120000, months: 60 } },
    ],
  },
  {
    id: 'g3la',
    name: 'G3LA / G3LD · 1.0 MPI / Smartstream',
    makes: HK,
    codes: ['G3LA', 'G3LD'],
    intervals: [oil(15000), ...filters(30000, 24), brake(30000), plugs(45000, 36)],
  },
  {
    id: 'g3lc',
    name: 'G3LC / G3LE · 1.0 T-GDI',
    makes: HK,
    codes: ['G3LC', 'G3LE'],
    intervals: [oil(15000), air(30000, 24), cabin(15000, 12), plugs(60000, 48), brake(30000)],
  },
  {
    id: 'g4fa',
    name: 'G4FA / G4FC · 1.4 / 1.6 Gamma MPI',
    makes: HK,
    codes: ['G4FA', 'G4FC'],
    intervals: [oil(15000), ...filters(30000, 24), brake(30000), plugs(45000, 36)],
  },
  {
    id: 'g4fd',
    name: 'G4FD · 1.6 Gamma GDI',
    makes: HK,
    codes: ['G4FD'],
    intervals: [oil(15000), air(30000, 24), cabin(15000, 12), plugs(60000, 48), brake(30000)],
  },
  {
    id: 'g4fj',
    name: 'G4FJ · 1.6 T-GDI',
    makes: HK,
    codes: ['G4FJ'],
    intervals: [oil(15000), air(30000, 24), plugs(60000, 48), brake(30000)],
  },
  {
    id: 'g4na',
    name: 'G4NA / G4NC · 2.0 Nu',
    makes: HK,
    codes: ['G4NA', 'G4NC'],
    intervals: [oil(15000), ...filters(30000, 24), brake(30000), plugs(60000, 48)],
  },
  {
    id: 'g4le',
    name: 'G4LE / G4LL · 1.6 Kappa Hybrid',
    makes: HK,
    codes: ['G4LE', 'G4LL'],
    intervals: [
      oil(15000),
      air(30000, 24),
      cabin(15000, 12),
      brake(30000),
      plugs(60000, 48),
      { item: 'hybrid_coolant', km: 30000, first: { km: 60000, months: 36 } },
      { item: 'dct_actuator_fluid', km: 30000, inspect: true },
      { item: 'dct_actuator_fluid', km: 60000 },
    ],
  },
  {
    id: 'd4fb',
    name: 'D4FB / D4FD · 1.6 / 1.7 CRDi',
    makes: HK,
    codes: ['D4FB', 'D4FD'],
    intervals: [oil(15000), fuel(30000, 24), ...filters(30000, 24), brake(30000)],
  },
  // ---- Toyota / Lexus ----
  {
    id: '1nz-fxe',
    name: '1NZ-FXE · 1.5 Hybrid',
    makes: TOYOTA,
    codes: ['1NZFXE'],
    fuelCodes: { codes: ['1NZ'], fuels: ['hybrid'] },
    intervals: [
      oil(15000),
      ...filters(30000, 24),
      brake(30000),
      plugs(90000, 72),
      { item: 'hybrid_coolant', km: 90000, first: { km: 150000 } },
    ],
  },
  {
    id: '2zr-fxe',
    name: '2ZR-FXE · 1.8 Hybrid',
    makes: TOYOTA,
    codes: ['2ZRFXE'],
    fuelCodes: { codes: ['2ZR'], fuels: ['hybrid'] },
    intervals: toyotaHybrid18,
  },
  {
    id: 'm15a-fxe',
    name: 'M15A-FXE · 1.5 Dynamic Force Hybrid',
    makes: TOYOTA,
    codes: ['M15AFXE'],
    fuelCodes: { codes: ['M15A'], fuels: ['hybrid'] },
    intervals: toyotaHybrid15,
  },
  {
    id: 'm20a-fxs',
    name: 'M20A-FXS · 2.0 Dynamic Force Hybrid',
    makes: TOYOTA,
    codes: ['M20AFXS'],
    fuelCodes: { codes: ['M20A'], fuels: ['hybrid'] },
    intervals: toyotaHybrid15,
  },
  {
    id: 'a25a-fxs',
    name: 'A25A-FXS · 2.5 Dynamic Force Hybrid',
    makes: TOYOTA,
    codes: ['A25AFXS'],
    fuelCodes: { codes: ['A25A'], fuels: ['hybrid'] },
    intervals: toyotaHybrid18,
  },
  {
    id: '1kr-fe',
    name: '1KR-FE · 1.0',
    makes: TOYOTA,
    codes: ['1KRFE'],
    fuelCodes: { codes: ['1KR'], fuels: ['petrol'] },
    intervals: [oil(15000), ...filters(30000, 24), plugs(45000, 36), brake(30000)],
  },
  {
    id: '1nr-fe',
    name: '1NR-FE / 1NR-FKE · 1.33 Dual VVT-i',
    makes: TOYOTA,
    codes: ['1NRFE', '1NRFKE'],
    fuelCodes: { codes: ['1NR'], fuels: ['petrol'] },
    intervals: [oil(15000), ...filters(30000, 24), plugs(90000)],
  },
  {
    id: 'zr-fae',
    name: '1ZR-FAE / 2ZR-FAE · 1.6 / 1.8 Valvematic',
    makes: TOYOTA,
    codes: ['1ZRFAE', '2ZRFAE'],
    fuelCodes: { codes: ['1ZR', '2ZR'], fuels: ['petrol'] },
    intervals: [oil(15000), ...filters(30000, 24), plugs(90000, 72), brake(30000)],
  },
  // ---- VW group (EA211 air filter standardized at 30,000 km / 24 months by the owner) ----
  {
    id: 'chyb',
    name: 'CHYA / CHYB · 1.0 MPI',
    makes: VAG,
    codes: ['CHYA', 'CHYB'],
    intervals: [oil(15000), ...filters(30000, 24), brake(undefined, 24), plugs(60000, 48)],
  },
  {
    id: 'ea211-10tsi',
    name: 'CHZB / CHZC / DKLA / DLAA · 1.0 TSI EA211',
    makes: VAG,
    codes: ['CHZB', 'CHZC', 'DKLA', 'DLAA'],
    intervals: [
      oil(15000),
      ...filters(30000, 24),
      plugs(60000, 48),
      { item: 'brake_fluid', months: 24, first: { months: 36 } },
      { item: 'timing_belt_inspection', km: 120000, inspect: true },
      { item: 'timing_belt', km: 210000 },
    ],
  },
  {
    id: 'ea111-12tsi',
    name: 'CBZA / CBZB · 1.2 TSI EA111',
    makes: VAG,
    codes: ['CBZA', 'CBZB'],
    intervals: [oil(15000), plugs(60000, 48), ...filters(30000, 24), brake(undefined, 24)],
  },
  {
    id: 'ea211-12tsi',
    name: 'CJZA / CJZB / CYVB · 1.2 TSI EA211',
    makes: VAG,
    codes: ['CJZA', 'CJZB', 'CYVB'],
    intervals: [oil(15000), ...filters(30000, 24), plugs(60000, 48), brake(undefined, 24)],
  },
  {
    id: 'ea111-14tsi',
    name: 'CAXA / CTHD / CAVE · 1.4 TSI EA111',
    makes: VAG,
    codes: ['CAXA', 'CTHD', 'CAVE'],
    intervals: [oil(15000), plugs(60000, 48), ...filters(30000, 24)],
  },
  {
    id: 'ea211-14tsi',
    name: 'CZDA / CZEA / CHPA · 1.4 TSI EA211',
    makes: VAG,
    codes: ['CZDA', 'CZEA', 'CHPA'],
    intervals: [oil(15000), plugs(60000, 48), ...filters(30000, 24), brake(undefined, 24)],
  },
  {
    id: 'ea211evo-15tsi',
    name: 'DADA / DPCA · 1.5 TSI EA211 evo',
    makes: VAG,
    codes: ['DADA', 'DPCA'],
    intervals: [oil(15000), ...filters(30000, 24), plugs(60000, 48), brake(undefined, 24)],
  },
  {
    id: 'ea888-gen2',
    name: 'CDAA / CCZA · 1.8 / 2.0 TSI EA888 Gen 2',
    makes: VAG,
    codes: ['CDAA', 'CCZA'],
    intervals: [oil(15000), plugs(60000, 48), ...filters(30000, 24), dsg],
  },
  {
    id: 'ea888-gen3',
    name: 'CHHA / CHHB / DKZA · 2.0 TSI EA888 Gen 3',
    makes: VAG,
    codes: ['CHHA', 'CHHB', 'DKZA'],
    intervals: [oil(15000), plugs(60000, 48), ...filters(30000, 24), dsg],
  },
  {
    id: 'tdi16',
    name: 'CAYC / CLHA / CRKB · 1.6 TDI',
    makes: VAG,
    codes: ['CAYC', 'CLHA', 'CRKB'],
    intervals: [
      oil(15000),
      fuel(60000, 48),
      ...filters(30000, 24),
      { item: 'timing_belt_water_pump', km: 210000 },
    ],
  },
  {
    id: 'tdi20',
    name: 'CFGB / CRBC / DFGA · 2.0 TDI',
    makes: VAG,
    codes: ['CFGB', 'CRBC', 'DFGA'],
    intervals: [oil(15000), fuel(60000, 48), { item: 'timing_belt', km: 210000 }],
  },
  // ---- Mazda ----
  {
    id: 'p5',
    name: 'P5-VPS / P5 · 1.5 SkyActiv-G',
    makes: ['mazda'],
    codes: ['P5VPS', 'P5'],
    intervals: [oil(15000), ...filters(30000, 24), brake(30000), plugs(120000)],
  },
  {
    id: 'pe',
    name: 'PE-VPS / PE · 2.0 SkyActiv-G',
    makes: ['mazda'],
    codes: ['PEVPS', 'PE'],
    intervals: mazdaPe,
  },
  {
    id: 'py',
    name: 'PY-VPS / PY · 2.5 SkyActiv-G',
    makes: ['mazda'],
    codes: ['PYVPS', 'PY'],
    intervals: mazdaPe,
  },
  {
    id: 'mzr',
    name: 'ZJ-VE / ZY-VE · 1.3 / 1.5 MZR',
    makes: ['mazda'],
    codes: ['ZJVE', 'ZYVE'],
    intervals: [oil(15000), plugs(60000, 48), ...filters(30000, 24)],
  },
  // ---- Renault / Nissan / Dacia (alliance baseline; Mercedes excluded by the owner) ----
  {
    id: 'h5f',
    name: 'H5F / HRA2DDT · 1.2 TCe / DIG-T',
    makes: RNM,
    codes: ['H5F', 'HRA2DDT'],
    intervals: [oil(15000), ...filters(30000, 24), plugs(60000, 48), brake(30000)],
  },
  {
    id: 'h5h',
    name: 'H5H / HR13DDT · 1.33 TCe',
    makes: RNM,
    codes: ['H5H', 'HR13DDT'],
    intervals: [oil(15000), cabin(15000, 12), air(30000, 24), plugs(60000, 48), brake(30000)],
  },
  {
    id: 'h4b',
    name: 'H4B / HR09DET · 0.9 TCe',
    makes: RNM,
    codes: ['H4B', 'HR09DET'],
    intervals: [oil(15000), ...filters(30000, 24), plugs(60000, 48)],
  },
  {
    id: 'h4d',
    name: 'H4D / H4Dt · 1.0 TCe / SCe',
    makes: RNM,
    codes: ['H4D', 'H4DT'],
    intervals: [oil(15000), ...filters(30000, 24), plugs(60000)],
  },
  {
    id: 'k9k',
    name: 'K9K · 1.5 dCi',
    makes: RNM,
    codes: ['K9K'],
    intervals: [
      oil(15000),
      fuel(30000, 24),
      ...filters(30000, 24),
      { item: 'timing_belt_water_pump', km: 120000, months: 60 },
    ],
  },
  {
    id: 'hr16de',
    name: 'HR16DE · 1.6',
    makes: RNM,
    codes: ['HR16DE'],
    intervals: [oil(15000), plugs(90000, 72), ...filters(30000, 24)],
  },
  {
    id: 'mr20',
    name: 'MR20DD / MR20DE · 2.0',
    makes: RNM,
    codes: ['MR20DD', 'MR20DE'],
    intervals: [oil(15000), plugs(90000), ...filters(30000)],
  },
  // ---- Peugeot / Citroën / Opel / DS ----
  {
    id: 'puretech-na',
    name: 'EB2F / HM01 / HMY · 1.2 PureTech (non-turbo)',
    makes: PSA,
    codes: ['EB2F', 'HM01', 'HMY'],
    intervals: [
      oil(15000),
      { item: 'wet_belt_inspection', km: 15000, inspect: true },
      { item: 'timing_belt', km: 100000, months: 72 },
      plugs(45000, 36),
      ...filters(30000, 24),
      brake(undefined, 24),
    ],
  },
  {
    id: 'puretech-turbo',
    name: 'EB2DT / EB2DTS / HNZ / HNV · 1.2 PureTech Turbo',
    makes: PSA,
    codes: ['EB2DT', 'EB2DTS', 'HNZ', 'HNV'],
    intervals: [
      oil(15000),
      { item: 'wet_belt_inspection', km: 15000, inspect: true },
      { item: 'timing_belt', km: 100000, months: 72 },
      plugs(45000, 36),
      air(30000, 24),
      cabin(15000, 12),
      brake(undefined, 24),
    ],
  },
  {
    id: 'dv6',
    name: 'DV6C / DV6FD / DV6FC · 1.6 e-HDi / BlueHDi',
    makes: PSA,
    codes: ['DV6C', 'DV6FD', 'DV6FC'],
    intervals: [
      oil(15000),
      fuel(30000, 24),
      { item: 'timing_belt', km: 180000, months: 120 },
      { item: 'adblue_additive_check', km: 15000, inspect: true },
    ],
  },
  {
    id: 'dv5',
    name: 'DV5RD / DV5RC · 1.5 BlueHDi',
    makes: PSA,
    codes: ['DV5RD', 'DV5RC'],
    intervals: [
      oil(15000),
      { item: 'chain_belt_inspection', km: 100000, inspect: true },
      fuel(30000, 24),
    ],
  },
  {
    id: 'ep6',
    name: 'EP6CDT / 5FV / 5FW · 1.6 THP / VTi',
    makes: PSA,
    codes: ['EP6CDT', '5FV', '5FW'],
    intervals: [oil(15000), plugs(30000, 24), ...filters(30000, 24)],
  },
  // ---- Ford ----
  {
    id: 'duratec-125',
    name: 'SNJB / STJB / M7JA · 1.25 Duratec',
    makes: ['ford'],
    codes: ['SNJB', 'STJB', 'M7JA'],
    intervals: [
      oil(20117),
      cabin(30000, 24),
      air(60000, 36),
      brake(undefined, 24),
      plugs(60000, 36),
      { item: 'timing_belt', km: 160000, months: 96 },
    ],
  },
  {
    id: 'ecoboost-10',
    name: 'M1DA / M1DD / SFJA · 1.0 EcoBoost',
    makes: ['ford'],
    codes: ['M1DA', 'M1DD', 'SFJA'],
    intervals: [
      oil(20000),
      plugs(40000, 24),
      ...filters(40000, 24),
      { item: 'wet_belt_oil_pump_belt', km: 200000, months: 120 },
    ],
  },
  {
    id: 'duratec-16',
    name: 'IQDB / PNDA · 1.6 Ti-VCT',
    makes: ['ford'],
    codes: ['IQDB', 'PNDA'],
    intervals: [
      oil(20000),
      plugs(60000),
      ...filters(40000, 24),
      { item: 'timing_belt', km: 160000, months: 96 },
    ],
  },
  // ---- Suzuki ----
  {
    id: 'k12',
    name: 'K12C / K12D · 1.2 Dualjet',
    makes: ['suzuki'],
    codes: ['K12C', 'K12D'],
    intervals: [oil(15000), ...filters(30000, 24), plugs(60000, 48), brake(undefined, 24)],
  },
  {
    id: 'k14',
    name: 'K14C / K14D · 1.4 Boosterjet',
    makes: ['suzuki'],
    codes: ['K14C', 'K14D'],
    intervals: [oil(15000), plugs(60000, 48), ...filters(30000, 24)],
  },
  {
    id: 'k10c',
    name: 'K10C · 1.0 Boosterjet',
    makes: ['suzuki'],
    codes: ['K10C'],
    intervals: [oil(15000), plugs(60000), ...filters(30000, 24)],
  },
];

/** The single engine family that applies to the vehicle, or null (unknown or ambiguous). */
export function engineFamilyFor(vehicle: {
  manufacturer: string;
  engineCode?: string | null;
  fuel?: string | null;
}): EngineFamily | null {
  const make = makeKey(vehicle.manufacturer);
  const codes = normalizeEngineCodes(vehicle.engineCode);
  if (!make || !codes.length) return null;
  const fuelType = fuelOf(vehicle.fuel ?? undefined);
  const hits = ENGINE_FAMILIES.filter(
    (f) =>
      f.makes.includes(make) &&
      codes.some(
        (c) =>
          f.codes.includes(c) ||
          (f.fuelCodes?.codes.includes(c) && fuelType && f.fuelCodes.fuels.includes(fuelType)),
      ),
  );
  return hits.length === 1 ? hits[0] : null;
}
