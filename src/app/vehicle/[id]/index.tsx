import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppData, type DeletionPreviewVM } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatKm, SEP } from '@/features/vehicles/format';
import type { VehicleSummary } from '@/features/vehicles/types';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { RegistryFacts } from '@/features/vehicles/RegistryFacts';
import type { VehicleRegistryRecord } from '@/providers/registry/vehicleRecord';
import { vehicleSpecLine } from '@/features/vehicles/VehicleVisuals';
import { onboardingServices } from '@/features/data/dataSource';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Card,
  Dialog,
  Divider,
  IconButton,
  InfoRow,
  EmptyState,
  InlineNotice,
  ListRow,
  PlateBadge,
  Screen,
  SectionHeader,
  spacing,
  Stack,
  TextField,
} from '@/ui';

/** Identity facts that exist (absent facts are not shown, never invented). */
function detailRows(v: VehicleSummary): [string, string][] {
  const f = he.onboarding.fields;
  const rows: [string, string | undefined][] = [
    [f.kind, he.vehicleType[v.kind]],
    [f.manufacturer, v.manufacturer],
    [f.model, v.model],
    [f.year, String(v.year)],
    [f.trim, v.trim],
    [he.lifecycle.modelCode, v.modelCode],
    [f.engine, v.engine],
    [f.engineCode, v.engineCode],
    [f.fuel, v.fuel],
    [f.color, v.color],
    [f.registration, v.registration],
    [f.vin, v.vinMasked],
  ];
  return rows.filter((r): r is [string, string] => Boolean(r[1]));
}

/**
 * Vehicle detail and lifecycle — "הרכב שלי" of the approved reference: image, identity, details,
 * then the dossier, archive and permanent deletion (T028): archive is the default for sold/unused vehicles (nothing is deleted);
 * restore is possible; permanent deletion is separate: preview → explicit confirmation → result.
 */
export default function VehicleManageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    vehicles,
    archiveVehicle,
    restoreVehicle,
    deleteVehicle,
    deletionPreview,
    isDemoData,
    setVehiclePhoto,
    vehiclePhotos,
    removeVehiclePhoto,
    getRegistryRecord,
  } = useAppData();
  const [registryRecord, setRegistryRecord] = useState<VehicleRegistryRecord | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (id) {
      void getRegistryRecord(id).then((r) => {
        if (!cancelled) setRegistryRecord(r);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [id, getRegistryRecord]);
  const services = isDemoData ? null : onboardingServices();
  const [preview, setPreview] = useState<DeletionPreviewVM | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleted, setDeleted] = useState(false);

  const vehicle = vehicles.find((v) => v.id === id);
  const { setActiveVehicleId } = useActiveVehicle();

  if (deleted) {
    return (
      <Screen header={<ScreenHeader title={he.lifecycle.title} />} testID="screen-vehicle-deleted">
        <EmptyState
          icon="check-circle-outline"
          title={he.lifecycle.deleted}
          action={{ label: he.common.close, onPress: () => router.dismissTo('/vehicles') }}
        />
      </Screen>
    );
  }
  if (!vehicle) {
    return (
      <Screen header={<ScreenHeader title={he.lifecycle.title} />}>
        <EmptyState icon="car-off" title={he.states.genericErrorTitle} />
      </Screen>
    );
  }

  const confirmMatches = typed.trim() === vehicle.registration;
  /** The user's own photo of this vehicle (camera or library), stored on this device only. */
  const acquirePhoto = async (from: 'camera' | 'library') => {
    if (!services) return;
    const a = services.acquisition;
    const r = from === 'camera' ? await a.captureWithCamera() : await a.pickImage();
    if (r.status === 'acquired') setVehiclePhoto(vehicle.id, r.file);
  };
  const hasOwnPhoto = Boolean(vehiclePhotos[vehicle.id]);

  return (
    <Screen testID="screen-vehicle-manage" header={<ScreenHeader title={he.lifecycle.title} />}>
      <View style={styles.top}>
        <View style={styles.topText}>
          <AppText variant="title">{`${vehicle.manufacturer} ${vehicle.model}`}</AppText>
          <AppText variant="small" color="textSecondary">
            {vehicleSpecLine(vehicle)}
          </AppText>
          <PlateBadge number={vehicle.registration} size="sm" />
        </View>
      </View>
      {services ? (
        <View style={styles.photoActions}>
          <Button
            testID="vehicle-photo-camera"
            label={he.vehicleImage.takePhoto}
            icon="camera-outline"
            variant="tonal"
            size="sm"
            onPress={() => void acquirePhoto('camera')}
          />
          <Button
            testID="vehicle-photo"
            label={he.vehicleImage.pickFromGallery}
            icon="image-outline"
            variant="tonal"
            size="sm"
            onPress={() => void acquirePhoto('library')}
          />
          {hasOwnPhoto ? (
            <Button
              testID="vehicle-photo-remove"
              label={he.vehicleImage.removeMyPhoto}
              icon="image-remove"
              variant="ghost"
              size="sm"
              onPress={() => removeVehiclePhoto(vehicle.id)}
            />
          ) : null}
        </View>
      ) : null}

      <Card testID="vehicle-details">
        <Stack gap={0}>
          <View style={styles.detailsHeader}>
            <AppText variant="heading" accessibilityRole="header" style={styles.flex}>
              {he.lifecycle.detailsTitle}
            </AppText>
            {!vehicle.archived ? (
              <IconButton
                testID="vehicle-edit-details"
                icon="pencil-outline"
                color="primary"
                accessibilityLabel={he.lifecycle.editDetails}
                onPress={() => router.push(`/vehicle/${vehicle.id}/edit`)}
              />
            ) : null}
          </View>
          {detailRows(vehicle).map(([label, value]) => (
            <Stack key={label} gap={0}>
              <Divider />
              <InfoRow label={label} value={value} />
            </Stack>
          ))}
          <Divider />
          <InfoRow
            testID="vehicle-odometer-row"
            label={he.home.odometerNow}
            value={formatKm(vehicle.odometerKm)}
            action={
              !vehicle.archived ? (
                <IconButton
                  testID="vehicle-update-odometer"
                  icon="pencil-outline"
                  color="primary"
                  accessibilityLabel={he.home.updateOdometer}
                  onPress={() => {
                    // The odometer screen acts on the active vehicle: make this one active first.
                    setActiveVehicleId(vehicle.id);
                    router.push('/odometer');
                  }}
                />
              ) : undefined
            }
          />
        </Stack>
      </Card>

      {registryRecord ? (
        <Stack gap={spacing.sm} testID="vehicle-registry">
          <SectionHeader title={he.vehicleSearch.detailsTitle} />
          <RegistryFacts record={registryRecord} testID="vehicle-registry-facts" />
        </Stack>
      ) : null}

      <Card compact>
        <ListRow
          testID="vehicle-dossier"
          icon="folder-account-outline"
          title={he.lifecycle.dossier}
          subtitle={he.lifecycle.dossierBody}
          onPress={() => router.push(`/vehicle/${vehicle.id}/dossier`)}
        />
      </Card>

      <Card compact>
        {vehicle.archived ? (
          <ListRow
            testID="vehicle-restore"
            icon="archive-arrow-up-outline"
            title={he.lifecycle.restore}
            onPress={() => {
              restoreVehicle(vehicle.id);
              router.back();
            }}
          />
        ) : (
          <ListRow
            testID="vehicle-archive"
            icon="archive-outline"
            title={he.lifecycle.archive}
            subtitle={he.lifecycle.archiveBody}
            onPress={() => setArchiveOpen(true)}
          />
        )}
      </Card>

      <Stack gap={spacing.sm}>
        <SectionHeader title={he.lifecycle.deleteTitle} />
        <AppText variant="small" color="textSecondary">
          {he.lifecycle.deleteBody}
        </AppText>
        <Card compact tone="danger">
          <ListRow
            testID="vehicle-delete"
            icon="delete-forever-outline"
            title={he.lifecycle.deleteTitle}
            subtitle={he.lifecycle.archiveInstead}
            onPress={async () => {
              setTyped('');
              setPreview(await deletionPreview(vehicle.id));
              setDeleteOpen(true);
            }}
          />
        </Card>
      </Stack>

      <Dialog
        visible={archiveOpen}
        testID="archive-dialog"
        title={he.lifecycle.archive}
        message={he.lifecycle.archiveBody}
        confirmLabel={he.lifecycle.archive}
        onCancel={() => setArchiveOpen(false)}
        onConfirm={() => {
          archiveVehicle(vehicle.id);
          setArchiveOpen(false);
          router.back();
        }}
      >
        <VehicleTargetBanner vehicle={vehicle} label={he.alerts.vehicle} />
      </Dialog>

      <Dialog
        visible={deleteOpen}
        testID="delete-dialog"
        destructive
        title={he.lifecycle.deleteTitle}
        message={he.lifecycle.deleteBody}
        confirmLabel={he.lifecycle.deleteTitle}
        confirmDisabled={!confirmMatches}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          if (!confirmMatches) return;
          setDeleteOpen(false);
          setDeleted(true);
          deleteVehicle(vehicle.id);
        }}
      >
        <VehicleTargetBanner vehicle={vehicle} label={he.alerts.vehicle} />
        <InlineNotice
          tone="danger"
          title={he.lifecycle.previewTitle}
          message={
            preview
              ? [
                  he.lifecycle.previewServices(preview.serviceEvents),
                  he.lifecycle.previewDocuments(preview.documents),
                  he.lifecycle.previewReadings(preview.odometerReadings),
                  he.lifecycle.previewNotes(preview.garageRecommendations),
                  he.lifecycle.previewAlerts(preview.alerts),
                ].join(SEP)
              : ''
          }
          testID="delete-preview"
        />
        <TextField
          testID="delete-confirm-input"
          label={he.lifecycle.typeToConfirm}
          value={typed}
          onChangeText={setTyped}
          placeholder={vehicle.registration}
          required
        />
      </Dialog>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  topText: { flex: 1, gap: spacing.xs },
  photoActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  detailsHeader: { flexDirection: 'row', alignItems: 'center' },
  flex: { flex: 1 },
});
