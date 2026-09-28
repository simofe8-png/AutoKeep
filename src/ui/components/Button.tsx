import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radii, spacing, touchTarget, type ColorToken } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type ButtonVariant =
  'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerOutline' | 'success' | 'attention';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** 'sm' for actions inside cards (still ≥ the minimum touch target). */
  size?: 'md' | 'sm';
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
  danger: { bg: colors.dangerStrong, bgPressed: colors.danger, fg: 'textOnPrimary' },
  dangerOutline: {
    bg: colors.surface,
    bgPressed: colors.dangerSoft,
    fg: 'danger',
    border: colors.dangerStrong,
  },
  success: { bg: colors.successStrong, bgPressed: colors.success, fg: 'textOnPrimary' },
  attention: { bg: colors.attention, bgPressed: colors.attentionPressed, fg: 'textPrimary' },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  size = 'md',
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
        size === 'sm' && styles.small,
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
        <AppText variant={size === 'sm' ? 'smallStrong' : 'bodyStrong'} color={fg} align="center">
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget + 4,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  small: { minHeight: touchTarget, paddingHorizontal: spacing.lg },
  fullWidth: { alignSelf: 'stretch' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
