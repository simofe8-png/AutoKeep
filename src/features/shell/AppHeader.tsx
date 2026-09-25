import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ActiveVehicleChip } from '@/features/vehicles/ActiveVehicleBar';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import { AppText, colors, IconButton, spacing } from '@/ui';

export interface AppHeaderProps {
  /** Number of active alerts for the active vehicle (bell badge). */
  alertCount?: number;
  compact?: boolean;
}

/**
 * Shared top bar for primary destinations: active vehicle (switcher entry) at the start,
 * alerts bell and settings/profile as secondary entries at the end.
 */
export function AppHeader({ alertCount, compact = false }: AppHeaderProps) {
  const router = useRouter();
  const { isDemoData } = useActiveVehicle();
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <ActiveVehicleChip compact={compact} onPress={() => router.push('/vehicles')} />
        <IconButton
          testID="header-alerts"
          icon="bell-outline"
          accessibilityLabel={he.header.alerts}
          badgeCount={alertCount}
          onPress={() => router.push('/alerts')}
        />
        <IconButton
          testID="header-settings"
          icon="account-circle-outline"
          accessibilityLabel={he.header.settings}
          onPress={() => router.push('/settings')}
        />
      </View>
      {isDemoData ? <DemoDataStrip /> : null}
    </View>
  );
}

/** Visible label whenever mock data is shown — mocks must never pass as real information. */
export function DemoDataStrip() {
  return (
    <View style={styles.demo} testID="demo-data-strip">
      <AppText variant="caption" color="warning" align="center">
        {he.demo.banner}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  demo: {
    backgroundColor: colors.warningSoft,
    paddingVertical: spacing.xxs,
  },
});
