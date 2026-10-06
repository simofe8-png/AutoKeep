import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TABLE_ACTIONS, type IsoDate, type TableAction } from '@/domain';
import type { PeriodicService, TablePlan, TableRuleItem } from '@/engine/serviceTable';
import { useAppData } from '@/features/data/DataContext';
import type { ServiceTableVM } from '@/features/data/types';
import { parseUserDate, toUserDate } from '@/features/vehicles/expiry';
import type { VehicleSpec } from '@/persistence/repositories/vehicleSpec';
import { specForItem } from '@/features/vehicles/vehicleSpec';
import { formatDate, formatKm, formatNumber } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  Checkbox,
  colors,
  FilterChips,
  InlineNotice,
  radii,
  Sheet,
  spacing,
  Stack,
  TextField,
  type BadgeTone,
} from '@/ui';

import { ActionLetters } from './TableGrid';

const t = he.serviceTable;
const p = t.periodic;

const statusTone: Record<PeriodicService['status'], BadgeTone> = {
  overdue: 'danger',
  soon: 'warning',
  later: 'info',
};

/** The cell's main action groups it (a replacement over a check; ב/ח under "חזק"). */
const groupOf = (actions: readonly TableAction[]): TableAction =>
  TABLE_ACTIONS.find((a) => actions.includes(a) && a !== 'check') ?? 'check';

const actionNames = (actions: readonly TableAction[]) =>
  actions.map((a) => t.actions[a]).join(' / ');

function ruleWhen(r: TableRuleItem): string {
  const parts = [
    r.dueKm != null ? formatKm(r.dueKm) : null,
    r.dueDate ? formatDate(r.dueDate) : null,
  ].filter(Boolean);
  return p.ruleDue(parts.join(t.rule.or));
}

/**
 * "טיפול תקופתי" (owner decision 2026-10-06): from the approved table, the next service and the
 * one after — by the odometer or the time since the last service, whichever comes first. The owner
 * checks every item performed; saving writes ONE history record (a user report) and moves on.
 */
export function PeriodicSection({
  vehicleId,
  odometerKm,
  spec,
  vm,
  onToTable,
}: {
  vehicleId: string;
  odometerKm: number;
  /** The owner's vehicle spec, shown beside its item (the oil beside "שמן מנוע"). */
  spec?: VehicleSpec;
  vm: ServiceTableVM | null;
  onToTable: () => void;
}) {
  const [lastSheet, setLastSheet] = useState(false);
  const [ruleSheet, setRuleSheet] = useState<{ rowId: string; title: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const plan = vm?.status === 'confirmed' ? vm.plan : null;
  if (!vm || !plan) {
    return (
      <Card testID="periodic-no-table">
        <Stack gap={spacing.sm}>
          <AppText>{p.noTable}</AppText>
          <Button
            testID="periodic-to-table"
            label={p.toTable}
            icon="table-large"
            fullWidth
            onPress={onToTable}
          />
        </Stack>
      </Card>
    );
  }
  return (
    <Stack gap={spacing.md}>
      {!plan.lastPeriodic ? (
        <InlineNotice
          testID="periodic-no-last"
          tone="info"
          message={p.noLast}
          action={{ label: p.setLast, icon: 'calendar-edit', onPress: () => setLastSheet(true) }}
        />
      ) : null}
      {saved ? <InlineNotice testID="periodic-saved" tone="success" message={p.saved} /> : null}
      <NextService
        key={plan.next.n}
        vehicleId={vehicleId}
        service={plan.next}
        odometerKm={odometerKm}
        details={(rowId, title) =>
          [
            specForItem(title, spec) ? t.row.specLine(specForItem(title, spec)!) : null,
            vm.table.rows.find((r) => r.id === rowId)?.note
              ? t.row.noteLine(vm.table.rows.find((r) => r.id === rowId)!.note!)
              : null,
          ].filter((x): x is string => Boolean(x))
        }
        onSaved={() => setSaved(true)}
      />
      {plan.rulesUnknown.length ? (
        <Card testID="periodic-unknown">
          <Stack gap={spacing.sm}>
            <AppText variant="heading">{p.unknownTitle}</AppText>
            <AppText variant="small" color="textSecondary">
              {p.unknownBody}
            </AppText>
            {plan.rulesUnknown.map((r) => (
              <View key={r.rowId} style={styles.unknownRow} testID={`periodic-unknown-${r.rowId}`}>
                <ActionLetters actions={[r.action]} />
                <AppText style={styles.flex}>{r.title}</AppText>
                <Button
                  testID={`periodic-unknown-${r.rowId}-set`}
                  label={p.setDone}
                  size="sm"
                  variant="secondary"
                  onPress={() => setRuleSheet({ rowId: r.rowId, title: r.title })}
                />
              </View>
            ))}
          </Stack>
        </Card>
      ) : null}
      <AfterService service={plan.after} />
      <AppText variant="caption" color="textSecondary">
        {p.history}
      </AppText>
      <LastServiceSheet
        visible={lastSheet}
        vehicleId={vehicleId}
        plan={plan}
        odometerKm={odometerKm}
        onClose={() => setLastSheet(false)}
      />
      <RuleDoneSheet target={ruleSheet} vehicleId={vehicleId} onClose={() => setRuleSheet(null)} />
    </Stack>
  );
}

function DueLines({ service }: { service: PeriodicService }) {
  const km = formatKm(service.km);
  return (
    <Stack gap={spacing.xxs}>
      <AppText variant="small" color="textSecondary" testID="periodic-due">
        {service.dueDate ? p.dueBoth(km, formatDate(service.dueDate)) : p.dueKm(km)}
      </AppText>
      <AppText variant="smallStrong" testID="periodic-remaining">
        {[
          service.remainingKm >= 0
            ? p.leftKm(formatKm(service.remainingKm))
            : p.overKm(formatKm(-service.remainingKm)),
          service.remainingDays == null
            ? null
            : service.remainingDays >= 0
              ? p.leftDays(service.remainingDays)
              : p.overDays(-service.remainingDays),
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
    </Stack>
  );
}

function NextService({
  vehicleId,
  service,
  odometerKm,
  details,
  onSaved,
}: {
  vehicleId: string;
  service: PeriodicService;
  odometerKm: number;
  /** The spec / note lines shown under an item. */
  details: (rowId: string, title: string) => string[];
  onSaved: () => void;
}) {
  const { saveTableService, today } = useAppData();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [showChecks, setShowChecks] = useState(false);
  const [date, setDate] = useState(toUserDate(today()));
  const [km, setKm] = useState(String(odometerKm || ''));
  const [garage, setGarage] = useState('');
  const [touched, setTouched] = useState(false);

  const toggle = (key: string) =>
    setChecked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const groups = TABLE_ACTIONS.map((a) => ({
    action: a,
    items: service.items.filter((i) => groupOf(i.actions) === a),
  })).filter((g) => g.items.length);
  const allKeys = [
    ...service.items.map((i) => i.rowId),
    ...service.rules.map((r) => `rule:${r.rowId}`),
  ];

  const parsedDate = parseUserDate(date);
  const kmValue = /^\d+$/.test(km.replace(/[,\s]/g, '')) ? Number(km.replace(/[,\s]/g, '')) : null;
  const errors = {
    none: checked.size === 0,
    date: !parsedDate || parsedDate > today(),
    km: kmValue == null,
  };

  const save = () => {
    setTouched(true);
    if (errors.none || errors.date || errors.km) return;
    saveTableService(vehicleId, {
      serviceNo: service.n,
      date: parsedDate as IsoDate,
      odometerKm: kmValue!,
      garage: garage.trim() || undefined,
      notes: p.serviceTitle(formatKm(service.km)),
      items: service.items
        .filter((i) => checked.has(i.rowId))
        .map((i) => ({ rowId: i.rowId, title: i.title, actions: i.actions })),
      rules: service.rules
        .filter((r) => checked.has(`rule:${r.rowId}`))
        .map((r) => ({ rowId: r.rowId, title: r.title, action: r.action })),
    });
    onSaved();
  };

  return (
    <Card testID="periodic-next" tone="tint">
      <Stack gap={spacing.md}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <AppText variant="caption" color="primary">
              {p.next}
            </AppText>
            <AppText variant="title" testID="periodic-next-title">
              {p.serviceTitle(formatNumber(service.km))}
            </AppText>
          </View>
          <Badge label={p.status[service.status]} tone={statusTone[service.status]} />
        </View>
        <DueLines service={service} />

        {groups.map((g) => {
          const isCheck = g.action === 'check';
          const open = !isCheck || showChecks;
          return (
            <Stack key={g.action} gap={spacing.xxs} testID={`periodic-group-${g.action}`}>
              <View style={styles.groupHead}>
                <ActionLetters actions={[g.action]} />
                <AppText variant="smallStrong" style={styles.flex}>
                  {`${t.actions[g.action]} · ${p.items(g.items.length)}`}
                </AppText>
                {isCheck ? (
                  <Button
                    testID="periodic-toggle-checks"
                    label={showChecks ? he.common.showLess : he.common.showMore}
                    variant="ghost"
                    size="sm"
                    onPress={() => setShowChecks((v) => !v)}
                  />
                ) : null}
              </View>
              {open
                ? g.items.map((i) => (
                    <Checkbox
                      key={i.rowId}
                      testID={`periodic-item-${i.rowId}`}
                      checked={checked.has(i.rowId)}
                      onChange={() => toggle(i.rowId)}
                      label={i.title}
                      description={
                        [
                          ...(i.actions.length > 1 ? [actionNames(i.actions)] : []),
                          ...details(i.rowId, i.title),
                        ].join(' · ') || undefined
                      }
                    />
                  ))
                : null}
            </Stack>
          );
        })}

        {service.rules.length ? (
          <Stack gap={spacing.xxs} testID="periodic-rules">
            <AppText variant="smallStrong">{p.byRule}</AppText>
            {service.rules.map((r) => (
              <Checkbox
                key={r.rowId}
                testID={`periodic-rule-${r.rowId}`}
                checked={checked.has(`rule:${r.rowId}`)}
                onChange={() => toggle(`rule:${r.rowId}`)}
                label={`${r.title} — ${t.actions[r.action]}`}
                description={[ruleWhen(r), ...details(r.rowId, r.title)].join(' · ')}
              />
            ))}
          </Stack>
        ) : null}

        <Button
          testID="periodic-mark-all"
          label={p.markAll}
          icon="check-all"
          variant="secondary"
          fullWidth
          onPress={() => {
            setChecked(new Set(allKeys));
            setShowChecks(true);
          }}
        />
        <TextField
          testID="periodic-date"
          label={p.date}
          value={date}
          onChangeText={setDate}
          keyboardType="numbers-and-punctuation"
          hint={he.vehicleDates.dateHint}
          error={touched && errors.date ? he.vehicleDates.dateError : undefined}
        />
        <TextField
          testID="periodic-km"
          label={p.odometer}
          value={km}
          onChangeText={setKm}
          keyboardType="number-pad"
          suffix={he.common.km}
          maxLength={7}
          error={touched && errors.km ? p.odometerError : undefined}
        />
        <TextField
          testID="periodic-garage"
          label={p.garage}
          value={garage}
          onChangeText={setGarage}
          maxLength={80}
        />
        {touched && errors.none ? (
          <InlineNotice testID="periodic-nothing" tone="warning" message={p.nothingChecked} />
        ) : null}
        <Button
          testID="periodic-save"
          label={p.save}
          icon="content-save"
          fullWidth
          onPress={save}
        />
      </Stack>
    </Card>
  );
}

function AfterService({ service }: { service: PeriodicService }) {
  const groups = TABLE_ACTIONS.map((a) => ({
    action: a,
    n: service.items.filter((i) => groupOf(i.actions) === a).length,
  })).filter((g) => g.n);
  return (
    <Card testID="periodic-after">
      <Stack gap={spacing.sm}>
        <View style={styles.head}>
          <View style={styles.flex}>
            <AppText variant="caption" color="textSecondary">
              {p.after}
            </AppText>
            <AppText variant="heading" testID="periodic-after-title">
              {p.serviceTitle(formatNumber(service.km))}
            </AppText>
          </View>
        </View>
        <AppText variant="small" color="textSecondary">
          {service.dueDate
            ? p.dueBoth(formatKm(service.km), formatDate(service.dueDate))
            : p.dueKm(formatKm(service.km))}
        </AppText>
        <View style={styles.summary}>
          {groups.map((g) => (
            <View key={g.action} style={styles.summaryItem}>
              <ActionLetters actions={[g.action]} />
              <AppText variant="caption" color="textSecondary">
                {p.items(g.n)}
              </AppText>
            </View>
          ))}
        </View>
        {service.items
          .filter((i) => groupOf(i.actions) !== 'check')
          .map((i) => (
            <AppText key={i.rowId} variant="small">
              {`${i.title} — ${actionNames(i.actions)}`}
            </AppText>
          ))}
        {service.rules.map((r) => (
          <AppText key={r.rowId} variant="small">
            {`${r.title} — ${t.actions[r.action]} (${ruleWhen(r)})`}
          </AppText>
        ))}
      </Stack>
    </Card>
  );
}

/** "The last periodic service was 150,000 in March": the service, its date and odometer. */
function LastServiceSheet({
  visible,
  vehicleId,
  plan,
  odometerKm,
  onClose,
}: {
  visible: boolean;
  vehicleId: string;
  plan: TablePlan;
  odometerKm: number;
  onClose: () => void;
}) {
  const { recordTableDone, today } = useAppData();
  const step = plan.next.km / plan.next.n;
  const top = Math.max(1, Math.floor(odometerKm / step));
  const choices = [top + 1, top, top - 1, top - 2].filter((n) => n >= 1);
  const [n, setN] = useState(String(top));
  const [date, setDate] = useState('');
  const [km, setKm] = useState('');
  const [touched, setTouched] = useState(false);
  const parsed = parseUserDate(date);
  const kmClean = km.replace(/[,\s]/g, '');
  const errors = {
    date: !parsed || parsed > today(),
    km: kmClean !== '' && !/^\d+$/.test(kmClean),
  };
  return (
    <Sheet visible={visible} title={p.lastTitle} onClose={onClose} testID="periodic-last-sheet">
      <Stack gap={spacing.md}>
        <AppText variant="smallStrong">{p.lastWhich}</AppText>
        <FilterChips
          testID="periodic-last-which"
          accessibilityLabel={p.lastWhich}
          value={n}
          onChange={setN}
          options={choices.map((c) => ({
            value: String(c),
            label: p.serviceTitle(formatNumber(c * step)),
          }))}
        />
        <TextField
          testID="periodic-last-date"
          label={p.lastDate}
          value={date}
          onChangeText={setDate}
          placeholder={he.vehicleDates.datePlaceholder}
          keyboardType="numbers-and-punctuation"
          hint={he.vehicleDates.dateHint}
          error={touched && errors.date ? he.vehicleDates.dateError : undefined}
        />
        <TextField
          testID="periodic-last-km"
          label={p.lastKm}
          value={km}
          onChangeText={setKm}
          keyboardType="number-pad"
          suffix={he.common.km}
          maxLength={7}
          error={touched && errors.km ? p.odometerError : undefined}
        />
        <Button
          testID="periodic-last-save"
          label={he.profile.sheets.save}
          icon="check"
          fullWidth
          onPress={() => {
            setTouched(true);
            if (errors.date || errors.km) return;
            recordTableDone(vehicleId, {
              kind: 'periodic',
              serviceNo: Number(n),
              rowId: null,
              km: kmClean ? Number(kmClean) : null,
              date: parsed as IsoDate,
            });
            onClose();
          }}
        />
      </Stack>
    </Sheet>
  );
}

/** When a rule item (brake fluid, plugs…) was last done. */
function RuleDoneSheet({
  target,
  vehicleId,
  onClose,
}: {
  target: { rowId: string; title: string } | null;
  vehicleId: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      visible={target != null}
      title={target ? p.ruleDoneTitle(target.title) : ''}
      onClose={onClose}
      testID="periodic-rule-sheet"
    >
      {target ? (
        <RuleDoneForm
          key={target.rowId}
          rowId={target.rowId}
          vehicleId={vehicleId}
          onDone={onClose}
        />
      ) : null}
    </Sheet>
  );
}

function RuleDoneForm({
  rowId,
  vehicleId,
  onDone,
}: {
  rowId: string;
  vehicleId: string;
  onDone: () => void;
}) {
  const { recordTableDone, today } = useAppData();
  const [date, setDate] = useState('');
  const [km, setKm] = useState('');
  const [touched, setTouched] = useState(false);
  const parsed = parseUserDate(date);
  const kmClean = km.replace(/[,\s]/g, '');
  const errors = {
    date: !parsed || parsed > today(),
    km: kmClean !== '' && !/^\d+$/.test(kmClean),
  };
  return (
    <Stack gap={spacing.md}>
      <TextField
        testID="periodic-rule-date"
        label={p.lastDate}
        value={date}
        onChangeText={setDate}
        placeholder={he.vehicleDates.datePlaceholder}
        keyboardType="numbers-and-punctuation"
        hint={he.vehicleDates.dateHint}
        error={touched && errors.date ? he.vehicleDates.dateError : undefined}
      />
      <TextField
        testID="periodic-rule-km"
        label={p.lastKm}
        value={km}
        onChangeText={setKm}
        keyboardType="number-pad"
        suffix={he.common.km}
        maxLength={7}
        error={touched && errors.km ? p.odometerError : undefined}
      />
      <Button
        testID="periodic-rule-save"
        label={he.profile.sheets.save}
        icon="check"
        fullWidth
        onPress={() => {
          setTouched(true);
          if (errors.date || errors.km) return;
          recordTableDone(vehicleId, {
            kind: 'rule',
            serviceNo: null,
            rowId,
            km: kmClean ? Number(kmClean) : null,
            date: parsed as IsoDate,
          });
          onDone();
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  unknownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  summary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
