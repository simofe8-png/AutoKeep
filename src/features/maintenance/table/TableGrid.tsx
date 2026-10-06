import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  lettersOf,
  TABLE_ACTIONS,
  type ServiceTable,
  type TableAction,
  type TableRule,
} from '@/domain';
import { formatNumber } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { AppText, colors, radii, SegmentedControl, spacing, type ColorToken } from '@/ui';

/**
 * The owner's table drawn like the booklet (owner decision 2026-10-06): the item column, then the
 * service columns with the km (× 1000) and months header rows, the action letters in the cells,
 * rule rows written across the columns, system headings, the legend and the footnotes. A phone
 * shows 8 service columns at a time.
 */

export const PAGE_COLUMNS = 8;

const tone: Record<TableAction, { fg: ColorToken; bg: string }> = {
  check: { fg: 'neutral', bg: colors.neutralSoft },
  replace: { fg: 'primary', bg: colors.primarySoft },
  adjust: { fg: 'warning', bg: colors.warningSoft },
  lube: { fg: 'success', bg: colors.successSoft },
  tighten: { fg: 'textPrimary', bg: colors.surfaceMuted },
  clean: { fg: 'primary', bg: colors.surfaceTint },
};

/** The main action of a cell sets its colour (a replacement over a check). */
const lead = (actions: readonly TableAction[]) =>
  TABLE_ACTIONS.find((a) => actions.includes(a)) ?? actions[0];

export function ruleText(rule: TableRule): string {
  const t = he.serviceTable;
  if (rule.action === 'none') return rule.text || t.ruleNone;
  if (rule.text) return rule.text;
  const parts = [
    rule.everyMonths != null ? t.rule.months(rule.everyMonths) : null,
    rule.everyKm != null ? `${formatNumber(rule.everyKm)} ${he.common.km}` : null,
  ].filter(Boolean);
  return `${t.actions[rule.action]} ${t.rule.every(parts.join(t.rule.or))}`;
}

export function ActionLetters({ actions, unsure }: { actions: TableAction[]; unsure?: boolean }) {
  const a = actions.length ? lead(actions) : null;
  return (
    <View
      style={[
        styles.letters,
        a ? { backgroundColor: tone[a].bg } : null,
        unsure ? styles.unsure : null,
      ]}
    >
      <AppText variant="smallStrong" color={a ? tone[a].fg : 'warning'} align="center">
        {actions.length ? lettersOf(actions) : unsure ? '?' : ''}
      </AppText>
    </View>
  );
}

export function TableLegend() {
  return (
    <View style={styles.legend} testID="table-legend">
      {(['check', 'adjust', 'replace', 'lube', 'tighten', 'clean'] as const).map((a) => (
        <View key={a} style={styles.legendItem}>
          <ActionLetters actions={[a]} />
          <AppText variant="caption" color="textSecondary">
            {he.serviceTable.actions[a]}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function TableGrid({
  table,
  unsure,
  onCellPress,
  onRowPress,
  testID = 'table-grid',
}: {
  table: ServiceTable;
  unsure?: readonly string[];
  onCellPress?: (rowId: string, column: number) => void;
  onRowPress?: (rowId: string) => void;
  testID?: string;
}) {
  const t = he.serviceTable;
  const pages = Math.max(1, Math.ceil(table.columns / PAGE_COLUMNS));
  const [page, setPage] = useState(0);
  const from = Math.min(page, pages - 1) * PAGE_COLUMNS;
  const cols = Array.from(
    { length: Math.min(PAGE_COLUMNS, table.columns - from) },
    (_, i) => from + i,
  );
  const flagged = new Set(unsure ?? []);
  const kmK = (c: number) => formatNumber(((c + 1) * table.kmStep) / 1000);

  return (
    <View testID={testID} style={styles.wrap}>
      {pages > 1 ? (
        <SegmentedControl
          testID={`${testID}-pages`}
          accessibilityLabel={t.columnsLabel}
          value={String(page)}
          onChange={(v) => setPage(Number(v))}
          options={Array.from({ length: pages }, (_, p) => {
            const a = p * PAGE_COLUMNS;
            const b = Math.min(table.columns, a + PAGE_COLUMNS) - 1;
            return { value: String(p), label: `${kmK(a)}–${kmK(b)}` };
          })}
        />
      ) : null}
      <View style={styles.table}>
        <View style={[styles.row, styles.head]}>
          <View style={styles.title}>
            <AppText variant="caption" color="textSecondary">
              {t.kmHeader}
            </AppText>
          </View>
          <View style={styles.cells}>
            {cols.map((c) => (
              <View key={c} style={styles.cell}>
                <AppText variant="caption" color="textPrimary" align="center">
                  {kmK(c)}
                </AppText>
              </View>
            ))}
          </View>
        </View>
        <View style={[styles.row, styles.head]}>
          <View style={styles.title}>
            <AppText variant="caption" color="textSecondary">
              {t.monthsHeader}
            </AppText>
          </View>
          <View style={styles.cells}>
            {cols.map((c) => (
              <View key={c} style={styles.cell}>
                <AppText variant="caption" color="textSecondary" align="center">
                  {formatNumber((c + 1) * table.monthsStep)}
                </AppText>
              </View>
            ))}
          </View>
        </View>
        {table.rows.map((r, i) => {
          const heading = r.group && r.group !== table.rows[i - 1]?.group;
          const name = r.footnote != null ? `${r.title} (*${r.footnote})` : r.title;
          const rowUnsure = flagged.has(r.id);
          return (
            <Fragment key={r.id}>
              {heading ? (
                <View style={[styles.row, styles.group]}>
                  <AppText variant="smallStrong" color="primary">
                    {r.group}
                  </AppText>
                </View>
              ) : null}
              <View style={styles.row} testID={`table-row-${r.id}`}>
                <Pressable
                  style={styles.title}
                  disabled={!onRowPress}
                  onPress={() => onRowPress?.(r.id)}
                  accessibilityRole={onRowPress ? 'button' : undefined}
                  accessibilityLabel={name}
                  testID={`table-row-${r.id}-title`}
                >
                  <AppText variant="small" numberOfLines={3}>
                    {name || '—'}
                  </AppText>
                  {r.note ? (
                    <AppText
                      variant="caption"
                      color="textSecondary"
                      numberOfLines={2}
                      testID={`table-row-${r.id}-note`}
                    >
                      {t.row.noteLine(r.note)}
                    </AppText>
                  ) : null}
                </Pressable>
                {r.rule ? (
                  <Pressable
                    style={[styles.cells, styles.rule, rowUnsure && styles.unsure]}
                    disabled={!onRowPress}
                    onPress={() => onRowPress?.(r.id)}
                    accessibilityRole={onRowPress ? 'button' : undefined}
                    testID={`table-row-${r.id}-rule`}
                  >
                    <AppText variant="caption" color="textPrimary" align="center">
                      {ruleText(r.rule)}
                    </AppText>
                  </Pressable>
                ) : (
                  <View style={styles.cells}>
                    {cols.map((c) => {
                      const key = `${r.id}:${c}`;
                      const actions = r.cells?.[c] ?? [];
                      return (
                        <Pressable
                          key={c}
                          style={styles.cell}
                          disabled={!onCellPress}
                          onPress={() => onCellPress?.(r.id, c)}
                          accessibilityRole={onCellPress ? 'button' : undefined}
                          accessibilityLabel={`${name} · ${kmK(c)} · ${
                            actions.map((a) => t.actions[a]).join(' / ') || '—'
                          }`}
                          testID={`table-cell-${key}`}
                        >
                          <ActionLetters actions={actions} unsure={flagged.has(key)} />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </Fragment>
          );
        })}
      </View>
      <TableLegend />
      {table.footnotes.length ? (
        <View style={styles.notes} testID="table-footnotes">
          <AppText variant="smallStrong">{t.footnotes}</AppText>
          {table.footnotes.map((f) => (
            <AppText key={f.n} variant="caption" color="textSecondary">
              {`(*${f.n}) ${f.text}`}
            </AppText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const CELL = 26;

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    minHeight: 34,
  },
  head: { backgroundColor: colors.surfaceMuted },
  group: {
    backgroundColor: colors.surfaceTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    minHeight: 0,
  },
  title: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    borderEndWidth: 1,
    borderEndColor: colors.divider,
  },
  cells: { flexDirection: 'row', width: CELL * PAGE_COLUMNS + 2 * PAGE_COLUMNS },
  cell: {
    width: CELL + 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  rule: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xxs,
    backgroundColor: colors.surfaceTint,
  },
  letters: {
    minWidth: CELL - 2,
    height: CELL - 4,
    paddingHorizontal: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unsure: {
    backgroundColor: colors.warningSoft,
    borderWidth: 1.5,
    borderColor: colors.attention,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  notes: { gap: spacing.xxs },
});
