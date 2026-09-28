import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { parseEngineCode } from '@/domain';
import { useAppData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import { he } from '@/i18n/he';
import { AppText, Button, InlineNotice, Screen, TextField } from '@/ui';

/**
 * Corrects user-editable identity details of one vehicle: color, engine code and engine. An empty
 * field means unknown; nothing is derived from another field. Manufacturer, model, year and
 * registration are not editable here (they define the vehicle and its source matching). The
 * engine is locked while a verified schedule exists — its applicability was proven for the
 * current value.
 */
export default function VehicleEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, getBundle, updateVehicleDetails } = useAppData();
  const vehicle = vehicles.find((v) => v.id === id);
  const [color, setColor] = useState(vehicle?.color ?? '');
  const [engineCode, setEngineCode] = useState(vehicle?.engineCode ?? '');
  const [engine, setEngine] = useState(vehicle?.engine ?? '');

  if (!vehicle) return null;
  const engineLocked = getBundle(vehicle.id).schedule.status === 'verified';
  const codeInvalid = engineCode.trim() !== '' && !parseEngineCode(engineCode);
  const f = he.onboarding.fields;

  return (
    <Screen
      testID="screen-vehicle-edit"
      header={<ScreenHeader title={he.lifecycle.editDetails} />}
      footer={
        <Button
          testID="vehicle-edit-save"
          label={he.common.save}
          fullWidth
          disabled={codeInvalid}
          onPress={() => {
            updateVehicleDetails(vehicle.id, {
              color,
              engineCode,
              ...(engineLocked ? {} : { engine }),
            });
            router.back();
          }}
        />
      }
    >
      <VehicleTargetBanner vehicle={vehicle} label={he.alerts.vehicle} />
      <AppText variant="small" color="textSecondary">
        {he.lifecycle.editDetailsBody}
      </AppText>
      <TextField
        testID="edit-color"
        label={f.color}
        value={color}
        onChangeText={setColor}
        maxLength={40}
      />
      <TextField
        testID="edit-engineCode"
        label={f.engineCode}
        value={engineCode}
        onChangeText={setEngineCode}
        autoCapitalize="characters"
        maxLength={20}
        hint={he.onboarding.engineCodeHint}
        error={codeInvalid ? he.lifecycle.invalidEngineCode : undefined}
      />
      <TextField
        testID="edit-engine"
        label={f.engine}
        value={engine}
        onChangeText={setEngine}
        maxLength={60}
        editable={!engineLocked}
        hint={engineLocked ? undefined : he.onboarding.engineHint}
      />
      {engineLocked ? (
        <InlineNotice
          testID="edit-engine-locked"
          tone="neutral"
          message={he.lifecycle.engineLocked}
        />
      ) : null}
    </Screen>
  );
}
