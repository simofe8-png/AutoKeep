import { StyleSheet, View } from 'react-native';

import { maskIdentifier } from '@/features/vehicles/format';
import type { VehicleKind } from '@/features/vehicles/types';
import { he } from '@/i18n/he';
import { AppText, Badge, SegmentedControl, spacing, TextField } from '@/ui';

import type { DraftField, FieldOrigin, VehicleDraft } from './types';

export const DISPLAY_FIELDS: readonly DraftField[] = [
  'kind',
  'manufacturer',
  'model',
  'year',
  'trim',
  'engine',
  'fuel',
  'registration',
  'vin',
];

export const kindOptions: { value: VehicleKind; label: string }[] = [
  { value: 'car', label: he.vehicleType.car },
  { value: 'motorcycle', label: he.vehicleType.motorcycle },
  { value: 'scooter', label: he.vehicleType.scooter },
];

export function formatDraftValue(field: DraftField, draft: VehicleDraft): string | undefined {
  const v = draft[field];
  if (v == null || v === '') return undefined;
  if (field === 'kind') return he.vehicleType[v as VehicleKind];
  // Sensitive identifier: only the last four characters are shown (spec §4).
  if (field === 'vin') return maskIdentifier(String(v));
  return String(v);
}

export function FieldRow({
  field,
  value,
  origin,
}: {
  field: DraftField;
  value: string;
  origin?: FieldOrigin;
}) {
  return (
    <View style={styles.row} testID={`field-${field}`}>
      <View style={styles.text}>
        <AppText variant="small" color="textMuted">
          {he.onboarding.fields[field]}
        </AppText>
        <AppText variant="bodyStrong">{value}</AppText>
      </View>
      {origin ? (
        <Badge
          label={origin === 'scan' ? he.onboarding.fromScan : he.onboarding.fromUser}
          tone={origin === 'scan' ? 'info' : 'neutral'}
        />
      ) : null}
    </View>
  );
}

/** Input for a single draft field. Kind uses a selector; year is numeric. */
export function DraftFieldInput({
  field,
  value,
  onChange,
  required,
}: {
  field: DraftField;
  value: string;
  onChange: (value: string) => void;
  required: boolean;
}) {
  if (field === 'kind') {
    return (
      <View style={styles.kind}>
        <AppText variant="smallStrong" color="textSecondary">
          {he.onboarding.fields.kind}
        </AppText>
        <SegmentedControl
          testID="input-kind"
          accessibilityLabel={he.onboarding.fields.kind}
          options={kindOptions}
          value={(value || null) as VehicleKind | null}
          onChange={onChange}
        />
      </View>
    );
  }
  return (
    <TextField
      testID={`input-${field}`}
      label={he.onboarding.fields[field]}
      value={value}
      onChangeText={onChange}
      required={required}
      keyboardType={field === 'year' ? 'number-pad' : 'default'}
      maxLength={field === 'year' ? 4 : 60}
    />
  );
}

/** Converts form strings into draft values (year → number). */
export function toDraftValue(field: DraftField, raw: string): VehicleDraft[DraftField] {
  const trimmed = raw.trim();
  if (field === 'year') {
    const n = Number(trimmed);
    return Number.isInteger(n) && n > 1950 && n < 2100 ? n : undefined;
  }
  if (field === 'kind') return (trimmed || undefined) as VehicleKind | undefined;
  return trimmed || undefined;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  text: { flex: 1 },
  kind: { gap: spacing.xs },
});
