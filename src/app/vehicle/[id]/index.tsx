import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { usePrototypeData } from '@/features/data/PrototypeDataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { SEP } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Card,
  Dialog,
  EmptyState,
  InlineNotice,
  ListRow,
  Screen,
  SectionHeader,
  spacing,
  Stack,
  TextField,
} from '@/ui';

/**
 * Vehicle lifecycle (T028): archive is the default for sold/unused vehicles (nothing is deleted);
 * restore is possible; permanent deletion is separate: preview → explicit confirmation → result.
 */
export default function VehicleManageScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, getBundle, archiveVehicle, restoreVehicle, deleteVehicle } = usePrototypeData();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleted, setDeleted] = useState(false);

  const vehicle = vehicles.find((v) => v.id === id);

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

  const bundle = getBundle(vehicle.id);
  const confirmMatches = typed.trim() === vehicle.registration;

  return (
    <Screen testID="screen-vehicle-manage" header={<ScreenHeader title={he.lifecycle.title} />}>
      <VehicleTargetBanner vehicle={vehicle} label={he.alerts.vehicle} />

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
            onPress={() => {
              setTyped('');
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
          message={[
            he.lifecycle.previewServices(bundle.history.length),
            he.lifecycle.previewDocuments(bundle.documents.length),
            he.lifecycle.previewAlerts(bundle.alerts.length),
          ].join(SEP)}
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
