import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, directionalIcons, spacing, touchTarget } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Content shown at the end of the row (short values only). */
  trailing?: ReactNode;
  /** Content under the subtitle (badges) — keeps the text column wide at large font sizes. */
  below?: ReactNode;
  onPress?: () => void;
  showChevron?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export function ListRow({
  title,
  subtitle,
  icon,
  trailing,
  below,
  onPress,
  showChevron = onPress != null,
  accessibilityLabel,
  testID,
}: ListRowProps) {
  const body = (
    <>
      {icon ? (
        <View style={styles.iconWrap}>
          <Icon name={icon} size={22} color="primary" />
        </View>
      ) : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{title}</AppText>
        {subtitle ? (
          <AppText variant="small" color="textMuted">
            {subtitle}
          </AppText>
        ) : null}
        {below}
      </View>
      {trailing}
      {showChevron ? <Icon name={directionalIcons.forward} size={22} color="textMuted" /> : null}
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={styles.row} accessibilityLabel={accessibilityLabel}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (subtitle ? `${title}, ${subtitle}` : title)}
      android_ripple={{ color: colors.primarySoft }}
      style={styles.row}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget + 8,
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: spacing.xxs },
});
