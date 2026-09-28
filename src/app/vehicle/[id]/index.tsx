import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppData, type DeletionPreviewVM } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { formatKm, SEP } from '@/features/vehicles/format';
import type { VehicleSummary } from '@/features/vehicles/types';
import { VehicleHero } from '@/features/vehicles/VehicleVisuals';
import { he } from '@/i18n/he';
import {
  AppText,
  Card,
  Dialog,
  Divider,
  IconButton,
  InfoRow,
  EmptyState,
  InlineNotice,
  ListRow,
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
    [f.fuel, v.fuel],
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
  const { vehicles, archiveVehicle, restoreVehicle, deleteVehicle, deletionPreview } = useAppData();
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

  return (
    <Screen testID="screen-vehicle-manage" header={<ScreenHeader title={he.lifecycle.title} />}>
      <VehicleHero vehicle={vehicle} />

      <Card testID="vehicle-details">
        <Stack gap={0}>
          <AppText variant="heading" accessibilityRole="header">
            {he.lifecycle.detailsTitle}
          </AppText>
          {detailRows(vehicle).map(([label, value], i) => (
            <Stack key={label} gap={0}>
              {i > 0 ? <Divider /> : null}
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
        <VehicleHero vehicle={vehicle} />

        <Card testID="vehicle-details">
          <Stack gap={0}>
            <AppText variant="heading" accessibilityRole="header">
              {he.lifecycle.detailsTitle}
            </AppText>
            {detailRows(vehicle).map(([label, value], i) => (
              <Stack key={label} gap={0}>
                {i > 0 ? <Divider /> : null}
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
        <VehicleHero vehicle={vehicle} />

        <Card testID="vehicle-details">
          <Stack gap={0}>
            <AppText variant="heading" accessibilityRole="header">
              {he.lifecycle.detailsTitle}
            </AppText>
            {detailRows(vehicle).map(([label, value], i) => (
              <Stack key={label} gap={0}>
                {i > 0 ? <Divider /> : null}
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
