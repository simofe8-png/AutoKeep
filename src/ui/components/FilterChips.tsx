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
  tone = 'primary',
}: {
  options: readonly FilterOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  testID?: string;
  /** 'dark': navy selected pill on tinted chips (reference alerts). */
  tone?: 'primary' | 'dark';
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
            style={[
              styles.chip,
              tone === 'dark' && styles.chipTinted,
              selected && (tone === 'dark' ? styles.selectedDark : styles.selected),
            ]}
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
  chipTinted: { backgroundColor: colors.surfaceTint, borderColor: colors.surfaceTint },
  selectedDark: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
});

/**
 * Tabs with an underline indicator inside a light rounded bar (reference: documents, service
 * detail, alerts-and-recommendations). Evenly distributed; the selected tab is blue and underlined.
 */
export function UnderlineTabs<T extends string>({
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
    <View
      style={tabStyles.bar}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID && `${testID}-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            style={[tabStyles.tab, selected && tabStyles.tabSelected]}
          >
            <AppText
              variant={selected ? 'smallStrong' : 'small'}
              color={selected ? 'primary' : 'textSecondary'}
              align="center"
              numberOfLines={1}
            >
              {o.count != null ? `${o.label} (${o.count})` : o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const tabStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    minHeight: touchTarget - 4,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabSelected: { backgroundColor: colors.surfaceTint, borderBottomColor: colors.primary },
});

/** Connected segmented filter (reference plan list: "הכל / הקרובה / בוצעו / עתידיים"). */
export function SegmentFilter<T extends string>({
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
    <View style={segStyles.bar} accessibilityLabel={accessibilityLabel} testID={testID}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testID && `${testID}-${o.value}`}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityLabel={o.label}
            accessibilityState={{ selected }}
            style={[segStyles.seg, selected && segStyles.segSelected]}
          >
            <AppText
              variant="caption"
              color={selected ? 'textOnPrimary' : 'textSecondary'}
              align="center"
              numberOfLines={1}
            >
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const segStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.pill,
    padding: 3,
  },
  seg: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.xs,
  },
  segSelected: { backgroundColor: colors.primary },
});
