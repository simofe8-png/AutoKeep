import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii, spacing, touchTarget, type ColorToken } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
  style?: ViewStyle;
}

const palette: Record<
  ButtonVariant,
  { bg: string; bgPressed: string; fg: ColorToken; border?: string }
> = {
  primary: { bg: colors.primary, bgPressed: colors.primaryPressed, fg: 'textOnPrimary' },
  secondary: {
    bg: colors.surface,
    bgPressed: colors.primarySoft,
    fg: 'primary',
    border: colors.primaryBorder,
  },
  ghost: { bg: 'transparent', bgPressed: colors.primarySoft, fg: 'primary' },
  danger: { bg: colors.danger, bgPressed: colors.dangerPressed, fg: 'textOnPrimary' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
  style,
}: ButtonProps) {
  const p = palette[variant];
  const inactive = disabled || loading;
  const fg: ColorToken = inactive ? 'textDisabled' : p.fg;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      android_ripple={inactive ? undefined : { color: colors.primarySoft }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor:
            inactive && variant !== 'ghost' ? colors.neutralSoft : pressed ? p.bgPressed : p.bg,
          borderColor:
            inactive && variant !== 'ghost' ? colors.border : (p.border ?? 'transparent'),
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator color={colors.textDisabled} />
        ) : icon ? (
          <Icon name={icon} size={20} color={fg} />
        ) : null}
        <AppText variant="bodyStrong" color={fg} align="center">
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  fullWidth: { alignSelf: 'stretch' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
