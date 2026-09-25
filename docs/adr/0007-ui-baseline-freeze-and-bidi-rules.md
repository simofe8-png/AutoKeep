# ADR-0007: UI baseline freeze and bidi/text rules

- Status: accepted
- Date: 2026-09-26

## Context

M03 visual acceptance on a physical Android 16 device (he-IL) found RTL and bidi issues that unit tests could not catch. UX_DESIGN_BASELINE requires the UI to be frozen after M03.

## Decision

1. The approved UI is frozen as documented in `docs/ui-baseline/`.
2. Text rules (all enforced centrally in `src/ui`):
   - `Text` alignment is logical: `left` = start under RTL layout (ADR-0006).
   - `TextInput` alignment is physical: reading start is `right` (`INPUT_TEXT_ALIGN_START`).
   - Inline metadata is joined with `joinParts`/`SEP` (RLM-wrapped "·"), never with a raw " · ".
   - A string whose first strong character is Latin is prefixed with RLM (`ensureRtlParagraph`, applied by `AppText`).
   - Values and units are joined with a no-break space (`formatKm`, pages, days).
   - Identity text (vehicle name, registration) must never be truncated.
3. `KeyboardAvoidingView` uses `padding` on Android too (edge-to-edge window no longer resizes).
4. Tab labels are capped at font scale ×1.3, and the tab bar height is explicit and inset-aware.

## Consequences

Screens must use `AppText`, `TextField` and `joinParts` instead of raw RN primitives or string concatenation. Native-RTL release builds must re-verify TextInput alignment (tracked for M24 T182).
