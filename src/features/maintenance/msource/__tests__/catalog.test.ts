import { catalogFor } from '../catalog';
import { MSOURCE_CATALOG } from '../catalogData';

/**
 * Catalog hygiene: an entry serves a vehicle only when every class-key segment is identical
 * (engine codes exactly, never as a substring or prefix). The single tolerance is a vehicle whose
 * transmission is unknown. An empty engine code never matches an entry that names one.
 */
const swap = (key: string, index: number, value: string) =>
  key
    .split('|')
    .map((x, i) => (i === index ? value : x))
    .join('|');

const ENGINE = 5;
const TRANSMISSION = 7;

describe('catalogFor', () => {
  const withCode = MSOURCE_CATALOG.find((c) => c.classKey.split('|')[ENGINE] !== '');

  it('has at least one entry that names an engine code (fixture for these checks)', () => {
    expect(withCode).toBeDefined();
  });

  it('serves an exact class key', () => {
    expect(catalogFor(withCode!.classKey).length).toBeGreaterThan(0);
  });

  it('never matches an engine code by prefix, substring or absence', () => {
    const code = withCode!.classKey.split('|')[ENGINE];
    for (const other of [code.slice(0, -1), `${code}X`, `X${code}`, '']) {
      expect(catalogFor(swap(withCode!.classKey, ENGINE, other))).toEqual([]);
    }
  });

  it('serves a vehicle whose transmission is unknown, but never a different transmission', () => {
    const k = withCode!.classKey;
    if (k.split('|')[TRANSMISSION] === '') return;
    expect(catalogFor(swap(k, TRANSMISSION, '')).length).toBeGreaterThan(0);
    const other = k.split('|')[TRANSMISSION] === 'manual' ? 'automatic' : 'manual';
    expect(catalogFor(swap(k, TRANSMISSION, other))).toEqual([]);
  });

  it('never matches a different year, displacement or fuel', () => {
    const k = withCode!.classKey;
    const [, , , year, cc, , fuel] = k.split('|');
    expect(catalogFor(swap(k, 3, String(Number(year) + 1)))).toEqual([]);
    expect(catalogFor(swap(k, 4, String(Number(cc) + 1)))).toEqual([]);
    expect(catalogFor(swap(k, 6, fuel === 'diesel' ? 'petrol' : 'diesel'))).toEqual([]);
  });
});
