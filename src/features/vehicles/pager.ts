/**
 * Pure paging rules of the Home vehicle cards (payment-card style). Direction follows the reading
 * order: in RTL the first card is at the right and the next card comes in from the LEFT, so a
 * finger moving left→right (dx > 0) advances to the next vehicle.
 */
export const SWIPE_DISTANCE = 0.25; // of the card width
export const SWIPE_VELOCITY = 0.4; // px/ms

/** +1 for RTL (content moves right to reveal the next card), -1 for LTR. */
export const advanceSign = (rtl: boolean) => (rtl ? 1 : -1);

/** Physical x offset of card i relative to card 0. */
export const cardOffset = (i: number, width: number, rtl: boolean) => -advanceSign(rtl) * i * width;

/** Row translation that shows card `index`, plus the live drag. */
export const rowTranslate = (index: number, width: number, rtl: boolean, drag = 0) =>
  advanceSign(rtl) * index * width + drag;

/** Card to settle on after a horizontal drag of dx (px) released at velocity vx (px/ms). */
export function settleIndex(
  index: number,
  count: number,
  dx: number,
  vx: number,
  width: number,
  rtl: boolean,
): number {
  if (count <= 1 || width <= 0) return 0;
  const toward = advanceSign(rtl) * dx; // > 0: toward the next card
  const velocity = advanceSign(rtl) * vx;
  let next = index;
  if (toward > width * SWIPE_DISTANCE || velocity > SWIPE_VELOCITY) next = index + 1;
  else if (toward < -width * SWIPE_DISTANCE || velocity < -SWIPE_VELOCITY) next = index - 1;
  return Math.max(0, Math.min(count - 1, next));
}

/** Drag resistance past the first / last card, so the ends feel bounded. */
export function resistedDrag(index: number, count: number, dx: number, rtl: boolean): number {
  const toward = advanceSign(rtl) * dx;
  const atEnd = (toward > 0 && index >= count - 1) || (toward < 0 && index <= 0);
  return atEnd ? dx / 4 : dx;
}
