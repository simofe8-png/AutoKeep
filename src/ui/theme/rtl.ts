/**
 * AutoKeep is Hebrew RTL from the beginning.
 *
 * Direction is established in three layers so it holds both in native builds and in Expo Go
 * (which resets native RTL preferences, see ADR-0005):
 *  1. `expo-localization` plugin `forcesRTL` for native builds (app.json).
 *  2. expo-router `LocaleProvider direction="rtl"` for navigators.
 *  3. Root view style `direction: 'rtl'` for all content (Yoga layout direction).
 *
 * Layout code must use logical properties (`start`/`end`, `marginStart`, `row`) and never
 * physical left/right. Text alignment is resolved here only.
 */
export const APP_DIRECTION = 'rtl' as const;

export const rootDirectionStyle = { direction: APP_DIRECTION } as const;

/**
 * Maps logical text alignment to the value React Native expects.
 *
 * Verified on device (Android 16, Expo Go, native isRTL=false, root direction rtl — see
 * ADR-0006): inside an RTL layout direction React Native treats `left`/`right` as start/end,
 * independent of `I18nManager.isRTL`. `left` renders at the right (reading-start) edge and
 * `right` at the left edge, for single- and multi-line text alike. Native RTL builds behave the
 * same way (doLeftAndRightSwapInRTL). Hence the logical mapping below is direction-agnostic.
 */
export function resolveTextAlign(align: 'start' | 'center' | 'end'): 'left' | 'right' | 'center' {
  if (align === 'center') return 'center';
  return align === 'start' ? 'left' : 'right';
}

/**
 * TextInput does NOT get the left/right swap that Text gets: on device, `left` rendered input at
 * the physical left edge inside the RTL root (M03). Reading start for inputs is therefore the
 * physical right edge. Native-RTL release builds are re-verified in M24 (T182).
 */
export const INPUT_TEXT_ALIGN_START = 'right' as const;

const RLM = String.fromCharCode(0x200f);
const HEBREW = /[֐-׿]/;
const LATIN = /[A-Za-zÀ-ɏ]/;

/**
 * Android picks a paragraph's direction from its first strong character. A Hebrew UI string that
 * starts with Latin (e.g. "ABS · 300 סמ״ק" or a manufacturer like "BMW") would become an LTR
 * paragraph and reorder its parts (device-verified, M03). Prefix a RIGHT-TO-LEFT MARK only in
 * that case; Hebrew-leading and neutral-leading strings are returned unchanged.
 */
export function ensureRtlParagraph(text: string): string {
  for (const ch of text) {
    if (HEBREW.test(ch)) return text;
    if (LATIN.test(ch)) return RLM + text;
  }
  return text;
}

/**
 * Icons that imply direction must use these names, not raw chevrons. They follow the approved
 * visual references (docs/design/approved/): row/card affordances are drawn ">" and the header
 * back control "<" at the physical left.
 */
export const directionalIcons = {
  forward: 'chevron-right',
  back: 'chevron-left',
} as const;
