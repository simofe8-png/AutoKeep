import { StyleSheet, Switch, View } from 'react-native';

import { colors, spacing, touchTarget } from '../theme';
import { AppText } from './AppText';
import { Icon, type IconName } from './Icon';

export interface SwitchRowProps {
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  icon?: IconName;
  testID?: string;
}

export function SwitchRow({
  label,
  description,
  value,
  onValueChange,
  icon,
  testID,
}: SwitchRowProps) {
  return (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={22} color="primary" /> : null}
      <View style={styles.text}>
        <AppText variant="bodyStrong">{label}</AppText>
        {description ? (
          <AppText variant="small" color="textMuted">
            {description}
          </AppText>
        ) : null}
      </View>
      <Switch
        testID={testID}
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ true: colors.primaryBorder, false: colors.border }}
        thumbColor={value ? colors.primary : colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + 8,
    paddingVertical: spacing.sm,
  },
  text: { flex: 1, gap: spacing.xxs },
});
