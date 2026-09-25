import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, elevation, radii, spacing } from '../theme';

export type CardTone = 'default' | 'highlight' | 'muted' | 'warning' | 'danger';

export interface CardProps {
  children: ReactNode;
  tone?: CardTone;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  padded?: boolean;
  style?: ViewStyle;
  testID?: string;
}

const toneStyles: Record<CardTone, ViewStyle> = {
  default: { backgroundColor: colors.surface, borderColor: colors.border },
  highlight: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  muted: { backgroundColor: colors.surfaceMuted, borderColor: colors.divider },
  warning: { backgroundColor: colors.warningSoft, borderColor: '#F2D49B' },
  danger: { backgroundColor: colors.dangerSoft, borderColor: '#F4C4C0' },
};

/** Rounded container. Pressable when `onPress` is given (then exposed as a button). */
export function Card({
  children,
  tone = 'default',
  onPress,
  accessibilityLabel,
  accessibilityHint,
  padded = true,
  style,
  testID,
}: CardProps) {
  const base = [styles.card, toneStyles[tone], padded && styles.padded, style];
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
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    ...elevation.card,
  },
  padded: { padding: spacing.lg },
  pressed: { opacity: 0.92 },
});
