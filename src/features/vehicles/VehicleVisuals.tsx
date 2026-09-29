import {
  ActivityIndicator,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';

import { he } from '@/i18n/he';
import type { ReferenceImageRecord } from '@/providers/referenceImages/types';
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

import { vehicleDisplayName, type VehicleKind, type VehicleSummary } from './types';
import { useVehicleImage } from './vehicleImage';

/**
 * Bundled, self-made NEUTRAL placeholders (tools/vehicle-art.py): a colorless silhouette per
 * vehicle kind, labeled as a generic illustration. Shown only when there is neither the user's own
 * photo nor an approved model reference image (owner decisions 2026-09-28/29).
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

type PhotoSubject = Pick<VehicleSummary, 'kind'> & Partial<VehicleSummary>;

/**
 * The vehicle image. Priority: the user's own photo → the verified model reference image
 * ("תמונת דגם להמחשה", with its license credit) → the illustration. The large variants also show
 * the resolution states: searching, which-front question, no suitable image, cannot search now.
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
    { height: d.height, borderRadius: d.radius },
    d.width ? { width: d.width } : styles.stretch,
  ];

  if (large && state.kind === 'searching') {
    return (
      <View
        style={[styles.panel, { minHeight: d.height, borderRadius: d.radius }]}
        testID="vehicle-image-searching"
        accessibilityLiveRegion="polite"
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <AppText variant="bodyStrong" align="center">
          {he.vehicleImage.searching}
        </AppText>
        <AppText variant="caption" color="textSecondary" align="center">
          {he.vehicleImage.searchingHint}
        </AppText>
      </View>
    );
  }
  if (large && state.kind === 'choose_phase') {
    return (
      <View style={[styles.panel, { borderRadius: d.radius }]} testID="vehicle-image-choose-phase">
        <AppText variant="heading" align="center" accessibilityRole="header">
          {he.vehicleImage.choosePhase}
        </AppText>
        <View style={styles.options}>
          {state.options.map((o) => (
            <Pressable
              key={o.phase}
              testID={`phase-option-${o.phase}`}
              accessibilityRole="button"
              accessibilityLabel={he.vehicleImage.phaseLabels[o.phase]}
              onPress={() => actions.choosePhase(o.phase)}
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            >
              <Image
                source={{ uri: o.uri }}
                style={styles.optionImage}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <AppText variant="smallStrong" align="center">
                {he.vehicleImage.phaseLabels[o.phase]}
              </AppText>
              <ReferenceCredit record={o.record} compact />
            </Pressable>
          ))}
        </View>
        <AppText variant="caption" color="textSecondary" align="center">
          {he.vehicleImage.referenceLabel}
        </AppText>
        <Button
          testID="phase-not-sure"
          label={he.vehicleImage.notSure}
          variant="ghost"
          size="sm"
          onPress={() => actions.choosePhase(null)}
        />
      </View>
    );
  }
  if (large && (state.kind === 'not_found' || state.kind === 'unavailable')) {
    const notFound = state.kind === 'not_found';
    return (
      <View
        style={[styles.panel, { minHeight: d.height, borderRadius: d.radius }]}
        testID={notFound ? 'vehicle-image-not-found' : 'vehicle-image-unavailable'}
      >
        <Icon
          name={notFound ? 'image-search-outline' : 'cloud-off-outline'}
          size={32}
          color="textSecondary"
        />
        <AppText variant="bodyStrong" align="center">
          {notFound ? he.vehicleImage.notFoundTitle : he.vehicleImage.unavailableTitle}
        </AppText>
        {notFound ? (
          <AppText variant="small" color="textSecondary" align="center">
            {he.vehicleImage.notFoundBody}
          </AppText>
        ) : null}
        <View style={styles.actions}>
          {!notFound ? (
            <Button
              testID="image-retry"
              label={he.vehicleImage.retry}
              icon="refresh"
              size="sm"
              onPress={actions.retry}
            />
          ) : null}
          {actions.canAcquire ? (
            <>
              <Button
                testID="image-capture"
                label={he.vehicleImage.captureNow}
                icon="camera-outline"
                variant={notFound ? 'primary' : 'tonal'}
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
            </>
          ) : null}
        </View>
        {notFound ? (
          <Button
            testID="image-not-now"
            label={he.vehicleImage.notNow}
            variant="ghost"
            size="sm"
            onPress={actions.notNow}
          />
        ) : null}
      </View>
    );
  }

  if (state.kind === 'searching') {
    return (
      <View style={[...frame, styles.center]} testID="vehicle-image-searching-small">
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (state.kind === 'user' || state.kind === 'reference') {
    const reference = state.kind === 'reference';
    return (
      <View style={frame} testID={reference ? 'vehicle-photo-reference' : 'vehicle-photo-user'}>
        <Image
          source={{ uri: state.uri }}
          style={styles.image}
          resizeMode={reference ? 'contain' : 'cover'}
          accessibilityIgnoresInvertColors
          accessibilityLabel={reference ? he.vehicleImage.referenceLabel : undefined}
        />
        {reference && large ? (
          <>
            <View style={styles.artLabel} testID="vehicle-reference-label">
              <AppText variant="caption" color="textSecondary">
                {he.vehicleImage.referenceLabel}
              </AppText>
            </View>
            <View style={styles.creditOverlay}>
              <ReferenceCredit record={state.record} />
            </View>
          </>
        ) : null}
      </View>
    );
  }
  return (
    <View style={frame} importantForAccessibility="no-hide-descendants" testID="vehicle-photo-art">
      <Image
        source={ART[vehicle.kind]}
        style={styles.image}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      {large ? (
        <View style={styles.artLabel} testID="vehicle-photo-art-label">
          <AppText variant="caption" color="textSecondary">
            {he.vehicles.genericIllustration}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** License attribution of a reference image; opens the source page (author, license, changes). */
export function ReferenceCredit({
  record,
  compact = false,
}: {
  record: ReferenceImageRecord;
  compact?: boolean;
}) {
  return (
    <Pressable
      testID="vehicle-reference-credit"
      accessibilityRole="link"
      accessibilityHint={he.vehicleImage.sourceHint}
      onPress={() => void Linking.openURL(record.sourceUrl)}
      hitSlop={8}
    >
      <AppText
        variant="caption"
        color="textSecondary"
        align="center"
        numberOfLines={compact ? 2 : 1}
      >
        {record.credit}
      </AppText>
    </Pressable>
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
  center: { alignItems: 'center', justifyContent: 'center' },
  panel: {
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: '#E3E8EF',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  options: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  option: {
    flex: 1,
    gap: spacing.xxs,
    padding: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionPressed: { borderColor: colors.primary },
  optionImage: { width: '100%', height: 96 },
  creditOverlay: {
    position: 'absolute',
    bottom: spacing.xs,
    start: spacing.sm,
    end: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radii.sm,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
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
