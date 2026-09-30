import { parseRegistration, type RegistrationNumber } from '@/domain';
import { formatPlateInput } from '@/features/onboarding/plateInput';

import { DataGovIlRegistry, PACKAGES, type HttpGet } from '../dataGovIl';
import {
  agreedModelFacts,
  factsFrom,
  MODEL_FIELDS,
  normalizeDate,
  PLATE_FIELDS,
  type RegistryFact,
} from '../vehicleRecord';

/**
 * Add Vehicle by plate — Ministry record normalization. Response SHAPES as published on
 * data.gov.il (checked 2026-09-30); plate and VIN values altered (no real vehicle).
 */

const byKey = (facts: RegistryFact[]) => Object.fromEntries(facts.map((f) => [f.key, f.value]));

describe('plate formatting while typing', () => {
  it.each([
    ['1', '1'],
    ['12', '12'],
    ['123', '12-3'],
    ['12345', '12-345'],
    ['123456', '12-345-6'],
    ['1234567', '12-345-67'],
    ['12345678', '123-45-678'],
    ['123456789', '123-45-678'], // max 8 digits
    ['12-3a4 5', '12-345'], // non-digits dropped, hyphens re-applied
  ])('%s → %s', (raw, formatted) => expect(formatPlateInput(raw)).toBe(formatted));
});

const plateRow = {
  mispar_rechev: 1111111,
  tozeret_cd: 778,
  sug_degem: 'P',
  tozeret_nm: 'סיאט ספרד',
  degem_cd: 26,
  degem_nm: '6J52E4',
  ramat_gimur: 'IE REFERENCE',
  ramat_eivzur_betihuty: null,
  kvutzat_zihum: 15,
  shnat_yitzur: 2012,
  degem_manoa: 'CGG',
  mivchan_acharon_dt: '2026-09-10',
  tokef_dt: '2027-08-25',
  baalut: 'פרטי',
  misgeret: 'VSSZZZ6JZCR000001',
  tzeva_cd: 11,
  tzeva_rechev: 'שחור מטלי',
  zmig_kidmi: '185/60 R15',
  zmig_ahori: '185/60 R15',
  sug_delek_nm: 'בנזין',
  horaat_rishum: 120184,
  moed_aliya_lakvish: '2012-8',
  kinuy_mishari: 'IBIZA',
};
const continuationRow = {
  mispar_rechev: 1111111,
  tozeret_cd: 778,
  sug_degem: 'P',
  degem_cd: 26,
  kod_omes_tzmig_kidmi: 84,
  kod_omes_tzmig_ahori: 84,
  kod_mehirut_tzmig_kidmi: 'H',
  kod_mehirut_tzmig_ahori: 'H',
  grira_nm: 'אין וו גרירה',
};
const catalogRow = {
  sug_degem: 'P',
  tozeret_cd: 778,
  tozeret_eretz_nm: 'ספרד',
  tozar: 'סיאט',
  degem_cd: 26,
  shnat_yitzur: 2012,
  nefah_manoa: 1390,
  mishkal_kolel: 1586,
  gova: null,
  hanaa_nm: '4X2',
  mazgan_ind: 1,
  abs_ind: 1,
  mispar_kariot_avir: 4,
  hege_koah_ind: 1,
  automatic_ind: 0,
  mispar_halonot_hashmal: 2,
  halon_bagg_ind: 0,
  galgaley_sagsoget_kala_ind: 1,
  merkav: "הצ'בק",
  mispar_dlatot: 5,
  koah_sus: 85,
  mispar_moshavim: 5,
  bakarat_yatzivut_ind: 1,
  kosher_grira_im_blamim: 750,
  kosher_grira_bli_blamim: 560,
  sug_tkina_nm: 'אירופאית',
  sug_mamir_nm: 'לא ידוע קוד 0',
  technologiat_hanaa_nm: 'הנעה רגילה',
  kamut_CO2: 139,
  kamut_NOX: 0.042,
  kamut_PM10: null,
  kamut_HC: 0.048,
  kamut_CO: 0.135,
  madad_yarok: 298,
  kvutzat_zihum: 15,
  bakarat_stiya_menativ_ind: 0,
  maarechet_ezer_labalam_ind: 1,
  matzlemat_reverse_ind: 0,
  hayshaney_lahatz_avir_batzmigim_ind: 1,
  nikud_betihut: null,
  alco_lock: 0,
};
/** The per-model QUANTITIES resource of the same package (statistics — must never be read). */
const quantitiesRow = {
  sug_degem: 'P',
  tozeret_cd: 778,
  tozeret_nm: 'סיאט ספרד',
  degem_cd: 26,
  shnat_yitzur: 2012,
  mispar_rechavim_pailim: 1234,
  mispar_rechavim_le_pailim: 56,
};

describe('normalization', () => {
  it('plate record: every valid field, dates normalized, nothing invented', () => {
    const f = byKey(factsFrom(plateRow, PLATE_FIELDS));
    expect(f).toMatchObject({
      manufacturerRegistered: 'סיאט ספרד',
      commercialName: 'IBIZA',
      modelCode: '6J52E4',
      trim: 'IE REFERENCE',
      modelYear: 2012,
      color: 'שחור מטלי',
      engineCode: 'CGG',
      fuel: 'בנזין',
      roadDate: '2012-08',
      lastTest: '2026-09-10',
      licenseValidUntil: '2027-08-25',
      ownership: 'פרטי',
      tireFront: '185/60 R15',
      registrationOrder: '120184',
      pollutionGroup: 15,
      vin: 'VSSZZZ6JZCR000001',
    });
    // A null safety level is absent — not "0", not "none".
    expect(f).not.toHaveProperty('safetyEquipmentLevel');
    expect(normalizeDate('2012-13')).toBeUndefined();
  });

  it('safety equipment: only positive features are kept; a "no" never appears', () => {
    const f = byKey(factsFrom(catalogRow, MODEL_FIELDS));
    expect(f).toMatchObject({
      abs: true,
      airbags: 4,
      stabilityControl: true,
      brakeAssist: true,
      tirePressureSensors: true,
    });
    for (const negative of ['laneDepartureWarning', 'reverseCamera', 'alcoLock', 'safetyScore']) {
      expect(f).not.toHaveProperty(negative);
    }
    // Same rule for equipment: no automatic gearbox, no sunroof → simply absent.
    expect(f).not.toHaveProperty('automatic');
    expect(f).not.toHaveProperty('sunroof');
    expect(f).toMatchObject({ airConditioning: true, alloyWheels: true, electricWindows: 2 });
  });

  it('environment: every available value is kept with its unit', () => {
    const env = factsFrom(catalogRow, MODEL_FIELDS).filter((x) => x.group === 'environment');
    expect(byKey(env)).toEqual({
      greenIndex: 298,
      pollutionGroup: 15,
      co2: 139,
      nox: 0.042,
      hc: 0.048,
      co: 0.135,
    });
    expect(env.find((x) => x.key === 'co2')?.unit).toBe('גרם/ק״מ');
  });

  it('"no towing hook" and "unknown code" are not values', () => {
    expect(byKey(factsFrom(continuationRow, PLATE_FIELDS))).not.toHaveProperty('towHitch');
    expect(byKey(factsFrom({ grira_nm: 'וו גרירה קבוע' }, PLATE_FIELDS))).toEqual({
      towHitch: 'וו גרירה קבוע',
    });
    expect(byKey(factsFrom({ sug_tkina_nm: 'לא ידוע קוד 0' }, MODEL_FIELDS))).toEqual({});
  });

  it('catalog rows that disagree (several trims) keep only the agreed facts', () => {
    const f = byKey(agreedModelFacts([catalogRow, { ...catalogRow, koah_sus: 105 }]));
    expect(f).not.toHaveProperty('horsepower');
    expect(f).toMatchObject({ displacement: 1390, abs: true });
  });
});

describe('Ministry lookup (data.gov.il)', () => {
  const RES = { main: 'r-main', cont: 'r-cont', wltp: 'r-wltp', qty: 'r-qty', moto: 'r-moto' };
  function api(records: Record<string, Record<string, unknown>[]>) {
    const calls: string[] = [];
    const get: HttpGet = async (url) => {
      calls.push(url);
      const u = new URL(url);
      if (u.pathname.endsWith('/package_show')) {
        const id = u.searchParams.get('id');
        const ids =
          id === PACKAGES.cars
            ? [RES.main, RES.cont]
            : id === PACKAGES.modelCatalog
              ? [RES.wltp, RES.qty]
              : [RES.moto];
        return {
          success: true,
          result: { resources: ids.map((i) => ({ id: i, datastore_active: true })) },
        };
      }
      const rid = u.searchParams.get('resource_id')!;
      const filters = JSON.parse(u.searchParams.get('filters') ?? '{}');
      const rows = (records[rid] ?? []).filter((r) =>
        Object.entries(filters).every(([k, v]) => r[k] === v),
      );
      return { success: true, result: { records: rows, total: rows.length } };
    };
    return { get, calls };
  }
  const plate = (s: string) => parseRegistration(s) as RegistrationNumber;

  it('plate record + continuation + model catalog → one record; statistics never read', async () => {
    const { get } = api({
      [RES.main]: [plateRow],
      [RES.cont]: [continuationRow],
      [RES.wltp]: [catalogRow],
      [RES.qty]: [quantitiesRow],
    });
    const r = await new DataGovIlRegistry({ get }).lookup(plate('11-111-11'), { consent: true });
    expect(r.status).toBe('found');
    if (r.status !== 'found') return;
    expect(r.candidates).toHaveLength(1);
    const c = r.candidates[0];
    expect(c).toMatchObject({ modelCode: '6J52E4', color: 'שחור מטלי', year: 2012 });
    const f = byKey(c.record!.facts);
    expect(f).toMatchObject({
      tireFrontLoad: '84',
      tireFrontSpeed: 'H',
      horsepower: 85,
      countryOfManufacture: 'ספרד',
      body: "הצ'בק",
      greenIndex: 298,
    });
    expect(JSON.stringify(c.record)).not.toMatch(/1234|mispar_rechavim/);
    expect(c.record!.sources).toEqual([RES.main, RES.cont, RES.wltp]);
  });

  it('not found and service failure are distinct outcomes', async () => {
    const { get } = api({});
    expect(
      await new DataGovIlRegistry({ get }).lookup(plate('22-222-22'), { consent: true }),
    ).toEqual({ status: 'not_found' });
    const down: HttpGet = async () => {
      throw new Error('ECONNRESET');
    };
    expect(
      await new DataGovIlRegistry({ get: down }).lookup(plate('22-222-22'), { consent: true }),
    ).toEqual({ status: 'unavailable', reason: 'network' });
  });
});
