import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing, touchTarget } from '../theme';
import { AppText } from './AppText';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
}

/** Single-choice selector, e.g. action type: בדיקה / החלפה / פעולה אחרת. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: SegmentedControlProps<T>) {
  return (
    <View
      testID={testID}
      style={styles.container}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            testID={testID && `${testID}-${opt.value}`}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityLabel={opt.label}
            accessibilityState={{ selected, checked: selected }}
            style={[styles.segment, selected && styles.selected]}
          >
            <AppText
              variant="smallStrong"
              color={selected ? 'textOnPrimary' : 'textSecondary'}
              align="center"
            >
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    padding: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  segment: {
    flexGrow: 1,
    minHeight: touchTarget - 8,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.primary },
});
