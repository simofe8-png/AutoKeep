import { useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppData } from '@/features/data/DataContext';
import { onboardingServices } from '@/features/data/dataSource';
import { useTableImport } from '@/features/maintenance/table/useTableImport';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  InlineNotice,
  SegmentedControl,
  Sheet,
  spacing,
  Stack,
  TextField,
} from '@/ui';

import { parseUserDate, toUserDate } from './expiry';
import type { ProfileItemKey } from './profileCompletion';
import type { VehicleSummary } from './types';
import { formToSpec, SPEC_MAX, specToForm } from './vehicleSpec';

const TITLES: Partial<Record<ProfileItemKey, string>> = {
  schedule: he.profile.items.schedule.title,
  test: he.profile.items.test.title,
  insurance: he.profile.items.insurance.title,
  pressure: he.profile.items.pressure.title,
  photo: he.profile.items.photo.title,
};

/**
 * The window that completes one profile item in place (owner decision 2026-10-05): the owner
 * never leaves the screen to enter the schedule, the tyre pressures, the insurance, the test date
 * or the vehicle photo.
 */
export function ProfileItemSheet({
  item,
  vehicle,
  onClose,
}: {
  item: ProfileItemKey | null;
  vehicle: VehicleSummary;
  onClose: () => void;
}) {
  const title = item ? TITLES[item] : undefined;
  return (
    <Sheet
      visible={Boolean(item && title)}
      title={title ?? ''}
      onClose={onClose}
      testID="profile-sheet"
    >
      {item === 'schedule' ? <ScheduleSheet vehicle={vehicle} onClose={onClose} /> : null}
      {item === 'pressure' ? <PressureSheet vehicle={vehicle} onClose={onClose} /> : null}
      {item === 'insurance' ? <InsuranceSheet vehicle={vehicle} onClose={onClose} /> : null}
      {item === 'test' ? <TestSheet vehicle={vehicle} onClose={onClose} /> : null}
      {item === 'photo' ? <PhotoSheet vehicle={vehicle} onClose={onClose} /> : null}
    </Sheet>
  );
}

type Props = { vehicle: VehicleSummary; onClose: () => void };

/**
 * Photograph the booklet's table or upload it — read here, in the window — or type it; then the
 * owner checks and approves it on the maintenance table screen.
 */
function ScheduleSheet({ vehicle, onClose }: Props) {
  const router = useRouter();
  const t = he.serviceTable;
  const { state, start, readPages, available } = useTableImport(vehicle.id);
  const toTable = (fresh = false) => {
    onClose();
    router.push(fresh ? '/maintenance?tab=table&new=1' : '/maintenance?tab=table');
  };
  const read = async (from: 'camera' | 'file') => {
    if (await start(from)) toTable();
  };
  return (
    <Stack gap={spacing.sm}>
      <AppText color="textSecondary">{t.empty.body}</AppText>
      {state.kind === 'reading' ? (
        <InlineNotice
          testID="profile-schedule-reading"
          tone="info"
          title={t.reading(state.page, state.pages)}
          message={t.readingHint}
        />
      ) : null}
      {state.kind === 'pages' ? (
        <>
          <InlineNotice tone="info" message={t.pagesTaken(state.count)} />
          <Button
            testID="profile-schedule-read-pages"
            label={t.readPages}
            icon="text-recognition"
            fullWidth
            onPress={() => void readPages().then((ok) => ok && toTable())}
          />
          <Button
            testID="profile-schedule-add-page"
            label={t.addPage}
            icon="camera-plus-outline"
            variant="secondary"
            fullWidth
            onPress={() => void start('camera')}
          />
        </>
      ) : null}
      {state.kind === 'failed' ? (
        <InlineNotice tone="warning" message={t.readFailed[state.reason]} />
      ) : null}
      {available ? (
        <>
          <Button
            testID="profile-schedule-photo"
            label={t.photo}
            icon="camera-outline"
            fullWidth
            disabled={state.kind === 'reading'}
            onPress={() => void read('camera')}
          />
          <Button
            testID="profile-schedule-file"
            label={t.file}
            icon="file-upload-outline"
            variant="secondary"
            fullWidth
            disabled={state.kind === 'reading'}
            onPress={() => void read('file')}
          />
        </>
      ) : null}
      <Button
        testID="profile-schedule-manual"
        label={t.manual}
        icon="table-edit"
        variant="secondary"
        fullWidth
        onPress={() => toTable(true)}
      />
      {available ? (
        <AppText variant="caption" color="textSecondary">
          {t.privacy}
        </AppText>
      ) : null}
    </Stack>
  );
}

function PressureSheet({ vehicle, onClose }: Props) {
  const { setVehicleSpec } = useAppData();
  const t = he.vehicleSpec;
  const [form, setForm] = useState(() => specToForm(vehicle.spec));
  return (
    <Stack gap={spacing.md}>
      <AppText color="textSecondary">{he.profile.sheets.pressureIntro}</AppText>
      <TextField
        testID="profile-pressure-front"
        label={t.fields.tirePressureFront}
        value={form.tirePressureFront}
        onChangeText={(v) => setForm((f) => ({ ...f, tirePressureFront: v }))}
        placeholder={t.placeholders.tirePressureFront}
        keyboardType="decimal-pad"
        maxLength={SPEC_MAX}
      />
      <TextField
        testID="profile-pressure-rear"
        label={t.fields.tirePressureRear}
        value={form.tirePressureRear}
        onChangeText={(v) => setForm((f) => ({ ...f, tirePressureRear: v }))}
        placeholder={t.placeholders.tirePressureRear}
        keyboardType="decimal-pad"
        maxLength={SPEC_MAX}
      />
      <Button
        testID="profile-pressure-save"
        label={he.profile.sheets.save}
        icon="check"
        fullWidth
        onPress={() => {
          setVehicleSpec(vehicle.id, formToSpec(form));
          onClose();
        }}
      />
    </Stack>
  );
}

type OtherKind = 'none' | 'comprehensive' | 'third_party';

function InsuranceSheet({ vehicle, onClose }: Props) {
  const { setVehicleDates } = useAppData();
  const t = he.vehicleDates;
  const [compulsory, setCompulsory] = useState(toUserDate(vehicle.insurance?.compulsoryUntil));
  const [kind, setKind] = useState<OtherKind>(
    vehicle.insurance?.otherUntil ? (vehicle.insurance.otherKind ?? 'comprehensive') : 'none',
  );
  const [other, setOther] = useState(toUserDate(vehicle.insurance?.otherUntil));
  const [touched, setTouched] = useState(false);
  const parsed = {
    compulsory: parseUserDate(compulsory),
    other: kind === 'none' ? null : parseUserDate(other),
  };
  const invalid = {
    compulsory: parsed.compulsory === undefined,
    other: parsed.other === undefined,
  };
  const save = () => {
    setTouched(true);
    if (invalid.compulsory || invalid.other) return;
    setVehicleDates(vehicle.id, {
      compulsoryUntil: parsed.compulsory ?? null,
      otherUntil: parsed.other ?? null,
      otherKind: kind === 'none' ? null : kind,
    });
    onClose();
  };
  return (
    <Stack gap={spacing.md}>
      <AppText color="textSecondary">{he.profile.sheets.insuranceIntro}</AppText>
      <TextField
        testID="profile-insurance-compulsory"
        label={t.compulsoryLabel}
        value={compulsory}
        onChangeText={setCompulsory}
        placeholder={t.datePlaceholder}
        keyboardType="numbers-and-punctuation"
        hint={t.dateHint}
        error={touched && invalid.compulsory ? t.dateError : undefined}
      />
      <AppText variant="smallStrong">{t.otherKindLabel}</AppText>
      <SegmentedControl<OtherKind>
        testID="profile-insurance-kind"
        accessibilityLabel={t.otherKindLabel}
        options={[
          { value: 'none', label: t.none },
          { value: 'comprehensive', label: t.kinds.comprehensive },
          { value: 'third_party', label: t.kinds.third_party },
        ]}
        value={kind}
        onChange={setKind}
      />
      {kind !== 'none' ? (
        <TextField
          testID="profile-insurance-other"
          label={t.otherLabel(t.kinds[kind])}
          value={other}
          onChangeText={setOther}
          placeholder={t.datePlaceholder}
          keyboardType="numbers-and-punctuation"
          hint={t.dateHint}
          error={touched && invalid.other ? t.dateError : undefined}
        />
      ) : null}
      <Button
        testID="profile-insurance-save"
        label={he.profile.sheets.save}
        icon="check"
        fullWidth
        onPress={save}
      />
    </Stack>
  );
}

function TestSheet({ vehicle, onClose }: Props) {
  const { setVehicleDates } = useAppData();
  const t = he.vehicleDates;
  const [value, setValue] = useState(toUserDate(vehicle.testUntil));
  const [touched, setTouched] = useState(false);
  const parsed = parseUserDate(value);
  return (
    <Stack gap={spacing.md}>
      <AppText color="textSecondary">{he.profile.sheets.testIntro}</AppText>
      <TextField
        testID="profile-test-date"
        label={t.testLabel}
        value={value}
        onChangeText={setValue}
        placeholder={t.datePlaceholder}
        keyboardType="numbers-and-punctuation"
        hint={t.dateHint}
        error={touched && parsed === undefined ? t.dateError : undefined}
      />
      <Button
        testID="profile-test-save"
        label={he.profile.sheets.save}
        icon="check"
        fullWidth
        onPress={() => {
          setTouched(true);
          if (parsed === undefined) return;
          setVehicleDates(vehicle.id, { testUntil: parsed });
          onClose();
        }}
      />
    </Stack>
  );
}

function PhotoSheet({ vehicle, onClose }: Props) {
  const { isDemoData, setVehiclePhoto } = useAppData();
  const services = isDemoData ? null : onboardingServices();
  const acquire = async (from: 'camera' | 'library') => {
    if (!services) return;
    const a = services.acquisition;
    const r = from === 'camera' ? await a.captureWithCamera() : await a.pickImage();
    if (r.status === 'acquired') {
      setVehiclePhoto(vehicle.id, r.file);
      onClose();
    }
  };
  return (
    <Stack gap={spacing.sm}>
      <AppText color="textSecondary">{he.profile.sheets.photoIntro}</AppText>
      <Button
        testID="profile-photo-camera"
        label={he.vehicleImage.takePhoto}
        icon="camera-outline"
        fullWidth
        disabled={!services}
        onPress={() => void acquire('camera')}
      />
      <Button
        testID="profile-photo-library"
        label={he.vehicleImage.pickFromGallery}
        icon="image-outline"
        variant="secondary"
        fullWidth
        disabled={!services}
        onPress={() => void acquire('library')}
      />
    </Stack>
  );
}
