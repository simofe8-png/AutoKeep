import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { UploadIssue } from '@/discovery/maintenance/msource/ownerReview';
import { useAppData } from '@/features/data/DataContext';
import type { OwnerProposalVM } from '@/features/data/types';
import {
  validateOwnerEdit,
  type OwnerEditErrors,
} from '@/features/maintenance/msource/ownerReview';
import { formatKm } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { AppText, Badge, Button, Card, InlineNotice, spacing, Stack, TextField } from '@/ui';

/**
 * Owner review of items read from the owner's own uploaded document (spec Part A, D-A3). Each
 * item shows the document's own words and page; only an item the owner accepts becomes a
 * requirement ("vehicle document", page cited). The owner may correct an item before accepting
 * it — then it is labelled as edited by the owner, the document's reading kept beside it.
 * Unreadable (scanned) uploads are said so, never silent. Nothing is shared off the device.
 */

const HEBREW = /[֐-׿]/;
const LRM = '‎';
/** Latin excerpts keep their reading order inside the RTL layout. */
const bidi = (t: string) => (HEBREW.test(t) ? t : `${LRM}${t}${LRM}`);

function intervalText(km: number | null, months: number | null, whicheverFirst: boolean): string {
  const r = he.maintenancePlan.ownerReview;
  const k = km != null ? formatKm(km) : null;
  if (k && months != null)
    return whicheverFirst ? r.kmOrMonths(k, months) : r.kmAndMonths(k, months);
  return k ? r.everyKm(k) : r.everyMonths(months ?? 0);
}

/** The interval as it will be scheduled: the owner's correction when there is one. */
export function proposalInterval(p: OwnerProposalVM): string {
  return p.edit
    ? intervalText(p.edit.intervalKm, p.edit.intervalMonths, true)
    : intervalText(p.intervalKm, p.intervalMonths, p.rule === 'WHICHEVER_COMES_FIRST');
}

/** Plan card: items waiting for the owner, unreadable uploads, and the way to review them. */
export function OwnerReviewCard({
  proposals,
  issues = [],
}: {
  proposals: OwnerProposalVM[];
  issues?: UploadIssue[];
}) {
  const router = useRouter();
  const r = he.maintenancePlan.ownerReview;
  if (proposals.length === 0 && issues.length === 0) return null;
  const pending = proposals.filter((p) => p.decision === null).length;
  return (
    <Card testID="plan-owner-review" compact>
      <Stack gap={spacing.sm}>
        {proposals.length ? (
          <InlineNotice
            tone={pending ? 'warning' : 'info'}
            title={r.cardTitle}
            message={pending ? r.cardPending(pending) : r.cardDone}
          />
        ) : null}
        {issues.length ? (
          <InlineNotice
            testID="plan-owner-review-no-text"
            tone="warning"
            title={r.cardIssue}
            message={issues.some((x) => x.reason === 'no_text') ? r.noText : r.unreadablePhoto}
          />
        ) : null}
        <Button
          testID="plan-owner-review-open"
          label={r.open}
          icon="clipboard-check-outline"
          variant={pending ? 'primary' : 'secondary'}
          fullWidth
          onPress={() => router.push('/maintenance-review')}
        />
      </Stack>
    </Card>
  );
}

function EditForm({
  proposal,
  onSave,
  onCancel,
}: {
  proposal: OwnerProposalVM;
  onSave: (edit: NonNullable<OwnerProposalVM['edit']>) => void;
  onCancel: () => void;
}) {
  const r = he.maintenancePlan.ownerReview;
  const current = proposal.edit ?? {
    intervalKm: proposal.intervalKm,
    intervalMonths: proposal.intervalMonths,
    text: proposal.excerpt,
  };
  const [km, setKm] = useState(current.intervalKm != null ? String(current.intervalKm) : '');
  const [months, setMonths] = useState(
    current.intervalMonths != null ? String(current.intervalMonths) : '',
  );
  const [text, setText] = useState(current.text);
  const [errors, setErrors] = useState<OwnerEditErrors>({});
  const id = `owner-proposal-${proposal.task}-edit`;
  const save = () => {
    const v = validateOwnerEdit({ km, months, text }, proposal.excerpt);
    if (!v.ok) {
      setErrors(v.errors);
      return;
    }
    onSave(v.edit);
  };
  return (
    <Stack gap={spacing.sm} testID={id}>
      <AppText variant="smallStrong">{r.editTitle}</AppText>
      <TextField
        testID={`${id}-km`}
        label={r.editKm}
        value={km}
        onChangeText={setKm}
        keyboardType="number-pad"
        maxLength={9}
        error={errors.km ? r.editErrorKm : undefined}
      />
      <TextField
        testID={`${id}-months`}
        label={r.editMonths}
        value={months}
        onChangeText={setMonths}
        keyboardType="number-pad"
        maxLength={3}
        error={errors.months ? r.editErrorMonths : undefined}
      />
      <TextField
        testID={`${id}-text`}
        label={r.editText}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={240}
        error={errors.text ? r.editErrorText : undefined}
      />
      {errors.interval ? (
        <InlineNotice testID={`${id}-error`} tone="warning" message={r.editErrorInterval} />
      ) : null}
      <View style={styles.actions}>
        <Button testID={`${id}-save`} label={r.editSave} icon="check" onPress={save} />
        <Button testID={`${id}-cancel`} label={r.editCancel} variant="ghost" onPress={onCancel} />
      </View>
    </Stack>
  );
}

function ProposalCard({ proposal, vehicleId }: { proposal: OwnerProposalVM; vehicleId: string }) {
  const { reviewOwnerDocumentItem } = useAppData();
  const [editing, setEditing] = useState(false);
  const r = he.maintenancePlan.ownerReview;
  const p = he.maintenancePlan;
  const id = `owner-proposal-${proposal.task}`;
  const decide = (d: 'accepted' | 'rejected', edit: OwnerProposalVM['edit'] = null) =>
    reviewOwnerDocumentItem(vehicleId, proposal.key, d, edit);
  return (
    <Card testID={id}>
      <Stack gap={spacing.sm}>
        <View style={styles.head}>
          <AppText variant="bodyStrong" style={styles.flex}>
            {`${p.tasks[proposal.task]} · ${p.actions[proposal.action]}`}
          </AppText>
          {proposal.edit ? <Badge testID={`${id}-edited`} tone="info" label={r.edited} /> : null}
          {proposal.decision ? (
            <Badge
              testID={`${id}-decision`}
              tone={proposal.decision === 'accepted' ? 'success' : 'neutral'}
              label={proposal.decision === 'accepted' ? r.accepted : r.rejected}
            />
          ) : null}
        </View>
        <AppText variant="body" testID={`${id}-interval`}>
          {proposalInterval(proposal)}
          {proposal.condition === 'severe' ? ` · ${r.severe}` : ''}
        </AppText>
        {proposal.edit && proposal.edit.text !== proposal.excerpt ? (
          <AppText variant="small" testID={`${id}-text`}>
            {bidi(proposal.edit.text)}
          </AppText>
        ) : null}
        <AppText variant="small" color="textSecondary">
          {proposal.edit
            ? r.originalReading(
                `${intervalText(proposal.intervalKm, proposal.intervalMonths, proposal.rule === 'WHICHEVER_COMES_FIRST')} — “${bidi(proposal.excerpt)}”`,
              )
            : `“${bidi(proposal.excerpt)}”`}
        </AppText>
        <AppText variant="caption" color="textSecondary">
          {r.page(proposal.page, proposal.documentName)}
        </AppText>
        {proposal.serviceRegimes?.length ? (
          <AppText variant="caption" color="textSecondary">
            {r.regimes(proposal.serviceRegimes.join(' / '))}
          </AppText>
        ) : null}
        <InlineNotice
          tone={proposal.fit === 'matched' ? 'info' : 'warning'}
          message={proposal.fit === 'matched' ? r.fitMatched : r.fitUnstated}
        />
        {editing ? (
          <EditForm
            proposal={proposal}
            onCancel={() => setEditing(false)}
            onSave={(edit) => {
              decide('accepted', edit);
              setEditing(false);
            }}
          />
        ) : (
          <View style={styles.actions}>
            <Button
              testID={`${id}-accept`}
              label={r.accept}
              icon="check"
              variant={proposal.decision === 'accepted' ? 'primary' : 'secondary'}
              onPress={() => decide('accepted', proposal.edit)}
            />
            <Button
              testID={`${id}-edit`}
              label={r.edit}
              icon="pencil-outline"
              variant="secondary"
              onPress={() => setEditing(true)}
            />
            <Button
              testID={`${id}-reject`}
              label={r.reject}
              icon="close"
              variant={proposal.decision === 'rejected' ? 'primary' : 'ghost'}
              onPress={() => decide('rejected')}
            />
          </View>
        )}
      </Stack>
    </Card>
  );
}

/** The review list (screen body). */
export function OwnerReviewList({
  proposals,
  issues = [],
  vehicleId,
}: {
  proposals: OwnerProposalVM[];
  issues?: UploadIssue[];
  vehicleId: string;
}) {
  const r = he.maintenancePlan.ownerReview;
  return (
    <Stack gap={spacing.md} testID="owner-review-list">
      {issues.map((issue, i) => (
        <InlineNotice
          key={`${issue.documentName}-${i}`}
          testID="owner-review-no-text"
          tone="warning"
          title={issue.documentName}
          message={issue.reason === 'no_text' ? r.noText : r.unreadablePhoto}
        />
      ))}
      <InlineNotice tone="info" message={r.intro} />
      {proposals.length === 0 ? (
        <AppText variant="body" color="textSecondary" testID="owner-review-empty">
          {r.empty}
        </AppText>
      ) : (
        proposals.map((x) => <ProposalCard key={x.key} proposal={x} vehicleId={vehicleId} />)
      )}
    </Stack>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
