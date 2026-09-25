import { addDays, dateOf, type IsoDate, type Timestamp } from '@/domain';

/**
 * Delayed account creation (T068, spec §16): registration never blocks first use. The account is
 * offered only once data worth protecting exists, framed around saving/backup, and "not now"
 * is respected for a cooling-off period.
 */
export interface OfferInputs {
  vehicleCount: number;
  serviceEventCount: number;
  documentCount: number;
  hasAccount: boolean;
  dismissedAt: Timestamp | null;
  now: Timestamp;
}

export const OFFER_SNOOZE_DAYS = 14;

export type OfferDecision =
  | { show: true }
  | { show: false; reason: 'has_account' | 'no_valuable_data' | 'snoozed'; until?: IsoDate };

export function accountOfferDecision(i: OfferInputs): OfferDecision {
  if (i.hasAccount) return { show: false, reason: 'has_account' };
  // A vehicle alone is not yet "worth protecting"; history or documents are.
  if (i.vehicleCount === 0 || i.serviceEventCount + i.documentCount === 0) {
    return { show: false, reason: 'no_valuable_data' };
  }
  if (i.dismissedAt) {
    const until = addDays(dateOf(i.dismissedAt), OFFER_SNOOZE_DAYS);
    if (dateOf(i.now) < until) return { show: false, reason: 'snoozed', until };
  }
  return { show: true };
}
