import type { DocumentKind } from '@/features/data/types';
import type { IconName } from '@/ui';

export const documentIcon: Record<DocumentKind, IconName> = {
  owners_manual: 'book-open-page-variant-outline',
  maintenance_schedule: 'calendar-check-outline',
  invoice: 'receipt',
  registration: 'card-account-details-outline',
  other: 'file-outline',
};
