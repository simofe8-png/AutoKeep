import { Pressable, StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, colors, Icon, radii, spacing, touchTarget, type IconName } from '@/ui';

import { useActiveVehicle } from './ActiveVehicleContext';
import { formatKm } from './format';
import { vehicleDisplayName, type VehicleKind, type VehicleSummary } from './types';

export const vehicleKindIcon: Record<VehicleKind, IconName> = {
  car: 'car-side',
  motorcycle: 'motorbike',
  scooter: 'moped',
};

export interface ActiveVehicleChipProps {
  onPress: () => void;
  compact?: boolean;
}

/**
 * Active-vehicle area near the top of screens. Tapping opens the vehicle switcher
 * (UX baseline: vehicle switching is available from the active-vehicle area).
 */
export function ActiveVehicleChip({ onPress, compact = false }: ActiveVehicleChipProps) {
  const { activeVehicle } = useActiveVehicle();
  const name = activeVehicle ? vehicleDisplayName(activeVehicle) : he.activeVehicle.noVehicle;
  const a11y = activeVehicle
    ? `${he.activeVehicle.activeLabel}: ${name}, ${activeVehicle.registration}. ${he.activeVehicle.switch}`
    : he.activeVehicle.noVehicle;
  return (
    <Pressable
      testID="active-vehicle-chip"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      android_ripple={{ color: colors.primarySoft }}
      style={styles.chip}
    >
      <View style={styles.iconWrap}>
        <Icon
          name={activeVehicle ? vehicleKindIcon[activeVehicle.kind] : 'car-off'}
          size={22}
          color="primary"
        />
      </View>
      <View style={styles.text}>
        <AppText variant={compact ? 'smallStrong' : 'bodyStrong'} numberOfLines={2}>
          {name}
        </AppText>
        {activeVehicle && !compact ? (
          <AppText variant="small" color="textMuted" numberOfLines={2}>
            {activeVehicle.registration} · {formatKm(activeVehicle.odometerKm)}
          </AppText>
        ) : null}
      </View>
      <Icon name="chevron-down" size={20} color="textMuted" />
    </Pressable>
  );
}

/**
 * Shown on high-impact vehicle-scoped actions (service recording, delete, etc.) so the user sees
 * exactly which vehicle is targeted — model + registration (UX baseline "Multiple vehicles").
 */
export function VehicleTargetBanner({
  vehicle,
  label = he.activeVehicle.targetVehicle,
}: {
  vehicle: VehicleSummary;
  label?: string;
}) {
  return (
    <View
      testID="vehicle-target-banner"
      style={styles.banner}
      accessible
      accessibilityLabel={`${label}: ${vehicleDisplayName(vehicle)}, ${vehicle.registration}`}
    >
      <Icon name={vehicleKindIcon[vehicle.kind]} size={20} color="primary" />
      <AppText variant="small" color="textSecondary">
        {label}:
      </AppText>
      <AppText variant="smallStrong" style={styles.bannerName}>
        {vehicleDisplayName(vehicle)} · {vehicle.registration}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: touchTarget,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flexShrink: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
  },
  bannerName: { flexShrink: 1, flexGrow: 1 },
});
