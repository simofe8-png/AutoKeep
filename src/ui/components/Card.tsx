import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, elevation, radii, spacing } from '../theme';

export type CardTone =
  'default' | 'highlight' | 'tint' | 'muted' | 'success' | 'warning' | 'danger';

export interface CardProps {
  children: ReactNode;
  tone?: CardTone;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  padded?: boolean;
  /** Horizontal padding only — for cards that wrap ListRows. */
  compact?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const toneStyles: Record<CardTone, ViewStyle> = {
  default: { backgroundColor: colors.surface, borderColor: colors.border },
  highlight: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  muted: { backgroundColor: colors.surfaceMuted, borderColor: colors.divider },
  tint: { backgroundColor: colors.surfaceTint, borderColor: colors.primaryBorder },
  success: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  warning: { backgroundColor: colors.warningSoft, borderColor: colors.warningBorder },
  danger: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder },
};

/** Rounded container. Pressable when `onPress` is given (then exposed as a button). */
export function Card({
  children,
  tone = 'default',
  onPress,
  accessibilityLabel,
  accessibilityHint,
  padded = true,
  compact = false,
  style,
  testID,
}: CardProps) {
  const base = [
    styles.card,
    toneStyles[tone],
    compact ? styles.compact : padded && styles.padded,
    style,
  ];
  if (!onPress) {
    return (
      <View testID={testID} style={base} accessibilityLabel={accessibilityLabel}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      android_ripple={{ color: colors.primarySoft }}
      style={({ pressed }) => [...base, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...elevation.card,
  },
  padded: { padding: spacing.lg },
  compact: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  pressed: { opacity: 0.92 },
});
