import type { VehicleClass } from '@/identification/vehicleClass';
import type {
  ReferenceImageCatalog,
  ReferenceImageRecord,
} from '@/providers/referenceImages/types';

import { resolveReferenceImage } from '../referenceResolution';

const rec = (id: string, classKey: string): ReferenceImageRecord => ({
  id,
  classKey,
  imageUrl: `https://example.test/${id}.png`,
  imageSha256: id.padEnd(64, '0'),
  width: 1400,
  height: 730,
  label: 'תמונת דגם להמחשה',
  credit: `צילום: ${id} · CC BY-SA 4.0`,
  sourceUrl: `https://commons.example/${id}`,
  license: 'CC BY-SA 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  author: id,
});

function catalog(
  records: ReferenceImageRecord[] | 'down' | 'hang',
  fetch: 'ok' | 'down' = 'ok',
): ReferenceImageCatalog & { prefixes: string[][] } {
  const prefixes: string[][] = [];
  return {
    prefixes,
    lookup: async (p) => {
      prefixes.push([...p]);
      if (records === 'down') return { status: 'unavailable' };
      if (records === 'hang') return new Promise(() => undefined);
      return {
        status: 'ok',
        records: records.filter((r) => p.some((x) => r.classKey.startsWith(x))),
      };
    },
    fetchImage: async (r) =>
      fetch === 'ok'
        ? { status: 'ok', uri: `file:///cache/${r.id}.png` }
        : { status: 'unavailable' },
  };
}

const PRE_BLACK = rec('pre_black', 'v1/seat/ibiza/6j/pre-fl/hatchback-5d/black');
const PRE_WHITE = rec('pre_white', 'v1/seat/ibiza/6j/pre-fl/hatchback-5d/white');
const FL_BLACK = rec('fl_black', 'v1/seat/ibiza/6j/fl1/hatchback-5d/black');
const keyed = (key: string): VehicleClass => ({ kind: 'key', key });

describe('reference image resolution', () => {
  it('exact class and color → reference; only class attributes are sent', async () => {
    const c = catalog([PRE_WHITE, PRE_BLACK, FL_BLACK]);
    const r = await resolveReferenceImage(keyed(PRE_BLACK.classKey), c);
    expect(r).toMatchObject({ kind: 'reference', record: { id: 'pre_black' } });
    expect(c.prefixes).toEqual([['v1/seat/ibiza/6j/pre-fl/hatchback-5d/']]);
  });

  it('no image in the correct color → the correct class in its original color (never another phase)', async () => {
    const r = await resolveReferenceImage(
      keyed('v1/seat/ibiza/6j/pre-fl/hatchback-5d/red'),
      catalog([PRE_WHITE, FL_BLACK]),
    );
    expect(r).toMatchObject({ kind: 'reference', record: { id: 'pre_white' } });
  });

  it('nothing approved for the class → not_found (a different phase is never borrowed)', async () => {
    expect(await resolveReferenceImage(keyed(PRE_BLACK.classKey), catalog([FL_BLACK]))).toEqual({
      kind: 'not_found',
    });
    expect(await resolveReferenceImage({ kind: 'unsupported' }, catalog([PRE_BLACK]))).toEqual({
      kind: 'not_found',
    });
  });

  it('service or download failure → unavailable, never "no image"', async () => {
    expect(await resolveReferenceImage(keyed(PRE_BLACK.classKey), catalog('down'))).toEqual({
      kind: 'unavailable',
    });
    expect(
      await resolveReferenceImage(keyed(PRE_BLACK.classKey), catalog([PRE_BLACK], 'down')),
    ).toEqual({ kind: 'unavailable' });
  });

  it('no endless spinner: a hanging search times out as unavailable', async () => {
    const r = await resolveReferenceImage(keyed(PRE_BLACK.classKey), catalog('hang'), 50);
    expect(r).toEqual({ kind: 'unavailable' });
  });

  it('unknown phase → both fronts are offered for the visual question', async () => {
    const r = await resolveReferenceImage(
      {
        kind: 'needs_phase',
        keys: {
          'pre-fl': PRE_BLACK.classKey,
          fl1: FL_BLACK.classKey,
          fl2: 'v1/x/y/z/fl2/hatchback-5d/black',
        },
      },
      catalog([PRE_BLACK, FL_BLACK]),
    );
    expect(r).toMatchObject({
      kind: 'choose_phase',
      options: [
        { phase: 'pre-fl', record: { id: 'pre_black' } },
        { phase: 'fl1', record: { id: 'fl_black' } },
      ],
    });
  });
});
