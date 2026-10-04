import { useRouter } from 'expo-router';
import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import type { TaskCode } from '@/domain';
import { useAppData, useVehicleData } from '@/features/data/DataContext';
import {
  itemsToTable,
  NOTE_MAX,
  TABLE_SUGGESTIONS,
  tableToRows,
  type RowErrors,
  type TableRow,
} from '@/features/maintenance/manualSchedule';
import { ScreenHeader } from '@/features/shell/ScreenHeader';
import { useActiveVehicle } from '@/features/vehicles/ActiveVehicleContext';
import { he } from '@/i18n/he';
import { AppText, Button, colors, fontFamily, Icon, radii, Screen, spacing, Stack } from '@/ui';

/** Examples in the empty cells: light enough never to read as entered values. */
const PLACEHOLDER = '#C5CCD6';

/** A unique key per editor row (also across fast refreshes and re-opened screens). */
const newRow = (title = ''): TableRow => ({
  key: `new-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  title,
  km: '',
  months: '',
  note: '',
});

/**
 * "לוח טיפולים תקופתי" (owner decision 2026-10-04): the owner types the schedule as a table — one
 * row per item: the item, every km, every months. Saved as a whole; the next due of each item is
 * counted from the odometer at entry until a service is recorded.
 */
export default function MaintenanceTableScreen() {
  const router = useRouter();
  const { activeVehicle } = useActiveVehicle();
  const { plan } = useVehicleData(activeVehicle?.id ?? null);
  const { saveManualSchedule } = useAppData();
  const t = he.manualItem;
  const [rows, setRows] = useState<TableRow[]>(() => {
    const existing = itemsToTable(
      plan?.manual ?? [],
      (task) => he.maintenancePlan.tasks[task as TaskCode] ?? task,
    );
    return existing.length ? existing : [newRow()];
  });
  const [errors, setErrors] = useState<Record<string, RowErrors>>({});
  /** Rows whose note line is open (a row with a note shows a filled icon while closed). */
  const [openNotes, setOpenNotes] = useState<ReadonlySet<string>>(new Set());
  const toggleNote = (key: string) =>
    setOpenNotes((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (!activeVehicle) return null;

  const update = (key: string, patch: Partial<TableRow>) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  };
  const suggest = (label: string) =>
    setRows((rs) => {
      const empty = rs.find((r) => !r.title.trim());
      return empty
        ? rs.map((r) => (r === empty ? { ...r, title: label } : r))
        : [...rs, newRow(label)];
    });
  const used = new Set(rows.map((r) => r.title.trim()));
  const save = () => {
    const r = tableToRows(rows);
    if (!r.ok) return setErrors(r.errors);
    saveManualSchedule(activeVehicle.id, r.rows);
    router.back();
  };
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <Screen
      testID="screen-maintenance-table"
      header={<ScreenHeader title={t.tableTitle} />}
      footer={
        <Button testID="manual-table-save" label={t.save} icon="check" fullWidth onPress={save} />
      }
    >
      <Stack gap={spacing.md}>
        <View style={styles.table} testID="manual-table">
          <View style={[styles.row, styles.head]}>
            <AppText variant="smallStrong" style={styles.colName}>
              {t.colItem}
            </AppText>
            <AppText variant="smallStrong" align="center" numberOfLines={1} style={styles.colKm}>
              {t.colKm}
            </AppText>
            <AppText
              variant="smallStrong"
              align="center"
              numberOfLines={1}
              style={styles.colMonths}
            >
              {t.colMonths}
            </AppText>
            <View style={styles.colIcon} />
            <View style={styles.colIcon} />
          </View>
          {rows.map((r, i) => {
            const e = errors[r.key] ?? {};
            const hasNote = Boolean(r.note?.trim());
            const noteOpen = openNotes.has(r.key);
            return (
              <Fragment key={r.key}>
                <View style={[styles.row, i % 2 ? styles.rowAlt : null]}>
                  <TextInput
                    testID={`manual-row-${i}-title`}
                    value={r.title}
                    onChangeText={(title) => update(r.key, { title })}
                    placeholder={t.namePlaceholder}
                    placeholderTextColor={PLACEHOLDER}
                    maxLength={80}
                    accessibilityLabel={t.colItem}
                    style={[styles.cell, styles.colName, e.title ? styles.cellError : null]}
                  />
                  <TextInput
                    testID={`manual-row-${i}-km`}
                    value={r.km}
                    onChangeText={(km) => update(r.key, { km })}
                    placeholder="15000"
                    placeholderTextColor={PLACEHOLDER}
                    keyboardType="number-pad"
                    maxLength={7}
                    accessibilityLabel={t.colKm}
                    style={[
                      styles.cell,
                      styles.num,
                      styles.colKm,
                      e.km || e.interval ? styles.cellError : null,
                    ]}
                  />
                  <TextInput
                    testID={`manual-row-${i}-months`}
                    value={r.months}
                    onChangeText={(months) => update(r.key, { months })}
                    placeholder="12"
                    placeholderTextColor={PLACEHOLDER}
                    keyboardType="number-pad"
                    maxLength={3}
                    accessibilityLabel={t.colMonths}
                    style={[
                      styles.cell,
                      styles.num,
                      styles.colMonths,
                      e.months || e.interval ? styles.cellError : null,
                    ]}
                  />
                  <Pressable
                    testID={`manual-row-${i}-note-toggle`}
                    onPress={() => toggleNote(r.key)}
                    accessibilityRole="button"
                    accessibilityLabel={t.noteToggle}
                    accessibilityState={{ expanded: noteOpen }}
                    hitSlop={8}
                    style={styles.colIcon}
                  >
                    <Icon
                      name={hasNote ? 'note-text' : 'note-plus-outline'}
                      size={21}
                      color={hasNote || noteOpen ? 'primary' : 'textMuted'}
                    />
                  </Pressable>
                  <Pressable
                    testID={`manual-row-${i}-delete`}
                    onPress={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    accessibilityRole="button"
                    accessibilityLabel={t.deleteRow}
                    hitSlop={8}
                    style={styles.colIcon}
                  >
                    <Icon name="trash-can-outline" size={20} color="textMuted" />
                  </Pressable>
                </View>
                {noteOpen ? (
                  <View style={[styles.noteRow, i % 2 ? styles.rowAlt : null]}>
                    <AppText variant="smallStrong" color="primary">
                      {t.noteLabel}
                    </AppText>
                    <TextInput
                      testID={`manual-row-${i}-note`}
                      value={r.note ?? ''}
                      onChangeText={(note) => update(r.key, { note })}
                      placeholder={t.notePlaceholder}
                      placeholderTextColor={PLACEHOLDER}
                      maxLength={NOTE_MAX}
                      multiline
                      autoFocus={!hasNote}
                      accessibilityLabel={t.noteLabel}
                      style={[styles.cell, styles.noteInput]}
                    />
                  </View>
                ) : null}
              </Fragment>
            );
          })}
        </View>
        {hasErrors ? (
          <AppText variant="small" color="danger" testID="manual-table-error">
            {t.tableError}
          </AppText>
        ) : null}
        <Button
          testID="manual-table-add-row"
          label={t.addRow}
          icon="plus"
          variant="secondary"
          fullWidth
          onPress={() => setRows((rs) => [...rs, newRow()])}
        />
        <Stack gap={spacing.xs}>
          <AppText variant="smallStrong" color="textSecondary">
            {t.suggestions}
          </AppText>
          <View style={styles.chips}>
            {TABLE_SUGGESTIONS.filter((s) => !used.has(s.label)).map((s) => (
              <Pressable
                key={s.label}
                testID={`manual-suggest-${s.task}`}
                onPress={() => suggest(s.label)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.chip, pressed ? styles.chipPressed : null]}
              >
                <Icon name="plus" size={14} color="primary" />
                <AppText variant="small" color="primary">
                  {s.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Stack>
      </Stack>
    </Screen>
  );
}

const styles = StyleSheet.create({
  table: {
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowAlt: { backgroundColor: colors.surfaceTint },
  head: { backgroundColor: colors.primarySoft, paddingVertical: spacing.sm },
  colName: { flex: 2 },
  colKm: { flex: 1.3 },
  colMonths: { flex: 1.2 },
  colIcon: { width: 26, alignItems: 'center' },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  noteInput: { flex: 1, minHeight: 40, paddingVertical: 6, backgroundColor: colors.primarySoft },
  cell: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontFamily: fontFamily.regular,
    fontSize: 15,
    color: colors.textPrimary,
    textAlign: 'right',
  },
  num: { textAlign: 'center', writingDirection: 'ltr', fontFamily: fontFamily.bold },
  cellError: { borderColor: colors.danger, borderWidth: 1.5 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.surface,
  },
  chipPressed: { backgroundColor: colors.primarySoft },
});
