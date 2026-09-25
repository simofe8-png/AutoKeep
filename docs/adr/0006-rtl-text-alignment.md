# ADR-0006: RTL text alignment is logical (left = start) under RTL layout direction

- Status: accepted
- Date: 2026-09-25

## Context

Expo Go resets native RTL (`I18nManager.isRTL=false`), so AutoKeep applies RTL through the Yoga root `direction: 'rtl'` plus expo-router `LocaleProvider`. It was unclear how `textAlign` behaves in that setup.

## Evidence (device: Samsung SM-A546E, Android 16, he-IL, Expo Go SDK 57)

A diagnostic matrix of single-line and multi-line Text with textAlign right/left/auto/undefined inside the RTL root showed:

- `right` renders at the **left** edge; `left`, `auto` and undefined render at the **right** edge.
- The behaviour is identical for single-line (`numberOfLines=1`) and multi-line text, and for Latin-leading strings.
  RN swaps left/right based on the node's layout direction, not only `I18nManager.isRTL`. Native RTL builds swap the same way (`doLeftAndRightSwapInRTL`).

## Decision

`resolveTextAlign('start') === 'left'`, `'end' === 'right'`. It is used through `AppText`/`TextField` only. Layout uses logical start/end properties.

## Consequences

Alignment is consistent in Expo Go and native builds. Any future physical-alignment need must go through `src/ui/theme/rtl.ts`.
