import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, touchTarget, type ColorToken } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress?: () => void;
  color?: ColorToken;
  /** Optional count badge (e.g. active alerts). */
  badgeCount?: number;
  testID?: string;
}

export function IconButton({
  icon,
  accessibilityLabel,
  onPress,
  color = 'textPrimary',
  badgeCount,
  testID,
}: IconButtonProps) {
  const hasBadge = badgeCount != null && badgeCount > 0;
  const label = hasBadge ? `${accessibilityLabel} (${badgeCount})` : accessibilityLabel;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      android_ripple={{ color: colors.primarySoft, borderless: true }}
      style={styles.base}
      hitSlop={4}
    >
      <Icon name={icon} size={24} color={color} />
      {hasBadge ? (
        <View style={styles.badge}>
          <AppText
            variant="caption"
            color="textOnPrimary"
            align="center"
            maxFontSizeMultiplier={1.2}
          >
            {badgeCount > 9 ? '9+' : String(badgeCount)}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: touchTarget,
    height: touchTarget,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 6,
    end: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
    justifyContent: 'center',
  },
});
