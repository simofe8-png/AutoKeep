import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing, touchTarget } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';

export interface CheckboxProps {
  /**
   * Checked means **performed** (invariant 10). Action type (inspection/replacement/other) is a
   * separate field and must never be encoded in this checkbox.
   */
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  /** Extra content rendered under the label (e.g. an action-type selector). */
  children?: ReactNode;
  disabled?: boolean;
  testID?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  children,
  disabled = false,
  testID,
}: CheckboxProps) {
  return (
    <View style={styles.container}>
      <Pressable
        testID={testID}
        onPress={() => onChange(!checked)}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityLabel={label}
        accessibilityHint={description}
        accessibilityState={{ checked, disabled }}
        android_ripple={{ color: colors.primarySoft }}
        style={styles.row}
      >
        <View style={[styles.box, checked && styles.boxChecked, disabled && styles.boxDisabled]}>
          {checked ? <Icon name="check-bold" size={18} color="textOnPrimary" /> : null}
        </View>
        <View style={styles.text}>
          <AppText variant="bodyStrong" color={disabled ? 'textDisabled' : 'textPrimary'}>
            {label}
          </AppText>
          {description ? (
            <AppText variant="small" color="textMuted">
              {description}
            </AppText>
          ) : null}
        </View>
      </Pressable>
      {children ? <View style={styles.children}>{children}</View> : null}
    </View>
  );
}

const BOX = 24;

const styles = StyleSheet.create({
  container: { gap: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    gap: spacing.md,
    borderRadius: radii.sm,
  },
  box: {
    width: BOX,
    height: BOX,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.textSecondary,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxDisabled: { borderColor: colors.textDisabled, backgroundColor: colors.neutralSoft },
  text: { flex: 1, gap: spacing.xxs },
  children: { paddingStart: BOX + spacing.md },
});
