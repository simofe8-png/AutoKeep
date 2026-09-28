import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { useAppData } from '@/features/data/DataContext';
import { he } from '@/i18n/he';
import {
  AppText,
  colors,
  directionalIcons,
  elevation,
  Icon,
  PlateBadge,
  radii,
  spacing,
  touchTarget,
} from '@/ui';

import { vehicleDisplayName, type VehicleKind, type VehicleSummary } from './types';

/**
 * Bundled, self-made NEUTRAL placeholders (tools/vehicle-art.py): a colorless silhouette per
 * vehicle kind. AutoKeep has no trustworthy model/generation-specific image source, so no image
 * is ever presented as the identified vehicle: the placeholder is labeled as a generic
 * illustration, and the user's own photo replaces it (owner corrections 2026-09-28).
 */
const ART: Record<VehicleKind, ImageSourcePropType> = {
  car: require('@/assets/vehicles/car.png'),
  motorcycle: require('@/assets/vehicles/motorcycle.png'),
  scooter: require('@/assets/vehicles/scooter.png'),
};

export type PhotoVariant = 'hero' | 'wide' | 'card' | 'thumb';

const DIMS: Record<PhotoVariant, { height: number; width?: number; radius: number }> = {
  hero: { height: 156, radius: radii.lg },
  wide: { height: 210, radius: 0 },
  card: { height: 92, width: 150, radius: radii.md },
  thumb: { height: 64, width: 108, radius: radii.md },
};

/** The vehicle image: the user's own photo when there is one, otherwise the illustration. */
export function VehiclePhoto({
  vehicle,
  variant,
}: {
  vehicle: Pick<VehicleSummary, 'kind'> & { id?: string };
  variant: PhotoVariant;
}) {
  const { vehiclePhotos } = useAppData();
  const uri = vehicle.id ? vehiclePhotos[vehicle.id] : undefined;
  const d = DIMS[variant];
  return (
    <View
      style={[
        styles.photo,
        { height: d.height, borderRadius: d.radius },
        d.width ? { width: d.width } : styles.stretch,
      ]}
      importantForAccessibility="no-hide-descendants"
      testID={uri ? 'vehicle-photo-user' : 'vehicle-photo-art'}
    >
      <Image
        source={uri ? { uri } : ART[vehicle.kind]}
        style={styles.image}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      {!uri && (variant === 'hero' || variant === 'wide') ? (
        <View style={styles.artLabel} testID="vehicle-photo-art-label">
          <AppText variant="caption" color="textSecondary">
            {he.vehicles.genericIllustration}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Spec line of the references, read right to left: "בנזין | 2.5 | 2021" — only facts that exist
 * (trim first when known, then fuel, engine, year).
 */
export function vehicleSpecLine(v: VehicleSummary): string {
  return [v.trim, v.fuel, v.engine, String(v.year)].filter(Boolean).join('  |  ');
}

/**
 * Vehicle header card of the references (alerts, recording): name, spec line and plate at the
 * reading start, the vehicle image at the end. Tapping switches vehicle when `onPress` is given.
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
      <VehiclePhoto vehicle={vehicle} variant="card" />
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

/**
 * Maintenance-plan vehicle card (reference "תוכנית הטיפולים"): plate at the reading start, name,
 * spec line and fact icons in the middle, the vehicle image at the end.
 */
export function PlanVehicleCard({
  vehicle,
  onPress,
}: {
  vehicle: VehicleSummary;
  onPress?: () => void;
}) {
  return (
    <Pressable
      testID="active-vehicle-chip"
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${he.activeVehicle.activeLabel}: ${vehicleDisplayName(vehicle)}, ${vehicle.registration}. ${he.activeVehicle.switch}`}
      style={[styles.context, styles.plan]}
    >
      <View style={styles.planPlate}>
        <PlateBadge number={vehicle.registration} size="sm" />
      </View>
      <View style={styles.planText}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {`${vehicle.manufacturer} ${vehicle.model}`}
        </AppText>
        <AppText variant="caption" color="textSecondary" numberOfLines={1}>
          {vehicleSpecLine(vehicle)}
        </AppText>
        <View style={styles.factIcons}>
          <Icon name="calendar-blank-outline" size={18} color="textSecondary" />
          <Icon name="engine-outline" size={18} color="textSecondary" />
          <Icon name="gas-station-outline" size={18} color="textSecondary" />
          <Icon name="layers-outline" size={18} color="textSecondary" />
        </View>
      </View>
      <VehiclePhoto vehicle={vehicle} variant="thumb" />
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
        <AppText variant="bodyStrong" numberOfLines={1}>
          {name}
        </AppText>
        {vehicle ? (
          <AppText variant="small" color="textSecondary" numberOfLines={1}>
            {vehicle.registration}
          </AppText>
        ) : null}
      </View>
      {vehicle ? <VehiclePhoto vehicle={vehicle} variant="thumb" /> : null}
    </Pressable>
  );
}

/** Home hero: wide vehicle image, then the name, spec line and plate, centred (Home reference). */
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
        <PlateBadge number={vehicle.registration} size="md" />
      </View>
    </View>
  );
}

/** Row chevron of the references (">" at the reading end). */
export function RowChevron() {
  return <Icon name={directionalIcons.forward} size={24} color="textPrimary" />;
}

const styles = StyleSheet.create({
  photo: { overflow: 'hidden', backgroundColor: '#E3E8EF' },
  stretch: { alignSelf: 'stretch' },
  image: { width: '100%', height: '100%' },
  artLabel: {
    position: 'absolute',
    top: spacing.sm,
    start: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
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
  plan: { gap: spacing.sm },
  planPlate: { justifyContent: 'center' },
  planText: { flex: 1, gap: spacing.xxs },
  factIcons: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxs },
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
  hero: { gap: spacing.md },
  heroText: { gap: spacing.xs, alignItems: 'center' },
});
