import { ensureRtlParagraph, resolveTextAlign } from './rtl';

const RLM = String.fromCharCode(0x200f);

describe('ensureRtlParagraph', () => {
  it('prefixes RLM when the first strong character is Latin', () => {
    expect(ensureRtlParagraph('ABS · 300 סמ״ק')).toBe(`${RLM}ABS · 300 סמ״ק`);
    expect(ensureRtlParagraph('12 BMW')).toBe(`${RLM}12 BMW`);
  });

  it('leaves Hebrew-leading and neutral-only strings unchanged', () => {
    expect(ensureRtlParagraph('טויוטה Corolla')).toBe('טויוטה Corolla');
    expect(ensureRtlParagraph('84,250 ק״מ')).toBe('84,250 ק״מ');
    expect(ensureRtlParagraph('12-345-67')).toBe('12-345-67');
  });
});

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
