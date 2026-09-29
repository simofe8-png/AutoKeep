import { cardOffset, resistedDrag, rowTranslate, settleIndex } from '../pager';

const W = 400;

describe('Home vehicle pager (RTL payment-card swipe)', () => {
  it('RTL: the next card sits to the LEFT and is revealed by moving the row right', () => {
    expect(cardOffset(1, W, true)).toBe(-400);
    expect(rowTranslate(1, W, true)).toBe(400);
    // LTR mirrors it.
    expect(cardOffset(1, W, false)).toBe(400);
    expect(rowTranslate(1, W, false)).toBe(-400);
  });

  it('RTL: a left→right swipe past a quarter card (or a flick) advances; the reverse goes back', () => {
    expect(settleIndex(0, 3, 150, 0, W, true)).toBe(1);
    expect(settleIndex(0, 3, 40, 0.8, W, true)).toBe(1);
    expect(settleIndex(1, 3, -150, 0, W, true)).toBe(0);
    expect(settleIndex(1, 3, 60, 0.1, W, true)).toBe(1); // too short: stays
    expect(settleIndex(0, 3, 150, 0, W, false)).toBe(0); // LTR: that is "back" from the first
  });

  it('never leaves the ends; one vehicle never pages', () => {
    expect(settleIndex(2, 3, 300, 2, W, true)).toBe(2);
    expect(settleIndex(0, 3, -300, -2, W, true)).toBe(0);
    expect(settleIndex(0, 1, 300, 2, W, true)).toBe(0);
    expect(resistedDrag(2, 3, 100, true)).toBe(25);
    expect(resistedDrag(1, 3, 100, true)).toBe(100);
  });
});
