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

/** Icons that imply direction ("forward", "back") must use these names, not raw chevrons. */
export const directionalIcons = {
  forward: 'chevron-left',
  back: 'chevron-right',
} as const;
