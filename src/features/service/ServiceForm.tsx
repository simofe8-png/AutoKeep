import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { newLocalId } from '@/features/data/PrototypeDataContext';
import type { ActionType, ServiceActionVM } from '@/features/data/types';
import { he } from '@/i18n/he';
import {
  AppText,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  InlineNotice,
  Row,
  SegmentedControl,
  spacing,
  Stack,
  TextField,
} from '@/ui';

import { unlistedAction, type DraftErrors, type ServiceDraft } from './draft';

const actionTypeOptions: { value: ActionType; label: string }[] = [
  { value: 'inspection', label: he.actionType.inspection },
  { value: 'replacement', label: he.actionType.replacement },
  { value: 'other', label: he.actionType.other },
];

export interface ServiceFormProps {
  draft: ServiceDraft;
  onChange: (patch: Partial<ServiceDraft>) => void;
  errors: DraftErrors;
  showErrors: boolean;
}

/**
 * Service record form. Checkbox = performed; action type is a separate selector (invariant 10).
 * Uncertain extracted values are flagged for the user to check.
 */
export function ServiceForm({ draft, onChange, errors, showErrors }: ServiceFormProps) {
  const [newAction, setNewAction] = useState('');
  const uncertain = (key: string) => (draft.uncertain as string[]).includes(key);

  const setAction = (id: string, patch: Partial<ServiceActionVM>) =>
    onChange({ actions: draft.actions.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  return (
    <Stack>
      <TextField
        testID="service-date"
        label={he.service.date}
        value={draft.date}
        onChangeText={(date) => onChange({ date })}
        hint={uncertain('date') ? he.service.uncertainField : he.service.dateHint}
        error={showErrors && errors.date ? he.service.errors.date : undefined}
        required
        maxLength={10}
      />
      <TextField
        testID="service-odometer"
        label={he.service.odometer}
        value={draft.odometer}
        onChangeText={(odometer) =>
          onChange({ odometer, uncertain: draft.uncertain.filter((u) => u !== 'odometer') })
        }
        keyboardType="number-pad"
        suffix={he.common.km}
        hint={uncertain('odometer') ? he.service.uncertainField : undefined}
        error={showErrors && errors.odometer ? he.service.errors.odometer : undefined}
        required
        maxLength={9}
      />
      {uncertain('odometer') ? (
        <Badge
          label={he.service.uncertainField}
          tone="warning"
          icon="alert-outline"
          testID="uncertain-odometer"
        />
      ) : null}

      <Card>
        <Stack gap={spacing.sm}>
          <AppText variant="heading" accessibilityRole="header">
            {he.service.actionsTitle}
          </AppText>
          <AppText variant="small" color="textMuted">
            {he.service.actionsHint}
          </AppText>
          {showErrors && errors.actions ? (
            <InlineNotice tone="danger" message={he.service.errors.actions} />
          ) : null}
          {draft.actions.map((a, i) => (
            <View key={a.id}>
              {i > 0 ? <Divider /> : null}
              <Checkbox
                testID={`action-${a.id}`}
                checked={a.performed}
                onChange={(performed) => setAction(a.id, { performed })}
                label={a.title}
                description={a.unlisted ? he.service.unlisted : undefined}
              >
                {a.performed ? (
                  <Stack gap={spacing.xs}>
                    <SegmentedControl
                      testID={`action-type-${a.id}`}
                      accessibilityLabel={`${he.maintenance.actionType}: ${a.title}`}
                      options={actionTypeOptions}
                      value={a.actionType}
                      onChange={(actionType) => setAction(a.id, { actionType })}
                    />
                    {uncertain(`action:${a.id}`) ? (
                      <Badge
                        label={he.service.uncertainField}
                        tone="warning"
                        icon="alert-outline"
                      />
                    ) : null}
                  </Stack>
                ) : null}
              </Checkbox>
            </View>
          ))}
          <Divider />
          <Row gap={spacing.sm} style={styles.addRow}>
            <View style={styles.flex}>
              <TextField
                testID="new-action-input"
                label={he.service.newActionLabel}
                value={newAction}
                onChangeText={setNewAction}
                required
              />
            </View>
            <Button
              testID="add-action"
              label={he.service.addAction}
              icon="plus"
              variant="secondary"
              disabled={newAction.trim() === ''}
              onPress={() => {
                onChange({
                  actions: [
                    ...draft.actions,
                    unlistedAction(newLocalId('action'), newAction.trim()),
                  ],
                });
                setNewAction('');
              }}
            />
          </Row>
        </Stack>
      </Card>

      <TextField
        testID="service-garage"
        label={he.service.garage}
        value={draft.garage}
        onChangeText={(garage) => onChange({ garage })}
      />
      <TextField
        testID="service-notes"
        label={he.service.notes}
        value={draft.notes}
        onChangeText={(notes) => onChange({ notes })}
        multiline
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 180 },
  addRow: { flexWrap: 'wrap', alignItems: 'flex-end' },
});
