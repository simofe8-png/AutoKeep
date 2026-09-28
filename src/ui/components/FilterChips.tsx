import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radii, spacing, touchTarget } from '../theme';
import { AppText } from './AppText';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Horizontal filter pills (reference: "הכל (5) / דחוף (1) / קרוב (2) / מידע (2)"). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID,
}: {
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {options.map((o) => {
        const selected = o.value === value;
        const label = o.count != null ? `${o.label} (${o.count})` : o.label;
        return (
          <Pressable
            key={o.value}
            testID={testID && `${testID}-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.selected]}
          >
            <View>
              <AppText variant="smallStrong" color={selected ? 'textOnPrimary' : 'textSecondary'}>
                {label}
              </AppText>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: spacing.xxs },
  chip: {
    minHeight: touchTarget - 8,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
});
