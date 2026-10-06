import * as Updates from 'expo-updates';

import { formatDate } from '@/features/vehicles/format';
import { he } from '@/i18n/he';

/**
 * Which code the app runs (owner decision 2026-10-06: staging OTA updates): the channel and the
 * update id / date, so the owner can see on the phone that the newest update arrived.
 */
export function runningVersion(): string {
  const t = he.settings.update;
  if (!Updates.isEnabled) return t.dev;
  const parts = [Updates.channel ? t.channel(Updates.channel) : null];
  if (Updates.isEmbeddedLaunch || !Updates.updateId) parts.push(t.embedded);
  else {
    parts.push(t.id(Updates.updateId.slice(0, 8)));
    if (Updates.createdAt && !Number.isNaN(Updates.createdAt.getTime()))
      parts.push(formatDate(Updates.createdAt.toISOString().slice(0, 10)));
  }
  return parts.filter(Boolean).join(' · ');
}

export type UpdateCheck = 'none' | 'reloading' | 'unavailable' | 'failed';

/** Checks the channel now; a newer update is downloaded and the app restarts into it. */
export async function checkForUpdateNow(): Promise<UpdateCheck> {
  if (!Updates.isEnabled) return 'unavailable';
  try {
    const r = await Updates.checkForUpdateAsync();
    if (!r.isAvailable) return 'none';
    await Updates.fetchUpdateAsync();
    await Updates.reloadAsync();
    return 'reloading';
  } catch {
    return 'failed';
  }
}
