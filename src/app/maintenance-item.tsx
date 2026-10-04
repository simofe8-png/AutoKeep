import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';

import { useAppData, useVehicleData } from '@/features/data/DataContext';
import {
  MANUAL_TASKS,
  validateManualItem,
  type ManualItemErrors,
  type ManualItemForm,
  type ManualTask,
} from '@/features/maintenance/manualSchedule';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { parseUserDate, toUserDate } from '@/features/vehicles/expiry';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Dialog,
  FilterChips,
  Screen,
  SegmentedControl,
  spacing,
  Stack,
  TextField,
} from '@/ui';

/**
 * The owner enters a maintenance item by hand (owner decision 2026-10-04): what, how often (km and /
 * or months) and when it was last done. The next due is computed from it.
 */
export default function MaintenanceItemScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { activeVehicle } = useActiveVehicle();
  const { plan } = useVehicleData(activeVehicle?.id ?? null);
  const { saveManualItem, removeManualItem, today } = useAppData();
  const existing = id ? plan?.manual?.find((m) => m.id === id) : undefined;
  const t = he.manualItem;

  const [form, setForm] = useState<ManualItemForm>(() => ({
    task: existing
      ? MANUAL_TASKS.includes(existing.task as never)
        ? (existing.task as ManualTask)
        : 'custom'
      : null,
    title: existing?.title ?? '',
    action: existing?.action ?? 'replacement',
    km: existing?.intervalKm != null ? String(existing.intervalKm) : '',
    months: existing?.intervalMonths != null ? String(existing.intervalMonths) : '',
    lastDate: toUserDate(existing?.lastDoneDate),
    lastKm: existing?.lastDoneKm != null ? String(existing.lastDoneKm) : '',
  }));
  const [errors, setErrors] = useState<ManualItemErrors>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<ManualItemForm>) => setForm((f) => ({ ...f, ...patch }));

  if (!activeVehicle) return null;

  const save = () => {
    const r = validateManualItem(form, today(), parseUserDate);
    if (!r.ok) return setErrors(r.errors);
    saveManualItem(activeVehicle.id, r.value, existing?.id);
    router.back();
  };

  return (
    <Screen
      testID="screen-maintenance-item"
      header={<ScreenHeader title={existing ? t.editTitle : t.addTitle} />}
      footer={
        <Button testID="manual-item-save" label={t.save} icon="check" fullWidth onPress={save} />
      }
    >
      <Stack gap={spacing.md}>
        <AppText color="textSecondary">{t.intro}</AppText>
        <Stack gap={spacing.xs}>
          <AppText variant="smallStrong">{t.what}</AppText>
          <FilterChips<ManualTask>
            testID="manual-item-task"
            accessibilityLabel={t.what}
            options={[
              ...MANUAL_TASKS.map((k) => ({
                value: k as ManualTask,
                label: he.maintenancePlan.tasks[k],
              })),
              { value: 'custom', label: t.custom },
            ]}
            value={form.task ?? ('' as ManualTask)}
            onChange={(task) => set({ task })}
          />
          {errors.task ? (
            <AppText variant="small" color="danger">
              {t.errors.task}
            </AppText>
          ) : null}
        </Stack>
        {form.task === 'custom' ? (
          <TextField
            testID="manual-item-title"
            label={t.title}
            value={form.title}
            onChangeText={(title) => set({ title })}
            required
            maxLength={80}
            error={errors.title ? t.errors.title : undefined}
          />
        ) : null}
        <Stack gap={spacing.xs}>
          <AppText variant="smallStrong">{t.action}</AppText>
          <SegmentedControl<'replacement' | 'inspection'>
            testID="manual-item-action"
            accessibilityLabel={t.action}
            options={[
              { value: 'replacement', label: he.maintenancePlan.actions.replacement },
              { value: 'inspection', label: he.maintenancePlan.actions.inspection },
            ]}
            value={form.action}
            onChange={(action) => set({ action })}
          />
        </Stack>
        <AppText variant="smallStrong">{t.every}</AppText>
        <TextField
          testID="manual-item-km"
          label={t.km}
          value={form.km}
          onChangeText={(km) => set({ km })}
          keyboardType="number-pad"
          suffix={he.common.km}
          maxLength={7}
          error={errors.km ? t.errors.km : undefined}
        />
        <TextField
          testID="manual-item-months"
          label={t.months}
          value={form.months}
          onChangeText={(months) => set({ months })}
          keyboardType="number-pad"
          suffix={t.monthsUnit}
          maxLength={3}
          error={errors.months ? t.errors.months : undefined}
          hint={errors.interval ? undefined : t.everyHint}
        />
        {errors.interval ? (
          <AppText variant="small" color="danger" testID="manual-item-interval-error">
            {t.errors.interval}
          </AppText>
        ) : null}
        <AppText variant="smallStrong">{t.lastDone}</AppText>
        <TextField
          testID="manual-item-last-date"
          label={t.lastDate}
          value={form.lastDate}
          onChangeText={(lastDate) => set({ lastDate })}
          placeholder={he.vehicleDates.datePlaceholder}
          keyboardType="numbers-and-punctuation"
          error={errors.lastDate ? t.errors.lastDate : undefined}
        />
        <TextField
          testID="manual-item-last-km"
          label={t.lastKm}
          value={form.lastKm}
          onChangeText={(lastKm) => set({ lastKm })}
          keyboardType="number-pad"
          suffix={he.common.km}
          maxLength={7}
          error={errors.lastKm ? t.errors.lastKm : undefined}
          hint={t.lastHint}
        />
        {existing ? (
          <Button
            testID="manual-item-delete"
            label={t.delete}
            icon="trash-can-outline"
            variant="ghost"
            onPress={() => setConfirmDelete(true)}
          />
        ) : null}
      </Stack>
      <Dialog
        visible={confirmDelete}
        testID="manual-item-delete-dialog"
        title={t.deleteTitle}
        message={t.deleteBody}
        confirmLabel={t.delete}
        destructive
        onConfirm={() => {
          setConfirmDelete(false);
          if (existing) removeManualItem(activeVehicle.id, existing.id);
          router.back();
        }}
        cancelLabel={he.common.cancel}
        onCancel={() => setConfirmDelete(false)}
      />
    </Screen>
  );
}
