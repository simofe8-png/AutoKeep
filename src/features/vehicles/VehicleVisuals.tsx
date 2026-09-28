import { Pressable, StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import { AppText, colors, Icon, PlateBadge, radii, spacing, touchTarget, elevation } from '@/ui';

import { vehicleKindIcon } from './kindIcon';
import { joinParts } from './format';
import { vehicleDisplayName, type VehicleSummary } from './types';

/**
 * Vehicle image area of the approved reference. AutoKeep has no vehicle-image provider (owner
 * decision 2026-09-28: no external imagery, no manufacturer logos), so the area shows a neutral
 * illustration of the vehicle type on a soft sky/road backdrop.
 */
export function VehiclePhoto({
  vehicle,
  variant,
}: {
  vehicle: Pick<VehicleSummary, 'kind'>;
  variant: 'hero' | 'card' | 'thumb';
}) {
  const dims = {
    hero: { height: 156, icon: 104, radius: radii.xl },
    card: { height: 96, icon: 64, radius: radii.md },
    thumb: { height: 72, icon: 48, radius: radii.md },
  }[variant];
  return (
    <View
      style={[
        styles.photo,
        { height: dims.height, borderRadius: dims.radius },
        variant === 'hero' && styles.heroPhoto,
        variant === 'thumb' && styles.thumb,
        variant === 'card' && styles.cardPhoto,
      ]}
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.sky} />
      <View style={styles.road} />
      <View style={styles.photoIcon}>
        <Icon name={vehicleKindIcon[vehicle.kind]} size={dims.icon} color="textPrimary" />
      </View>
    </View>
  );
}

/** "2019 | 1.8 | בנזין | CB500F" — only facts that exist. */
export function vehicleSpecLine(v: VehicleSummary): string {
  return [String(v.year), v.engine, v.fuel, v.trim].filter(Boolean).join('  |  ');
}

/**
 * Vehicle header card (reference: plan / alerts / service recording): name, spec line and the
 * plate, with the vehicle image at the reading end. Tapping switches vehicle when `onPress`.
 */
export function VehicleContextCard({
  vehicle,
  onPress,
  label,
  testID = 'vehicle-context-card',
}: {
  vehicle: VehicleSummary;
  onPress?: () => void;
  /** e.g. "רישום עבור" on high-impact actions. */
  label?: string;
  testID?: string;
}) {
  const a11y = `${label ?? he.activeVehicle.activeLabel}: ${vehicleDisplayName(vehicle)}, ${vehicle.registration}`;
  const body = (
    <>
      <View style={styles.contextText}>
        {label ? (
          <AppText variant="caption" color="textMuted">
            {label}
          </AppText>
        ) : null}
        <AppText variant="heading" numberOfLines={2}>
          {`${vehicle.manufacturer} ${vehicle.model}`}
        </AppText>
        <AppText variant="small" color="textSecondary" numberOfLines={1}>
          {vehicleSpecLine(vehicle)}
        </AppText>
        <PlateBadge number={vehicle.registration} size="sm" />
      </View>
      <View style={styles.contextPhoto}>
        <VehiclePhoto vehicle={vehicle} variant="card" />
      </View>
    </>
  );
  if (!onPress) {
    return (
      <View testID={testID} style={styles.context} accessible accessibilityLabel={a11y}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${a11y}. ${he.activeVehicle.switch}`}
      android_ripple={{ color: colors.primarySoft }}
      style={styles.context}
    >
      {body}
    </Pressable>
  );
}

/** Active-vehicle selector of the Home reference: chevron, name + plate, small image. */
export function VehicleSelectorCard({
  vehicle,
  onPress,
}: {
  vehicle: VehicleSummary | null;
  onPress: () => void;
}) {
  const name = vehicle ? `${vehicle.manufacturer} ${vehicle.model}` : he.activeVehicle.noVehicle;
  const a11y = vehicle
    ? `${he.activeVehicle.activeLabel}: ${vehicleDisplayName(vehicle)}, ${vehicle.registration}. ${he.activeVehicle.switch}`
    : he.activeVehicle.noVehicle;
  return (
    <Pressable
      testID="active-vehicle-chip"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      android_ripple={{ color: colors.primarySoft }}
      style={styles.selector}
    >
      <Icon name="chevron-down" size={26} color="textPrimary" />
      <View style={styles.selectorText}>
        <AppText variant="heading" numberOfLines={1}>
          {name}
        </AppText>
        {vehicle ? (
          <AppText variant="body" color="textSecondary" numberOfLines={1}>
            {joinParts([vehicle.registration])}
          </AppText>
        ) : null}
      </View>
      {vehicle ? (
        <View style={styles.selectorPhoto}>
          <VehiclePhoto vehicle={vehicle} variant="thumb" />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Home hero: large image, name, spec line and plate, centred (Home reference, left variant). */
export function VehicleHero({ vehicle }: { vehicle: VehicleSummary }) {
  return (
    <View style={styles.hero} testID="vehicle-hero">
      <VehiclePhoto vehicle={vehicle} variant="hero" />
      <View style={styles.heroText}>
        <AppText variant="title" align="center">
          {`${vehicle.manufacturer} ${vehicle.model}`}
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {vehicleSpecLine(vehicle)}
        </AppText>
        <View style={styles.heroPlate}>
          <PlateBadge number={vehicle.registration} size="lg" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#DCEBFB',
  },
  heroPhoto: { alignSelf: 'stretch' },
  thumb: { width: 100 },
  cardPhoto: { width: 136 },
  sky: { ...StyleSheet.absoluteFill, backgroundColor: '#D9E9FB' },
  road: {
    position: 'absolute',
    start: 0,
    end: 0,
    bottom: 0,
    height: '32%',
    backgroundColor: '#C9D6E6',
  },
  photoIcon: { marginBottom: '6%' },
  context: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...elevation.card,
  },
  contextText: { flex: 1, gap: spacing.xs },
  contextPhoto: { flexShrink: 0 },
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: touchTarget + 16,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surfaceTint,
  },
  selectorText: { flex: 1 },
  selectorPhoto: { flexShrink: 0 },
  hero: { gap: spacing.md },
  heroText: { gap: spacing.xs, alignItems: 'center' },
  heroPlate: { marginTop: spacing.xs },
});
