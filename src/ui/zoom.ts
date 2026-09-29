/**
 * Pure geometry of the zoomable image viewer (no React). Coordinates are relative to the centre
 * of the viewport; the image is drawn "contain"-fitted and then transformed by
 * translate(tx, ty) · scale(s) around that centre.
 */
export interface Size {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface ZoomState {
  scale: number;
  tx: number;
  ty: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 5;
export const DOUBLE_TAP_SCALE = 2.5;
export const IDENTITY: ZoomState = { scale: 1, tx: 0, ty: 0 };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Size of the image when "contain"-fitted into the viewport (unknown image size: the viewport). */
export function containSize(viewport: Size, image: Size | null): Size {
  if (!image || image.width <= 0 || image.height <= 0) return viewport;
  const k = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * k, height: image.height * k };
}

/** Keeps the zoomed image covering the viewport where it can: no empty gap can be dragged in. */
export function clampState(s: ZoomState, viewport: Size, content: Size): ZoomState {
  const scale = clamp(s.scale, MIN_SCALE, MAX_SCALE);
  const maxX = Math.max(0, (content.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (content.height * scale - viewport.height) / 2);
  return { scale, tx: clamp(s.tx, -maxX, maxX), ty: clamp(s.ty, -maxY, maxY) };
}

/**
 * Two-finger pinch: the point under the fingers at the start stays under the fingers (the focal
 * point may also move, which pans).
 */
export function pinch(
  start: ZoomState,
  startDistance: number,
  distance: number,
  startFocal: Point,
  focal: Point,
): ZoomState {
  if (startDistance <= 0) return start;
  const scale = clamp((start.scale * distance) / startDistance, MIN_SCALE, MAX_SCALE);
  const k = scale / start.scale;
  return {
    scale,
    tx: focal.x - (startFocal.x - start.tx) * k,
    ty: focal.y - (startFocal.y - start.ty) * k,
  };
}

/** One-finger drag while zoomed. */
export function pan(start: ZoomState, dx: number, dy: number): ZoomState {
  return { scale: start.scale, tx: start.tx + dx, ty: start.ty + dy };
}

/** Double tap: zoom in on the tapped point, or back to the fitted view when already zoomed. */
export function doubleTap(current: ZoomState, at: Point): ZoomState {
  if (current.scale > MIN_SCALE + 0.01) return IDENTITY;
  const k = DOUBLE_TAP_SCALE / current.scale;
  return {
    scale: DOUBLE_TAP_SCALE,
    tx: at.x - (at.x - current.tx) * k,
    ty: at.y - (at.y - current.ty) * k,
  };
}

export const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
