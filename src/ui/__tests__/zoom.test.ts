import {
  clampState,
  containSize,
  doubleTap,
  IDENTITY,
  MAX_SCALE,
  pan,
  pinch,
  type ZoomState,
} from '../zoom';

const viewport = { width: 400, height: 800 };
const content = containSize(viewport, { width: 4000, height: 3000 }); // 400 x 300

describe('zoomable image geometry', () => {
  it('contain-fits the image; unknown size falls back to the viewport', () => {
    expect(content).toEqual({ width: 400, height: 300 });
    expect(containSize(viewport, null)).toEqual(viewport);
  });

  it('pinch keeps the point under the fingers fixed and respects the limits', () => {
    const z = pinch(IDENTITY, 100, 200, { x: 50, y: 20 }, { x: 50, y: 20 });
    expect(z.scale).toBe(2);
    // The image point that was under the fingers (50, 20) is still there: tx + 50*2 = 50.
    expect(z.tx + 50 * z.scale).toBeCloseTo(50);
    expect(z.ty + 20 * z.scale).toBeCloseTo(20);
    expect(pinch(IDENTITY, 100, 5000, { x: 0, y: 0 }, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(pinch(IDENTITY, 100, 10, { x: 0, y: 0 }, { x: 0, y: 0 }).scale).toBe(1);
  });

  it('pan is clamped so no empty gap can be dragged into view', () => {
    const zoomed: ZoomState = { scale: 2, tx: 0, ty: 0 };
    const far = clampState(pan(zoomed, 1000, 1000), viewport, content);
    expect(far.tx).toBe(200); // (400*2 - 400) / 2
    expect(far.ty).toBe(0); // 300*2 < 800: the image still fits vertically
    expect(clampState(pan(IDENTITY, 50, 50), viewport, content)).toEqual(IDENTITY);
  });

  it('double tap zooms in on the tapped point, and again resets', () => {
    const z = doubleTap(IDENTITY, { x: 40, y: 0 });
    expect(z.scale).toBe(2.5);
    expect(z.tx + 40 * 2.5).toBeCloseTo(40);
    expect(doubleTap(z, { x: 0, y: 0 })).toEqual(IDENTITY);
  });
});
