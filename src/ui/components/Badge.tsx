import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing, type ColorToken } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
  testID?: string;
}

const toneMap: Record<BadgeTone, { bg: string; fg: ColorToken }> = {
  neutral: { bg: colors.neutralSoft, fg: 'neutral' },
  info: { bg: colors.primarySoft, fg: 'primary' },
  success: { bg: colors.successSoft, fg: 'success' },
  warning: { bg: colors.warningSoft, fg: 'warning' },
  danger: { bg: colors.dangerSoft, fg: 'danger' },
};

/** Small status pill. Colour is never the only signal: a text label is always present. */
export function Badge({ label, tone = 'neutral', icon, testID }: BadgeProps) {
  const t = toneMap[tone];
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <Icon name={icon} size={14} color={t.fg} /> : null}
      <AppText variant="smallStrong" color={t.fg}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radii.pill,
  },
});
