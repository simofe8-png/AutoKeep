import type { VehicleType } from '@/domain';

import type { ManufacturerAliases } from '../authority';
import { hostOf } from './access';
import { currentPolicy } from './registry/policy';
import type { SourceSystem } from './registry/sourceSystem';
import { candidateSystems } from './registry/universe';

/**
 * Product fallback (M-SOURCE Step 15): when no schedule can be built, the user gets the PRECISE
 * reason per official source and the most direct approved official page — computed from registry
 * data only (no network), so the app never says "we could not find it" when the reason is known.
 */

export type FallbackReason =
  /** The official documents exist but sit behind a login, a form or an interactive app. */
  | 'manual_access_required'
  /** AutoKeep's access policy for the source is not yet decided (terms unclear / unreadable). */
  | 'access_policy_unresolved'
  /** The source's terms require the rights holder's permission for automated use. */
  | 'permission_required'
  /** The importer / manufacturer publishes no digital maintenance documents. */
  | 'no_digital_source'
  /** Policy permits automated reading (the server-side pipeline reads it). */
  | 'automatic';

export interface OfficialSourceStatus {
  sourceSystemId: string;
  host: string;
  /** The most direct approved official page for the user (never fetched by AutoKeep). */
  url: string | null;
  reason: FallbackReason;
  israeli: boolean;
  publishesSchedule: boolean;
}

const READ_DIMENSIONS = [
  'discoveryAllowed',
  'automatedFetchAllowed',
  'automatedExtractionAllowed',
] as const;

export function fallbackReason(s: SourceSystem): FallbackReason {
  if (s.sourceType === 'D_RESTRICTED_OR_UNAVAILABLE') {
    return s.discovery.mechanism === 'none' ? 'no_digital_source' : 'manual_access_required';
  }
  const values = READ_DIMENSIONS.map((d) => currentPolicy(s.policy).dimensions[d].value);
  if (values.every((v) => v === 'ALLOWED')) return 'automatic';
  if (values.some((v) => v === 'NOT_ALLOWED' || v === 'REQUIRES_PERMISSION')) {
    return 'permission_required';
  }
  return 'access_policy_unresolved';
}

/** Approved official systems for the make, most useful first (runtime source priority). */
export function officialSourcesFor(
  make: string,
  systems: readonly SourceSystem[],
  aliases: ManufacturerAliases,
  kind?: VehicleType,
): OfficialSourceStatus[] {
  return candidateSystems({ make, kind }, systems, aliases)
    .filter((c) => c.system.status === 'approved')
    .map(({ system: s }) => {
      const listing = s.discovery.entryPoints.find((e) => e.kind === 'listing');
      const url =
        s.officialPages?.[0] ??
        (listing && !/\{|\.(xml|gz)(\?|$)/i.test(listing.url) ? listing.url : null);
      return {
        sourceSystemId: s.sourceSystemId,
        host: (url && hostOf(url)) || s.domains[0].host,
        url,
        reason: fallbackReason(s),
        israeli: s.origin === 'israeli',
        publishesSchedule:
          s.sourceType === 'A_DIRECT_MAINTENANCE_SCHEDULE' ||
          s.documentCategories.includes('maintenance_schedule'),
      };
    });
}
