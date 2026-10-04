import { Image, Pressable, StyleSheet, View } from 'react-native';

import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  colors,
  directionalIcons,
  elevation,
  Icon,
  PlateBadge,
  radii,
  spacing,
  touchTarget,
} from '@/ui';

import { vehicleDisplayName, type VehicleSummary } from './types';
import { VehicleExpiryLines } from './VehicleDates';
import { useVehicleImage } from './vehicleImage';

export type PhotoVariant = 'hero' | 'wide' | 'card' | 'thumb';

const DIMS: Record<
  PhotoVariant,
  { height?: number; aspectRatio?: number; width?: number; radius: number }
> = {
  // Home banner: full width, 16:9 (owner decision 2026-10-03: edge to edge, no letterboxing).
  hero: { aspectRatio: 16 / 9, radius: radii.lg },
  wide: { height: 210, radius: 0 },
  card: { height: 92, width: 150, radius: radii.md },
  thumb: { height: 64, width: 108, radius: radii.md },
};

type PhotoSubject = Pick<VehicleSummary, 'kind'> & Partial<VehicleSummary>;

/**
 * The vehicle image (owner decision 2026-10-04): only the photo the user added. Without one the
 * frame stays empty, and the large variants offer to take or pick a photo.
 */
export function VehiclePhoto({
  vehicle,
  variant,
}: {
  vehicle: PhotoSubject;
  variant: PhotoVariant;
}) {
  const { state, actions } = useVehicleImage(vehicle);
  const d = DIMS[variant];
  const large = variant === 'hero' || variant === 'wide';
  const frame = [
    styles.photo,
    d.aspectRatio
      ? { aspectRatio: d.aspectRatio, borderRadius: d.radius }
      : { height: d.height, borderRadius: d.radius },
    d.width ? { width: d.width } : styles.stretch,
  ];

  if (state.kind === 'user') {
    return (
      <View style={frame} testID="vehicle-photo-user">
        <Image
          source={{ uri: state.uri }}
          style={styles.image}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      </View>
    );
  }
  return (
    <View style={[...frame, styles.empty]} testID="vehicle-photo-empty">
      {large && actions.canAcquire ? (
        <View style={styles.actions}>
          <Button
            testID="image-capture"
            label={he.vehicleImage.takePhoto}
            icon="camera-outline"
            size="sm"
            onPress={() => void actions.capture()}
          />
          <Button
            testID="image-pick"
            label={he.vehicleImage.pickFromGallery}
            icon="image-outline"
            variant="tonal"
            size="sm"
            onPress={() => void actions.pick()}
          />
        </View>
      ) : (
        <Icon name="image-plus" size={large ? 36 : 24} color="textMuted" />
      )}
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
 * reading start (no vehicle image: the only vehicle image is the Home card). Tapping switches
 * vehicle when `onPress` is given.
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
 * spec line and fact icons (no vehicle image: the only vehicle image is the Home card).
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
    </Pressable>
  );
}

/** Active-vehicle selector of the Home reference: chevron, name + plate (no image). */
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
        <VehicleExpiryLines vehicle={vehicle} />
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
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
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
