import { StyleSheet, View } from 'react-native';

import { useAppData } from '@/features/data/DataContext';
import { he } from '@/i18n/he';
import { AppText, colors, radii, SegmentedControl, spacing, type SegmentOption } from '@/ui';

export interface DemoScenarioPickerProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

/**
 * PROTOTYPE-ONLY control to exercise alternate UI states (failures, ambiguity). Rendered only
 * while demo data is active and visibly labeled as such; removed with the mocks in M13.
 */
export function DemoScenarioPicker<T extends string>({
  options,
  value,
  onChange,
  testID,
}: DemoScenarioPickerProps<T>) {
  const { isDemoData } = useAppData();
  if (!isDemoData) return null;
  return (
    <View style={styles.box} testID={testID}>
      <AppText variant="smallStrong" color="warning">
        {he.demo.scenario}
      </AppText>
      <AppText variant="caption" color="textSecondary">
        {he.demo.scenarioHint}
      </AppText>
      <SegmentedControl
        options={options}
        value={value}
        onChange={onChange}
        accessibilityLabel={he.demo.scenario}
        testID={testID && `${testID}-control`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.warning,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.warningSoft,
  },
});
