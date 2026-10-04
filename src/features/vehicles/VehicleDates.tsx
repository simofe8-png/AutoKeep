import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppData } from '@/features/data/DataContext';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Card,
  Icon,
  InlineNotice,
  SegmentedControl,
  spacing,
  Stack,
  TextField,
  type ColorToken,
} from '@/ui';

import { expiryStatus, parseUserDate, toUserDate, type ExpiryTone } from './expiry';
import { formatDate } from './format';
import type { VehicleSummary } from './types';

const TONE: Record<ExpiryTone, ColorToken> = {
  ok: 'success',
  soon: 'warning',
  expired: 'danger',
};

/** The nearest insurance expiry the owner entered, with its kind. */
function nearestInsurance(
  v: VehicleSummary,
): { until: string; kind: 'compulsory' | 'comprehensive' | 'third_party' } | null {
  const all = [
    v.insurance?.compulsoryUntil
      ? { until: v.insurance.compulsoryUntil, kind: 'compulsory' as const }
      : null,
    v.insurance?.otherUntil
      ? { until: v.insurance.otherUntil, kind: v.insurance.otherKind ?? 'comprehensive' }
      : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  return all.sort((a, b) => a.until.localeCompare(b.until))[0] ?? null;
}

function ExpiryLine({
  testID,
  label,
  until,
  kind,
  today,
  onPress,
}: {
  testID: string;
  label: string;
  until: string | null;
  kind?: string;
  today: string;
  onPress: () => void;
}) {
  const t = he.vehicleDates;
  const s = until ? expiryStatus(until, today) : null;
  const text = !until
    ? `${label}: ${t.notEntered}`
    : `${label}${kind ? ` (${kind})` : ''}: ${
        s!.days < 0 ? t.expiredAgo(-s!.days) : t.daysLeft(s!.days)
      } · ${formatDate(until)}`;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint={t.editHint}
      hitSlop={6}
      style={styles.line}
    >
      <Icon
        name={!s ? 'calendar-plus' : s.tone === 'ok' ? 'calendar-check' : 'calendar-alert'}
        size={18}
        color={s ? TONE[s.tone] : 'primary'}
      />
      <AppText
        variant={s && s.tone !== 'ok' ? 'smallStrong' : 'small'}
        color={s ? TONE[s.tone] : 'primary'}
        testID={`${testID}-text`}
      >
        {text}
      </AppText>
    </Pressable>
  );
}

/**
 * Under the vehicle name on Home (owner decision 2026-10-04): days left to the test and to the
 * insurance — orange within 30 days, red once passed. Tapping opens the vehicle to enter dates.
 */
export function VehicleExpiryLines({ vehicle }: { vehicle: VehicleSummary }) {
  const router = useRouter();
  const { today } = useAppData();
  const t = he.vehicleDates;
  const insurance = nearestInsurance(vehicle);
  const edit = () => router.push(`/vehicle/${vehicle.id}`);
  return (
    <View style={styles.lines} testID="vehicle-expiry">
      <ExpiryLine
        testID="vehicle-expiry-test"
        label={t.test}
        until={vehicle.testUntil ?? null}
        today={today()}
        onPress={edit}
      />
      <ExpiryLine
        testID="vehicle-expiry-insurance"
        label={t.insurance}
        until={insurance?.until ?? null}
        kind={insurance ? t.kinds[insurance.kind] : undefined}
        today={today()}
        onPress={edit}
      />
    </View>
  );
}

type OtherKind = 'none' | 'comprehensive' | 'third_party';

/** Vehicle screen: the owner enters the test and insurance dates (DD.MM.YYYY). */
export function VehicleDatesCard({ vehicle }: { vehicle: VehicleSummary }) {
  const { setVehicleDates } = useAppData();
  const t = he.vehicleDates;
  const ownTest = vehicle.testSource === 'user' ? (vehicle.testUntil ?? null) : null;
  const registryTest = vehicle.testSource === 'registry' ? (vehicle.testUntil ?? null) : null;
  const [test, setTest] = useState(toUserDate(ownTest ?? registryTest));
  const [compulsory, setCompulsory] = useState(toUserDate(vehicle.insurance?.compulsoryUntil));
  const [kind, setKind] = useState<OtherKind>(
    vehicle.insurance?.otherUntil ? (vehicle.insurance.otherKind ?? 'comprehensive') : 'none',
  );
  const [other, setOther] = useState(toUserDate(vehicle.insurance?.otherUntil));
  const [touched, setTouched] = useState(false);
  const [saved, setSaved] = useState(false);

  const parsed = {
    test: parseUserDate(test),
    compulsory: parseUserDate(compulsory),
    other: kind === 'none' ? null : parseUserDate(other),
  };
  const invalid = {
    test: parsed.test === undefined,
    compulsory: parsed.compulsory === undefined,
    other: parsed.other === undefined,
  };
  const save = () => {
    setTouched(true);
    if (invalid.test || invalid.compulsory || invalid.other) return;
    setVehicleDates(vehicle.id, {
      // The registry date unchanged is not the owner's date (it keeps following the registry).
      testUntil: parsed.test && parsed.test !== registryTest ? parsed.test : null,
      compulsoryUntil: parsed.compulsory ?? null,
      otherUntil: parsed.other ?? null,
      otherKind: kind === 'none' ? null : kind,
    });
    setSaved(true);
  };
  const changed = () => setSaved(false);

  return (
    <Card testID="vehicle-dates">
      <Stack gap={spacing.sm}>
        <AppText variant="heading" accessibilityRole="header">
          {t.cardTitle}
        </AppText>
        <TextField
          testID="vehicle-dates-test"
          label={t.testLabel}
          value={test}
          onChangeText={(v) => {
            setTest(v);
            changed();
          }}
          placeholder={t.datePlaceholder}
          keyboardType="numbers-and-punctuation"
          hint={
            registryTest && parseUserDate(test) === registryTest
              ? t.fromRegistry
              : vehicle.kind !== 'car'
                ? t.twoWheelerTestHint
                : t.dateHint
          }
          error={touched && invalid.test ? t.dateError : undefined}
        />
        <TextField
          testID="vehicle-dates-compulsory"
          label={t.compulsoryLabel}
          value={compulsory}
          onChangeText={(v) => {
            setCompulsory(v);
            changed();
          }}
          placeholder={t.datePlaceholder}
          keyboardType="numbers-and-punctuation"
          hint={t.dateHint}
          error={touched && invalid.compulsory ? t.dateError : undefined}
        />
        <AppText variant="smallStrong">{t.otherKindLabel}</AppText>
        <SegmentedControl<OtherKind>
          testID="vehicle-dates-kind"
          accessibilityLabel={t.otherKindLabel}
          options={[
            { value: 'none', label: t.none },
            { value: 'comprehensive', label: t.kinds.comprehensive },
            { value: 'third_party', label: t.kinds.third_party },
          ]}
          value={kind}
          onChange={(k) => {
            setKind(k);
            changed();
          }}
        />
        {kind !== 'none' ? (
          <TextField
            testID="vehicle-dates-other"
            label={t.otherLabel(t.kinds[kind])}
            value={other}
            onChangeText={(v) => {
              setOther(v);
              changed();
            }}
            placeholder={t.datePlaceholder}
            keyboardType="numbers-and-punctuation"
            hint={t.dateHint}
            error={touched && invalid.other ? t.dateError : undefined}
          />
        ) : null}
        {saved ? (
          <InlineNotice testID="vehicle-dates-saved" tone="success" message={t.saved} />
        ) : null}
        <Button
          testID="vehicle-dates-save"
          label={t.save}
          icon="content-save-outline"
          onPress={save}
        />
      </Stack>
    </Card>
  );
}

const styles = StyleSheet.create({
  lines: { gap: spacing.xxs, alignItems: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 32 },
});
