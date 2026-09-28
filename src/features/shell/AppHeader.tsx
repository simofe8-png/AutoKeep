import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import { AppText, BrandMark, colors, IconButton, spacing } from '@/ui';

export interface AppHeaderProps {
  /** Number of active alerts for the active vehicle (bell badge). */
  alertCount?: number;
}

/**
 * Shared top bar of the primary destinations (approved Home reference): alerts bell at the
 * reading start, the AutoKeep wordmark centred, the menu (settings and account) at the end. The
 * active vehicle and its switcher are shown in the page content right below.
 */
export function AppHeader({ alertCount }: AppHeaderProps) {
  const router = useRouter();
  const { isDemoData } = useActiveVehicle();
  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        <IconButton
          testID="header-alerts"
          icon="bell-outline"
          accessibilityLabel={he.header.alerts}
          badgeCount={alertCount}
          onPress={() => router.push('/alerts')}
        />
        <View style={styles.brand}>
          <BrandMark size={24} />
        </View>
        <IconButton
          testID="header-settings"
          icon="menu"
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
  brand: { flex: 1, alignItems: 'center' },
  demo: {
    backgroundColor: colors.warningSoft,
    paddingVertical: spacing.xxs,
  },
});
