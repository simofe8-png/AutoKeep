import { getSupabase } from '@/cloud/client';
import { HybridDiscoveryProvider, KnownSourceProvider } from '@/discovery/hybrid';
import { OfficialSiteDiscoveryProvider } from '@/discovery/officialSiteDiscovery';
import {
  KNOWN_OFFICIAL_SOURCES,
  MANUFACTURER_ALIASES,
  OFFICIAL_DOMAINS,
} from '@/discovery/registry';
import type { IdGenerator } from '@/domain';
import { supabaseAccountBackend, type AccountBackend } from '@/features/account/backend';
import { httpRetriever } from '@/features/sources/httpRetriever';
import type { SourceServices } from '@/features/sources/sourceService';
import type { OnboardingServices } from '@/features/onboarding/services';
import type { SqlDatabase } from '@/persistence';
import { openExpoDatabase } from '@/persistence/db/expoDatabase';
import { uuidIds } from '@/persistence/ids';
import { expoAcquisition } from '@/providers/acquisition/expoAcquisition';
import { createExpoNotifications } from '@/providers/notifications/expoNotifications';
import type { NotificationScheduler } from '@/providers/notifications/types';
import { expoExporter } from '@/providers/export/expoExporter';
import { netInfoNetwork } from '@/providers/network/netInfoNetwork';
import type { NetworkMonitor } from '@/providers/network/types';
import type { DocumentExporter } from '@/providers/export/types';
import { DataGovIlRegistry } from '@/providers/registry/dataGovIl';
import { enableSyntheticMaintenance } from '@/features/maintenance/knowledge/syntheticDemo';
import { localLicenseOcr } from '@/providers/ocr/localLicenseOcr';
import { SupabaseReferenceCatalog } from '@/providers/referenceImages/supabaseCatalog';
import type { ReferenceImageCatalog } from '@/providers/referenceImages/types';
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
      /** Cloud account/backup (null when this build has no cloud configuration). */
      account?: AccountBackend | null;
      /** Dossier export (PDF + share sheet). */
      exporter?: DocumentExporter | null;
      /** Connectivity (absent: assumed online). */
      network?: NetworkMonitor | null;
      /** Official-source discovery + schedule reading (absent: none configured). */
      sources?: Omit<SourceServices, 'uriFor'> | null;
      /** Approved vehicle model reference images (absent/null: no image search in this build). */
      referenceImages?: ReferenceImageCatalog | null;
    };

const openDefault = () => openExpoDatabase();

/** HTTPS GET of a small text resource (robots.txt / sitemaps) with a hard timeout and size cap. */
async function boundedText(url: string): Promise<{ ok: boolean; text: string }> {
  if (!url.startsWith('https://')) return { ok: false, text: '' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const r = await fetch(url, { signal: controller.signal });
    const text = r.ok ? (await r.text()).slice(0, 5_000_000) : '';
    return { ok: r.ok, text };
  } catch {
    return { ok: false, text: '' };
  } finally {
    clearTimeout(timer);
  }
}

function referenceCatalog(): ReferenceImageCatalog | null {
  const sb = getSupabase();
  return sb ? new SupabaseReferenceCatalog(sb) : null;
}

function accountBackend(): AccountBackend | null {
  const sb = getSupabase();
  return sb ? supabaseAccountBackend(sb) : null;
}

const production: DataSourceConfig = {
  kind: 'local',
  openDatabase: openDefault,
  ids: uuidIds,
  clock: systemClock,
  files: expoFileStore,
  notifications: createExpoNotifications(),
  account: accountBackend(),
  exporter: expoExporter,
  network: netInfoNetwork,
  sources: {
    // ADR-0016 hybrid discovery, zero-cost (G3): verified known sources first; otherwise crawl the
    // verified official domains' robots/sitemaps (no paid search API). Reading the found manual
    // needs an OCR/AI provider, which V1 does not buy — so without a curated schedule the honest
    // outcome is "unable to verify".
    discovery: new HybridDiscoveryProvider(
      new KnownSourceProvider(KNOWN_OFFICIAL_SOURCES, MANUFACTURER_ALIASES),
      new OfficialSiteDiscoveryProvider(OFFICIAL_DOMAINS, MANUFACTURER_ALIASES, boundedText),
    ),
    retriever: httpRetriever(expoFileStore),
    registry: OFFICIAL_DOMAINS,
    aliases: MANUFACTURER_ALIASES,
    reader: null,
    curated: KNOWN_OFFICIAL_SOURCES,
  },
  referenceImages: referenceCatalog(),
  services: {
    acquisition: expoAcquisition,
    // G1: no OCR/AI runtime provider is approved yet — scans are not read automatically.
    extractor: null,
    registry: new DataGovIlRegistry(),
    // License OCR is DEFERRED (2026-09-29): null outside an EXPO_PUBLIC_OCR_POC=1 measurement
    // build, so the license scan is not offered and onboarding uses the plate → data.gov.il path.
    licenseOcr: localLicenseOcr(),
    // G1: no OCR/AI runtime provider is approved yet — invoices are not read automatically.
    invoiceReader: null,
  },
};

// Device-acceptance test data only (dev bundle flag); never set in normal builds.
enableSyntheticMaintenance(process.env.EXPO_PUBLIC_SYNTHETIC_MAINTENANCE === '1');

let override: DataSourceConfig | null = null;

/** Test/dev hook: select a data source (null restores the default). */
export function configureDataSource(config: DataSourceConfig | null): void {
  override = config;
}

/** The document exporter, or null (demo mode / not configured). */
export function documentExporter(): DocumentExporter | null {
  const s = currentDataSource();
  return s.kind === 'local' ? (s.exporter ?? null) : null;
}

/** The local-notification scheduler, or null (demo mode / not configured). */
export function notificationScheduler(): NotificationScheduler | null {
  const s = currentDataSource();
  return s.kind === 'local' ? (s.notifications ?? null) : null;
}

/** The clock the store stamps data with; "now" everywhere else must agree with it. */
export function dataClock(): Clock {
  const s = currentDataSource();
  return s.kind === 'local' ? s.clock : systemClock;
}

/** The approved reference-image catalog, or null (demo mode / no backend in this build). */
export function referenceImageCatalog(): ReferenceImageCatalog | null {
  const s = currentDataSource();
  return s.kind === 'local' ? (s.referenceImages ?? null) : null;
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
