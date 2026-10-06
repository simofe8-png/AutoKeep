import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  DEFAULT_TABLE_SHAPE,
  type ServiceTable,
  type ServiceTableRow,
  type TableAction,
  type TableRule,
} from '@/domain';
import { newLocalId } from '@/features/data/DataContext';
import { formatNumber } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Button,
  Checkbox,
  colors,
  radii,
  SegmentedControl,
  Sheet,
  spacing,
  Stack,
  TextField,
} from '@/ui';

import { ActionLetters } from './TableGrid';

const ORDER: TableAction[] = ['check', 'replace', 'adjust', 'lube', 'tighten', 'clean'];
const t = he.serviceTable;

function ActionChip({
  action,
  selected,
  onPress,
  testID,
}: {
  action: TableAction | 'none';
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      style={[styles.chip, selected && styles.chipOn]}
    >
      {action !== 'none' ? <ActionLetters actions={[action]} /> : null}
      <AppText variant="smallStrong" color={selected ? 'primary' : 'textSecondary'}>
        {action === 'none' ? t.ruleNone : t.actions[action]}
      </AppText>
    </Pressable>
  );
}

/** One cell: one or two actions (a combined cell like ב/ח), or empty. */
export function CellSheet({
  table,
  target,
  onSave,
  onClose,
}: {
  table: ServiceTable;
  target: { rowId: string; column: number } | null;
  onSave: (actions: TableAction[], wholeRow: boolean) => void;
  onClose: () => void;
}) {
  const row = target ? table.rows.find((r) => r.id === target.rowId) : undefined;
  return (
    <Sheet
      visible={Boolean(row && target)}
      title={
        row && target
          ? t.cell.title(row.title, formatNumber((target.column + 1) * table.kmStep))
          : ''
      }
      onClose={onClose}
      testID="table-cell-sheet"
    >
      {row && target ? (
        <CellForm
          key={`${target.rowId}:${target.column}`}
          initial={row.cells?.[target.column] ?? []}
          onSave={onSave}
        />
      ) : null}
    </Sheet>
  );
}

function CellForm({
  initial,
  onSave,
}: {
  initial: TableAction[];
  onSave: (actions: TableAction[], wholeRow: boolean) => void;
}) {
  const [actions, setActions] = useState<TableAction[]>(initial);
  const [wholeRow, setWholeRow] = useState(false);
  const toggle = (a: TableAction) =>
    setActions((cur) =>
      cur.includes(a) ? cur.filter((x) => x !== a) : cur.length >= 2 ? [cur[0], a] : [...cur, a],
    );
  return (
    <Stack gap={spacing.md}>
      <AppText color="textSecondary">{t.cell.hint}</AppText>
      <View style={styles.chips}>
        {ORDER.map((a) => (
          <ActionChip
            key={a}
            testID={`table-cell-action-${a}`}
            action={a}
            selected={actions.includes(a)}
            onPress={() => toggle(a)}
          />
        ))}
      </View>
      <Checkbox
        testID="table-cell-whole-row"
        checked={wholeRow}
        onChange={setWholeRow}
        label={t.cell.allRow}
      />
      <Button
        testID="table-cell-save"
        label={t.cell.save}
        icon="check"
        fullWidth
        onPress={() => onSave(actions, wholeRow)}
      />
      <Button
        testID="table-cell-clear"
        label={t.cell.clear}
        variant="ghost"
        fullWidth
        onPress={() => onSave([], wholeRow)}
      />
    </Stack>
  );
}

const int = (s: string): number | null | undefined => {
  const v = s.replace(/[,\s]/g, '');
  if (!v) return null;
  return /^\d+$/.test(v) ? Number(v) : undefined;
};

/** A row: its name, heading, footnote, and either cells (by the table) or a rule. */
export function RowSheet({
  table,
  rowId,
  onSave,
  onDelete,
  onClose,
}: {
  table: ServiceTable;
  /** 'new': a row to add. */
  rowId: string | 'new' | null;
  /** `refilled`: every cell was set from "פעולה בכל הטיפולים". */
  onSave: (row: ServiceTableRow, refilled: boolean) => void;
  onDelete: (rowId: string) => void;
  onClose: () => void;
}) {
  const row = rowId && rowId !== 'new' ? table.rows.find((r) => r.id === rowId) : undefined;
  return (
    <Sheet
      visible={rowId != null}
      title={row?.title || t.row.title}
      onClose={onClose}
      testID="table-row-sheet"
    >
      {rowId != null ? (
        <RowForm key={rowId} table={table} row={row} onSave={onSave} onDelete={onDelete} />
      ) : null}
    </Sheet>
  );
}

function RowForm({
  table,
  row,
  onSave,
  onDelete,
}: {
  table: ServiceTable;
  row: ServiceTableRow | undefined;
  onSave: (row: ServiceTableRow, refilled: boolean) => void;
  onDelete: (rowId: string) => void;
}) {
  const [title, setTitle] = useState(row?.title ?? '');
  const [group, setGroup] = useState(row?.group ?? table.rows[table.rows.length - 1]?.group ?? '');
  const [footnote, setFootnote] = useState(row?.footnote != null ? String(row.footnote) : '');
  const [kind, setKind] = useState<'grid' | 'rule'>(row?.rule ? 'rule' : 'grid');
  const [fill, setFill] = useState<TableAction | null>(null);
  const [ruleAction, setRuleAction] = useState<TableRule['action']>(row?.rule?.action ?? 'replace');
  const [months, setMonths] = useState(
    row?.rule?.everyMonths != null ? String(row.rule.everyMonths) : '',
  );
  const [km, setKm] = useState(row?.rule?.everyKm != null ? String(row.rule.everyKm) : '');
  const [text, setText] = useState(row?.rule?.text ?? '');
  const [note, setNote] = useState(row?.note ?? '');
  const [touched, setTouched] = useState(false);

  const m = int(months);
  const k = int(km);
  const errors = {
    title: !title.trim(),
    rule:
      kind === 'rule' &&
      (m === undefined || k === undefined || (ruleAction !== 'none' && m == null && k == null)),
    footnote: int(footnote) === undefined,
  };

  const save = () => {
    setTouched(true);
    if (errors.title || errors.rule || errors.footnote) return;
    const cells =
      kind === 'grid'
        ? fill
          ? Array.from({ length: table.columns }, () => [fill])
          : (row?.cells ?? Array.from({ length: table.columns }, () => []))
        : null;
    onSave(
      {
        id: row?.id ?? newLocalId(),
        group: group.trim(),
        title: title.trim(),
        footnote: int(footnote) ?? null,
        cells,
        rule:
          kind === 'rule'
            ? {
                action: ruleAction,
                everyMonths: ruleAction === 'none' ? null : (m ?? null),
                everyKm: ruleAction === 'none' ? null : (k ?? null),
                text: text.trim(),
              }
            : null,
        note: note.trim() || null,
      },
      kind === 'grid' && fill != null,
    );
  };

  return (
    <Stack gap={spacing.md}>
      <TextField
        testID="table-row-title"
        label={t.row.name}
        required
        value={title}
        onChangeText={setTitle}
        maxLength={80}
        error={touched && errors.title ? t.row.nameError : undefined}
      />
      <TextField
        testID="table-row-group"
        label={t.row.group}
        value={group}
        onChangeText={setGroup}
        maxLength={60}
      />
      <TextField
        testID="table-row-footnote"
        label={t.row.footnote}
        value={footnote}
        onChangeText={setFootnote}
        keyboardType="number-pad"
        maxLength={2}
      />
      <AppText variant="smallStrong">{t.row.kind}</AppText>
      <SegmentedControl
        testID="table-row-kind"
        accessibilityLabel={t.row.kind}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'grid', label: t.row.grid },
          { value: 'rule', label: t.row.rule },
        ]}
      />
      {kind === 'grid' ? (
        <Stack gap={spacing.xs}>
          <AppText variant="smallStrong">{t.row.fill}</AppText>
          <View style={styles.chips}>
            {ORDER.map((a) => (
              <ActionChip
                key={a}
                testID={`table-row-fill-${a}`}
                action={a}
                selected={fill === a}
                onPress={() => setFill(fill === a ? null : a)}
              />
            ))}
          </View>
        </Stack>
      ) : (
        <Stack gap={spacing.sm}>
          <AppText variant="smallStrong">{t.row.ruleAction}</AppText>
          <View style={styles.chips}>
            {[...ORDER, 'none' as const].map((a) => (
              <ActionChip
                key={a}
                testID={`table-row-rule-${a}`}
                action={a}
                selected={ruleAction === a}
                onPress={() => setRuleAction(a)}
              />
            ))}
          </View>
          {ruleAction !== 'none' ? (
            <>
              <TextField
                testID="table-row-months"
                label={t.row.ruleMonths}
                value={months}
                onChangeText={setMonths}
                keyboardType="number-pad"
                maxLength={3}
                error={touched && errors.rule ? t.row.ruleError : undefined}
              />
              <TextField
                testID="table-row-km"
                label={t.row.ruleKm}
                value={km}
                onChangeText={setKm}
                keyboardType="number-pad"
                suffix={he.common.km}
                maxLength={7}
              />
            </>
          ) : null}
          <TextField
            testID="table-row-text"
            label={t.row.ruleText}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={200}
          />
        </Stack>
      )}
      <TextField
        testID="table-row-note"
        label={t.row.note}
        value={note}
        onChangeText={setNote}
        maxLength={120}
      />
      <Button testID="table-row-save" label={t.row.save} icon="check" fullWidth onPress={save} />
      {row ? (
        <Button
          testID="table-row-delete"
          label={t.row.delete}
          icon="delete-outline"
          variant="ghost"
          fullWidth
          onPress={() => onDelete(row.id)}
        />
      ) : null}
    </Stack>
  );
}

/** A new table typed by the owner: its shape, as at the top of the booklet's table. */
export function ShapeSheet({
  visible,
  onCreate,
  onClose,
}: {
  visible: boolean;
  onCreate: (shape: Pick<ServiceTable, 'kmStep' | 'monthsStep' | 'columns'>) => void;
  onClose: () => void;
}) {
  const [kmStep, setKmStep] = useState(String(DEFAULT_TABLE_SHAPE.kmStep));
  const [monthsStep, setMonthsStep] = useState(String(DEFAULT_TABLE_SHAPE.monthsStep));
  const [columns, setColumns] = useState(String(DEFAULT_TABLE_SHAPE.columns));
  const [touched, setTouched] = useState(false);
  const v = { kmStep: int(kmStep), monthsStep: int(monthsStep), columns: int(columns) };
  const bad = Object.values(v).some((x) => x == null || x <= 0) || (v.columns ?? 0) > 40;
  return (
    <Sheet visible={visible} title={t.shape.title} onClose={onClose} testID="table-shape-sheet">
      <Stack gap={spacing.md}>
        <AppText color="textSecondary">{t.shape.intro}</AppText>
        <TextField
          testID="table-shape-km"
          label={t.shape.kmStep}
          value={kmStep}
          onChangeText={setKmStep}
          keyboardType="number-pad"
          suffix={he.common.km}
          maxLength={6}
        />
        <TextField
          testID="table-shape-months"
          label={t.shape.monthsStep}
          value={monthsStep}
          onChangeText={setMonthsStep}
          keyboardType="number-pad"
          maxLength={3}
        />
        <TextField
          testID="table-shape-columns"
          label={t.shape.columns}
          value={columns}
          onChangeText={setColumns}
          keyboardType="number-pad"
          maxLength={2}
          error={touched && bad ? t.shape.error : undefined}
        />
        <Button
          testID="table-shape-create"
          label={t.shape.start}
          icon="table-plus"
          fullWidth
          onPress={() => {
            setTouched(true);
            if (bad) return;
            onCreate({ kmStep: v.kmStep!, monthsStep: v.monthsStep!, columns: v.columns! });
          }}
        />
      </Stack>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
