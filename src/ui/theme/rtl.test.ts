import { resolveTextAlign } from './rtl';

describe('resolveTextAlign', () => {
  // Under an RTL layout direction RN interprets left/right as start/end (ADR-0006).
  it('maps logical start/end to RN start/end values', () => {
    expect(resolveTextAlign('start')).toBe('left');
    expect(resolveTextAlign('end')).toBe('right');
  });

  it('keeps center', () => {
    expect(resolveTextAlign('center')).toBe('center');
  });
});
