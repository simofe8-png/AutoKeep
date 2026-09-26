import type { IdGenerator } from '@/domain';
import type { OnboardingServices } from '@/features/onboarding/services';
import type { SqlDatabase } from '@/persistence';
import { openExpoDatabase } from '@/persistence/db/expoDatabase';
import { uuidIds } from '@/persistence/ids';
import { expoAcquisition } from '@/providers/acquisition/expoAcquisition';
import { createExpoNotifications } from '@/providers/notifications/expoNotifications';
import type { NotificationScheduler } from '@/providers/notifications/types';
import { DataGovIlRegistry } from '@/providers/registry/dataGovIl';
import { expoFileStore } from '@/providers/storage/expoFileStore';
import type { OriginalFileStore } from '@/providers/storage/types';

import { systemClock, type Clock } from './localStore';

/**
 * Which data source feeds the UI. Production uses the on-device SQLite store. The labeled
 * prototype data is used only when explicitly requested (EXPO_PUBLIC_DEMO_DATA=1) or by tests.
 */
export type DataSourceConfig =
  | { kind: 'demo' }
  | {
      kind: 'local';
      openDatabase: () => Promise<SqlDatabase>;
      ids: IdGenerator;
      clock: Clock;
      files: OriginalFileStore;
      services: OnboardingServices;
      /** Local notifications (optional: tests and platforms without them pass null). */
      notifications?: NotificationScheduler | null;
    };

const openDefault = () => openExpoDatabase();

const production: DataSourceConfig = {
  kind: 'local',
  openDatabase: openDefault,
  ids: uuidIds,
  clock: systemClock,
  files: expoFileStore,
  notifications: createExpoNotifications(),
  services: {
    acquisition: expoAcquisition,
    // G1: no OCR/AI runtime provider is approved yet — scans are not read automatically.
    extractor: null,
    registry: new DataGovIlRegistry(),
    // G1: no OCR/AI runtime provider is approved yet — invoices are not read automatically.
    invoiceReader: null,
  },
};

let override: DataSourceConfig | null = null;

/** Test/dev hook: select a data source (null restores the default). */
export function configureDataSource(config: DataSourceConfig | null): void {
  override = config;
}

/** The local-notification scheduler, or null (demo mode / not configured). */
export function notificationScheduler(): NotificationScheduler | null {
  const s = currentDataSource();
  return s.kind === 'local' ? (s.notifications ?? null) : null;
}

/** Onboarding runtime services, or null in demo mode (which uses scripted scenarios). */
export function onboardingServices(): OnboardingServices | null {
  const s = currentDataSource();
  return s.kind === 'local' ? s.services : null;
}

export function currentDataSource(): DataSourceConfig {
  if (override) return override;
  return process.env.EXPO_PUBLIC_DEMO_DATA === '1' ? { kind: 'demo' } : production;
}
