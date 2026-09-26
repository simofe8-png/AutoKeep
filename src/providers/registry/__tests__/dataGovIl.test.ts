import { parseRegistration, type RegistrationNumber } from '@/domain';
import { engineLiters } from '@/discovery/applicability';
import { identifyByRegistration } from '@/identification/registry';

import { DataGovIlRegistry, PACKAGES, type HttpGet } from '../dataGovIl';

/**
 * Recorded data.gov.il response SHAPES (field names as published 2026-09-26) with altered plate
 * and VIN values — no real vehicle is identifiable from these fixtures.
 */
const RES = {
  moto: 'res-moto',
  carsMain: 'res-cars-main',
  carsCodes: 'res-cars-codes',
  wltp: 'res-wltp',
};

function fakeApi(
  opts: {
    records?: Record<string, Record<string, unknown>[]>;
    fail?: 'network' | 'bad' | 'hang';
  } = {},
) {
  const calls: string[] = [];
  const get: HttpGet = async (url, signal) => {
    calls.push(url);
    if (opts.fail === 'network') throw new Error('ECONNRESET');
    if (opts.fail === 'bad') return { success: false };
    if (opts.fail === 'hang') {
      return new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    }
    const u = new URL(url);
    if (u.pathname.endsWith('/package_show')) {
      const id = u.searchParams.get('id');
      const res =
        id === PACKAGES.twoWheelers
          ? [{ id: RES.moto, datastore_active: true }]
          : id === PACKAGES.cars
            ? [
                { id: RES.carsMain, datastore_active: true },
                { id: RES.carsCodes, datastore_active: true },
                { id: 'res-archive', datastore_active: false },
              ]
            : [{ id: RES.wltp, datastore_active: true }];
      return { success: true, result: { resources: res } };
    }
    const rid = u.searchParams.get('resource_id')!;
    const filters = JSON.parse(u.searchParams.get('filters') ?? '{}');
    const rows = (opts.records?.[rid] ?? []).filter((r) =>
      Object.entries(filters).every(([k, v]) => r[k] === v),
    );
    return { success: true, result: { records: rows, total: rows.length } };
  };
  return { get, calls };
}

const plate = (s: string) => parseRegistration(s) as RegistrationNumber;

const motoRow = {
  _id: 1,
  mispar_rechev: 1234567,
  tozeret_cd: 312,
  tozeret_nm: 'הונדה יפן',
  tozeret_eretz_nm: 'יפן',
  degem_nm: 'CB500F',
  shnat_yitzur: 2021,
  sug_delek_nm: 'בנזין',
  nefach_manoa: 471,
  misgeret: 'MLHPC0000M0000001',
  sug_rechev_EU_cd: 'L3',
  sug_rechev_nm: 'אופנוע',
  baalut: 'פרטי',
};
const carRow = {
  _id: 2,
  mispar_rechev: 2345678,
  tozeret_cd: 413,
  tozeret_nm: 'טויוטה אנגליה',
  degem_nm: 'ZRE181L-GEFNKW',
  kinuy_mishari: 'COROLLA',
  shnat_yitzur: 2019,
  ramat_gimur: 'SUN',
  degem_manoa: '1ZR',
  sug_delek_nm: 'בנזין',
  misgeret: 'SB1ZS3JE00E000001',
  baalut: 'פרטי',
};
const codesRow = { _id: 3, mispar_rechev: 3456789, tozeret_cd: 1014, sug_degem: 'P', degem_cd: 4 };
const wltp = (year: number, trim: string) => ({
  tozeret_cd: 1014,
  degem_cd: 4,
  sug_degem: 'P',
  tozar: 'בי ווי די',
  tozeret_nm: 'בי ווי די סין',
  degem_nm: 'SC2E-SC2E',
  kinuy_mishari: 'ATTO 3',
  shnat_yitzur: year,
  ramat_gimur: trim,
  nefah_manoa: 0,
  delek_nm: 'חשמל',
});

describe('data.gov.il registry provider (ADR-0012)', () => {
  it('refuses to send anything without consent', async () => {
    const api = fakeApi();
    const r = await new DataGovIlRegistry({ get: api.get }).lookup(plate('12-345-67'), {
      consent: false,
    });
    expect(r).toEqual({ status: 'consent_required' });
    expect(api.calls).toEqual([]);
  });

  it('resolves resources from stable package names and queries only by exact plate', async () => {
    const api = fakeApi({ records: { [RES.moto]: [motoRow] } });
    const r = await new DataGovIlRegistry({ get: api.get }).lookup(plate('12-345-67'), {
      consent: true,
    });
    expect(r.status).toBe('found');
    expect(api.calls.some((c) => c.includes('package_show') && c.includes(PACKAGES.cars))).toBe(
      true,
    );
    const searches = api.calls.filter((c) => c.includes('datastore_search'));
    expect(searches.every((c) => decodeURIComponent(c).includes('"mispar_rechev":1234567'))).toBe(
      true,
    );
    expect(searches.some((c) => c.includes('res-archive'))).toBe(false); // inactive resources skipped
  });

  it('maps a two-wheeler row (manufacturer without country, type from category)', async () => {
    const api = fakeApi({ records: { [RES.moto]: [motoRow] } });
    const r = await new DataGovIlRegistry({ get: api.get }).lookup(plate('12-345-67'), {
      consent: true,
    });
    expect(r.status === 'found' && r.candidates).toEqual([
      expect.objectContaining({
        type: 'motorcycle',
        manufacturer: 'הונדה',
        model: 'CB500F',
        year: 2021,
        engine: '471 סמ״ק',
        vin: 'MLHPC0000M0000001',
        dataset: PACKAGES.twoWheelers,
      }),
    ]);
  });

  it('maps a named car row (commercial name, trim, engine code kept but never read as liters)', async () => {
    const api = fakeApi({ records: { [RES.carsMain]: [carRow] } });
    const r = await new DataGovIlRegistry({ get: api.get }).lookup(plate('23-456-78'), {
      consent: true,
    });
    expect(r.status === 'found' && r.candidates[0]).toMatchObject({
      type: 'car',
      model: 'COROLLA',
      year: 2019,
      trim: 'SUN',
      engine: '1ZR',
    });
    expect(engineLiters('1ZR')).toBeNull();
  });

  it('code-only rows resolve through the model catalog; several variants → user selects', async () => {
    const api = fakeApi({
      records: {
        [RES.carsCodes]: [codesRow],
        [RES.wltp]: [wltp(2022, 'COMFORT'), wltp(2023, 'COMFORT')],
      },
    });
    const registry = new DataGovIlRegistry({ get: api.get });
    const result = await identifyByRegistration('34-567-89', registry, true);
    expect(result.kind).toBe('needs_selection');
    if (result.kind === 'needs_selection') {
      expect(result.candidates.map((c) => c.year)).toEqual([2022, 2023]);
      expect(result.draft.registration).toMatchObject({ origin: 'registry' });
    }
  });

  it('single match → registry-origin draft that outranks OCR but never user input', async () => {
    const api = fakeApi({ records: { [RES.moto]: [motoRow] } });
    const result = await identifyByRegistration(
      '12-345-67',
      new DataGovIlRegistry({ get: api.get }),
      true,
      {
        model: { value: 'CB5OOF', origin: 'scan', confidence: 0.7, uncertain: true },
        fuel: { value: 'חשמל', origin: 'user', confidence: null, uncertain: false },
      },
    );
    expect(result.kind).toBe('draft');
    if (result.kind !== 'draft') return;
    expect(result.draft.model).toEqual({
      value: 'CB500F',
      origin: 'registry',
      confidence: null,
      uncertain: false,
    });
    expect(result.draft.fuel?.origin).toBe('user');
    expect(result.uncertain).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('not found / network / bad response / timeout fail in context', async () => {
    const reg = (o: Parameters<typeof fakeApi>[0], timeoutMs?: number) =>
      new DataGovIlRegistry({ get: fakeApi(o).get, timeoutMs });
    expect(await reg({}).lookup(plate('99-999-99'), { consent: true })).toEqual({
      status: 'not_found',
    });
    expect(await reg({ fail: 'network' }).lookup(plate('12-345-67'), { consent: true })).toEqual({
      status: 'unavailable',
      reason: 'network',
    });
    expect(await reg({ fail: 'bad' }).lookup(plate('12-345-67'), { consent: true })).toEqual({
      status: 'unavailable',
      reason: 'bad_response',
    });
    expect(await reg({ fail: 'hang' }, 20).lookup(plate('12-345-67'), { consent: true })).toEqual({
      status: 'unavailable',
      reason: 'timeout',
    });
    expect(await identifyByRegistration('abc', reg({}), true)).toEqual({
      kind: 'failed',
      reason: 'registry_not_found',
    });
  });

  it('caches resolved resources, then re-resolves after the TTL (ministry republishes)', async () => {
    const api = fakeApi({ records: {} });
    let t = 0;
    const r = new DataGovIlRegistry({ get: api.get, now: () => t, resourceTtlMs: 1000 });
    await r.lookup(plate('12-345-67'), { consent: true });
    await r.lookup(plate('12-345-67'), { consent: true });
    const shows = () => api.calls.filter((c) => c.includes('package_show')).length;
    expect(shows()).toBe(2);
    t = 5000;
    await r.lookup(plate('12-345-67'), { consent: true });
    expect(shows()).toBe(4);
  });
});
