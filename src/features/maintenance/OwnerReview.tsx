import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useAppData } from '@/features/data/DataContext';
import type { OwnerProposalVM } from '@/features/data/types';
import { formatKm } from '@/features/vehicles/format';
import { he } from '@/i18n/he';
import { AppText, Badge, Button, Card, InlineNotice, spacing, Stack } from '@/ui';

/**
 * Owner review of items read from the owner's own uploaded document (spec Part A, D-A3). Each
 * item shows the document's own words and page; only an item the owner accepts becomes a
 * requirement ("vehicle document", page cited). Nothing is shared off the device.
 */

const HEBREW = /[֐-׿]/;
const LRM = '‎';
/** Latin excerpts keep their reading order inside the RTL layout. */
const bidi = (t: string) => (HEBREW.test(t) ? t : `${LRM}${t}${LRM}`);

export function proposalInterval(p: OwnerProposalVM): string {
  const r = he.maintenancePlan.ownerReview;
  const km = p.intervalKm != null ? formatKm(p.intervalKm) : null;
  if (km && p.intervalMonths != null) {
    return p.rule === 'WHICHEVER_COMES_FIRST'
      ? r.kmOrMonths(km, p.intervalMonths)
      : r.kmAndMonths(km, p.intervalMonths);
  }
  return km ? r.everyKm(km) : r.everyMonths(p.intervalMonths ?? 0);
}

/** Plan card: how many items wait for the owner, and the way to review them. */
export function OwnerReviewCard({ proposals }: { proposals: OwnerProposalVM[] }) {
  const router = useRouter();
  const r = he.maintenancePlan.ownerReview;
  if (proposals.length === 0) return null;
  const pending = proposals.filter((p) => p.decision === null).length;
  return (
    <Card testID="plan-owner-review" compact>
      <Stack gap={spacing.sm}>
        <InlineNotice
          tone={pending ? 'warning' : 'info'}
          title={r.cardTitle}
          message={pending ? r.cardPending(pending) : r.cardDone}
        />
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

function ProposalCard({ proposal, vehicleId }: { proposal: OwnerProposalVM; vehicleId: string }) {
  const { reviewOwnerDocumentItem } = useAppData();
  const r = he.maintenancePlan.ownerReview;
  const p = he.maintenancePlan;
  const decide = (d: 'accepted' | 'rejected') =>
    reviewOwnerDocumentItem(vehicleId, proposal.key, d);
  return (
    <Card testID={`owner-proposal-${proposal.task}`}>
      <Stack gap={spacing.sm}>
        <View style={styles.head}>
          <AppText variant="bodyStrong" style={styles.flex}>
            {`${p.tasks[proposal.task]} · ${p.actions[proposal.action]}`}
          </AppText>
          {proposal.decision ? (
            <Badge
              testID={`owner-proposal-${proposal.task}-decision`}
              tone={proposal.decision === 'accepted' ? 'success' : 'neutral'}
              label={proposal.decision === 'accepted' ? r.accepted : r.rejected}
            />
          ) : null}
        </View>
        <AppText variant="body" testID={`owner-proposal-${proposal.task}-interval`}>
          {proposalInterval(proposal)}
          {proposal.condition === 'severe' ? ` · ${r.severe}` : ''}
        </AppText>
        <AppText variant="small" color="textSecondary">
          {`“${bidi(proposal.excerpt)}”`}
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
        <View style={styles.actions}>
          <Button
            testID={`owner-proposal-${proposal.task}-accept`}
            label={r.accept}
            icon="check"
            variant={proposal.decision === 'accepted' ? 'primary' : 'secondary'}
            onPress={() => decide('accepted')}
          />
          <Button
            testID={`owner-proposal-${proposal.task}-reject`}
            label={r.reject}
            icon="close"
            variant={proposal.decision === 'rejected' ? 'primary' : 'ghost'}
            onPress={() => decide('rejected')}
          />
        </View>
      </Stack>
    </Card>
  );
}

/** The review list (screen body). */
export function OwnerReviewList({
  proposals,
  vehicleId,
}: {
  proposals: OwnerProposalVM[];
  vehicleId: string;
}) {
  const r = he.maintenancePlan.ownerReview;
  return (
    <Stack gap={spacing.md} testID="owner-review-list">
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
  actions: { flexDirection: 'row', gap: spacing.sm },
});
