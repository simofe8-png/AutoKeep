import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppData } from '@/features/data/DataContext';
import type { TrackedItemVM } from '@/features/data/types';
import { parseUserDate } from '@/features/vehicles/expiry';
import { he } from '@/i18n/he';
import { AppText, Button, Card, colors, IconButton, Sheet, spacing, Stack, TextField } from '@/ui';

import { lastWhen } from './PeriodicSection';

const p = he.serviceTable.periodic;

type Target = { mode: 'add' } | { mode: 'done'; title: string };

/**
 * Items the owner tracks beyond the schedule (battery, wheel alignment, tyres…). When each was
 * last done comes from history; recording it writes a history record, so the two never diverge.
 */
export function TrackedItemsCard({
  vehicleId,
  items,
  odometerKm,
}: {
  vehicleId: string;
  items: readonly TrackedItemVM[];
  odometerKm: number;
}) {
  const { removeTrackedItem } = useAppData();
  const [target, setTarget] = useState<Target | null>(null);
  return (
    <Card testID="tracked-items">
      <Stack gap={spacing.sm}>
        <AppText variant="heading">{p.trackedTitle}</AppText>
        <AppText variant="small" color="textSecondary">
          {p.trackedBody}
        </AppText>
        {items.map((i) => (
          <View key={i.id} style={styles.row} testID={`tracked-${i.id}`}>
            <View style={styles.flex}>
              <AppText>{i.title}</AppText>
              <AppText variant="small" color="textSecondary" testID={`tracked-${i.id}-last`}>
                {i.lastDone
                  ? p.lastLine(lastWhen(i.lastDone), i.lastDone.source)
                  : p.trackedUnknown}
              </AppText>
            </View>
            <Button
              testID={`tracked-${i.id}-set`}
              label={p.setDone}
              size="sm"
              variant="secondary"
              onPress={() => setTarget({ mode: 'done', title: i.title })}
            />
            <IconButton
              testID={`tracked-${i.id}-remove`}
              icon="delete-outline"
              accessibilityLabel={p.trackedRemove}
              onPress={() => removeTrackedItem(vehicleId, i.id)}
            />
          </View>
        ))}
        <Button
          testID="tracked-add"
          label={p.trackedAdd}
          icon="plus"
          variant="secondary"
          fullWidth
          onPress={() => setTarget({ mode: 'add' })}
        />
      </Stack>
      <Sheet
        visible={target != null}
        title={target?.mode === 'done' ? p.trackedDoneTitle(target.title) : p.trackedSheetTitle}
        onClose={() => setTarget(null)}
        testID="tracked-sheet"
      >
        {target ? (
          <TrackedForm
            key={target.mode === 'done' ? target.title : 'add'}
            vehicleId={vehicleId}
            target={target}
            odometerKm={odometerKm}
            onDone={() => setTarget(null)}
          />
        ) : null}
      </Sheet>
    </Card>
  );
}

function TrackedForm({
  vehicleId,
  target,
  odometerKm,
  onDone,
}: {
  vehicleId: string;
  target: Target;
  odometerKm: number;
  onDone: () => void;
}) {
  const { addTrackedItem, recordItemDone, today } = useAppData();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [km, setKm] = useState(odometerKm ? String(odometerKm) : '');
  const [touched, setTouched] = useState(false);
  const adding = target.mode === 'add';
  const parsed = parseUserDate(date);
  const kmClean = km.replace(/[,\s]/g, '');
  // Adding: the date is optional (unknown until set); with a date, the km is required.
  const dateGiven = date.trim() !== '';
  const errors = {
    title: adding && !title.trim(),
    date: (!adding || dateGiven) && (!parsed || parsed > today()),
    km: (!adding || dateGiven) && !/^\d+$/.test(kmClean),
  };
  const save = () => {
    setTouched(true);
    if (errors.title || errors.date || errors.km) return;
    const done = !adding || dateGiven ? { date: parsed as string, km: Number(kmClean) } : null;
    if (adding) addTrackedItem(vehicleId, title, done);
    else recordItemDone(vehicleId, target.title, done!.date, done!.km);
    onDone();
  };
  return (
    <Stack gap={spacing.md}>
      {adding ? (
        <TextField
          testID="tracked-title"
          label={p.trackedName}
          value={title}
          onChangeText={setTitle}
          hint={p.trackedNameHint}
          maxLength={80}
          error={touched && errors.title ? he.common.required : undefined}
        />
      ) : null}
      <TextField
        testID="tracked-date"
        label={p.trackedDate}
        value={date}
        onChangeText={setDate}
        placeholder={he.vehicleDates.datePlaceholder}
        keyboardType="numbers-and-punctuation"
        hint={he.vehicleDates.dateHint}
        error={touched && errors.date ? he.vehicleDates.dateError : undefined}
      />
      <TextField
        testID="tracked-km"
        label={p.trackedKm}
        value={km}
        onChangeText={setKm}
        keyboardType="number-pad"
        suffix={he.common.km}
        maxLength={7}
        error={touched && errors.km ? p.odometerError : undefined}
      />
      <AppText variant="caption" color="textSecondary">
        {p.trackedNote}
      </AppText>
      <Button testID="tracked-save" label={p.trackedSave} icon="check" fullWidth onPress={save} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xxs,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
});
