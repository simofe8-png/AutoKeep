import { StyleSheet, View } from 'react-native';

import { parseEngineCode } from '@/domain';
import { maskIdentifier } from '@/features/vehicles/format';
import type { VehicleKind } from '@/features/vehicles/types';
import { he } from '@/i18n/he';
import { AppText, SegmentedControl, spacing, TextField } from '@/ui';

import type { DraftField, FieldOrigin, VehicleDraft } from './types';

export const DISPLAY_FIELDS: readonly DraftField[] = [
  'kind',
  'manufacturer',
  'model',
  'year',
  'trim',
  'engine',
  'engineCode',
  'fuel',
  'color',
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
  // Reference table (identification screen): label at the reading start, value at the end.
  // Provenance stays visible (trust model), as a caption under the value.
  const originText = origin
    ? origin === 'scan'
      ? he.onboarding.fromScan
      : origin === 'registry'
        ? he.onboarding.fromRegistry
        : he.onboarding.fromUser
    : null;
  return (
    <View style={styles.row} testID={`field-${field}`}>
      <AppText variant="small" color="textSecondary" style={styles.label}>
        {he.onboarding.fields[field]}
      </AppText>
      <View style={styles.valueCol}>
        <AppText variant="bodyStrong" align="end">
          {value}
        </AppText>
        {originText ? (
          <AppText
            variant="caption"
            color={origin === 'user' ? 'textMuted' : 'primary'}
            align="end"
          >
            {originText}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

/** Input for a single draft field. Kind uses a selector; year is numeric. */
export function DraftFieldInput({
  field,
  value,
  onChange,
  required,
  error,
}: {
  field: DraftField;
  value: string;
  onChange: (value: string) => void;
  required: boolean;
  error?: string;
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
      error={error}
      keyboardType={field === 'year' ? 'number-pad' : 'default'}
      autoCapitalize={field === 'engineCode' ? 'characters' : undefined}
      hint={
        field === 'engineCode'
          ? he.onboarding.engineCodeHint
          : field === 'engine'
            ? he.onboarding.engineHint
            : undefined
      }
      maxLength={field === 'year' ? 4 : field === 'engineCode' ? 20 : field === 'color' ? 40 : 60}
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
  // Only a well-formed code is kept (upper-cased); anything else stays unknown, never guessed.
  if (field === 'engineCode') return trimmed ? (parseEngineCode(trimmed) ?? undefined) : undefined;
  return trimmed || undefined;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  label: { width: 120 },
  valueCol: { flex: 1 },
  kind: { gap: spacing.xs },
});
