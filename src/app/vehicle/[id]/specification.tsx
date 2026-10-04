import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppData } from '@/features/data/DataContext';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { VehicleTargetBanner } from '@/features/vehicles/ActiveVehicleBar';
import {
  formToSpec,
  SPEC_GROUPS,
  SPEC_MAX,
  SPEC_NOTES_MAX,
  specToForm,
  type SpecForm,
} from '@/features/vehicles/vehicleSpec';
import { he } from '@/i18n/he';
import type { VehicleSpecField } from '@/persistence/repositories/vehicleSpec';
import {
  AppText,
  Button,
  Card,
  Icon,
  type IconName,
  Screen,
  spacing,
  Stack,
  TextField,
} from '@/ui';

const GROUP_ICON: Record<(typeof SPEC_GROUPS)[number]['key'], IconName> = {
  oil: 'oil',
  fluids: 'water-outline',
  tires: 'tire',
  notes: 'note-text-outline',
};

/**
 * "מפרט הרכב" (owner decision 2026-10-05): the owner writes the vehicle's oil, fluids and tyres as
 * the booklet states them, plus free notes. Every field is optional; nothing is filled for them.
 */
export default function VehicleSpecScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { vehicles, setVehicleSpec } = useAppData();
  const vehicle = vehicles.find((v) => v.id === id);
  const [form, setForm] = useState<SpecForm>(() => specToForm(vehicle?.spec));

  if (!vehicle) return null;
  const t = he.vehicleSpec;
  const set = (f: VehicleSpecField, v: string) => setForm((s) => ({ ...s, [f]: v }));

  return (
    <Screen
      testID="screen-vehicle-spec"
      header={<ScreenHeader title={t.title} />}
      footer={
        <Button
          testID="vehicle-spec-save"
          label={t.save}
          icon="check"
          fullWidth
          onPress={() => {
            setVehicleSpec(vehicle.id, formToSpec(form));
            router.back();
          }}
        />
      }
    >
      <VehicleTargetBanner vehicle={vehicle} label={he.alerts.vehicle} />
      <AppText variant="small" color="textSecondary">
        {t.intro}
      </AppText>
      {SPEC_GROUPS.map((g) => (
        <Card key={g.key} testID={`vehicle-spec-group-${g.key}`}>
          <Stack gap={spacing.sm}>
            <View style={styles.groupHead}>
              <Icon name={GROUP_ICON[g.key]} size={22} color="primary" />
              <AppText variant="heading" accessibilityRole="header">
                {t.groups[g.key]}
              </AppText>
            </View>
            {g.fields.map((f) => (
              <TextField
                key={f}
                testID={`vehicle-spec-${f}`}
                label={t.fields[f]}
                value={form[f]}
                onChangeText={(v) => set(f, v)}
                placeholder={t.placeholders[f]}
                multiline={f === 'notes'}
                maxLength={f === 'notes' ? SPEC_NOTES_MAX : SPEC_MAX}
                autoCapitalize={f === 'notes' ? 'sentences' : 'characters'}
              />
            ))}
          </Stack>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
