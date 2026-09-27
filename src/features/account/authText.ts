import type { AccountResult } from '@/features/data/DataContext';
import { he } from '@/i18n/he';

/** User-facing Hebrew text of an authentication failure. */
export const authErrorText = (r: Exclude<AccountResult, { ok: true }>): string =>
  he.account.authErrors[r.reason];
