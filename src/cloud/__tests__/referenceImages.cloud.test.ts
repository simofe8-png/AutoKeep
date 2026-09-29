import { adminClient, anonClient, userClient } from '../testing/localStack';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { execFileSync } = require('child_process') as {
  execFileSync: (file: string, args: string[], opts: object) => string;
};

/**
 * Approved vehicle model reference images (owner decisions 2026-09-29): the catalog is readable by
 * the app (anon + signed-in) — approved rows only — and writable only by the operator tool with the
 * service role. The rights record is stored with the row, independently of the binary.
 */
const suffix = Math.random().toString(36).slice(2, 8);
const approved = {
  id: `test_ref_${suffix}_ok`,
  class_key: `v1/testmake/testmodel/g1/pre-fl/hatchback-5d/black${suffix}`.replace(
    /black.*/,
    'black',
  ),
  status: 'approved',
  storage_path: `test/${suffix}.png`,
  image_sha256: 'a'.repeat(64),
  width: 10,
  height: 10,
  label: 'תמונת דגם להמחשה',
  credit: 'צילום: Test · CC BY-SA 4.0',
  source_url: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
  license: 'CC BY-SA 4.0',
  license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
  author: 'Test',
  modification_notice: 'הרקע הוסר על ידי AutoKeep',
  record: { rights: { adaptationsAllowed: true } },
};
const withdrawn = { ...approved, id: `test_ref_${suffix}_wd`, status: 'withdrawn' };

beforeAll(async () => {
  const { error } = await adminClient()
    .from('vehicle_reference_images')
    .insert([approved, withdrawn]);
  if (error) throw error;
});
afterAll(async () => {
  await adminClient()
    .from('vehicle_reference_images')
    .delete()
    .in('id', [approved.id, withdrawn.id]);
});

describe('vehicle reference image catalog (RLS)', () => {
  it('the app reads approved records without an account; withdrawn ones are invisible', async () => {
    const { data, error } = await anonClient()
      .from('vehicle_reference_images')
      .select('id, status, credit, record')
      .in('id', [approved.id, withdrawn.id]);
    expect(error).toBeNull();
    expect(data).toEqual([
      { id: approved.id, status: 'approved', credit: approved.credit, record: approved.record },
    ]);
  });

  it('neither anonymous nor signed-in users can write or change the catalog', async () => {
    const user = await userClient('refimg');
    for (const client of [anonClient(), user.client]) {
      const ins = await client
        .from('vehicle_reference_images')
        .insert({ ...approved, id: `test_ref_${suffix}_x` });
      expect(ins.error).not.toBeNull();
      await client
        .from('vehicle_reference_images')
        .update({ status: 'withdrawn' })
        .eq('id', approved.id);
      await client.from('vehicle_reference_images').delete().eq('id', approved.id);
    }
    const { data } = await adminClient()
      .from('vehicle_reference_images')
      .select('status')
      .eq('id', approved.id)
      .single();
    expect(data?.status).toBe('approved');
  });

  it('the bucket is public for reading and closed for writing', async () => {
    const { data: bucket } = await adminClient().storage.getBucket('vehicle-references');
    expect(bucket).toMatchObject({ public: true });
    const up = await anonClient()
      .storage.from('vehicle-references')
      .upload(`test/${suffix}-anon.png`, new Uint8Array([1, 2, 3]), { contentType: 'image/png' });
    expect(up.error).not.toBeNull();
  });
});

describe('operator tool: fail-closed publishing', () => {
  it('refuses unapproved, non-commercial, non-adaptable or hash-mismatched records', () => {
    const script = `
      import { validateRecord } from './tools/reference-images.mjs';
      import { readFileSync } from 'node:fs';
      const id = 'ref_seat_ibiza_6j_prefl_hatch5d_black_01';
      const rec = JSON.parse(readFileSync('data/reference-images/' + id + '.json', 'utf8'));
      const png = readFileSync('data/reference-images/' + id + '.png');
      const clone = (f) => { const c = structuredClone(rec); f(c); return c; };
      const out = {
        ok: validateRecord(rec, png),
        unapproved: validateRecord(clone((c) => (c.review.status = 'pending')), png),
        nonCommercial: validateRecord(clone((c) => (c.rights.commercialUseAllowed = false)), png),
        noAdaptations: validateRecord(clone((c) => (c.rights.adaptationsAllowed = false)), png),
        tampered: validateRecord(rec, Buffer.concat([png, Buffer.from([0])])),
      };
      console.log(JSON.stringify(out));`;
    const out = JSON.parse(
      execFileSync(
        process.execPath,
        ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', script],
        { encoding: 'utf8' },
      ),
    );
    expect(out.ok).toEqual([]);
    expect(out.unapproved.join()).toMatch(/approved/);
    expect(out.nonCommercial.join()).toMatch(/commercial/);
    expect(out.noAdaptations.join()).toMatch(/adaptations/);
    expect(out.tampered.join()).toMatch(/sha256/);
  });
});
