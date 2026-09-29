import {
  isoDate,
  type IsoDate,
  type MaintenanceRequirement,
  type RequirementApplicability,
} from '@/domain';

/**
 * REAL maintenance sources found for the acceptance vehicles (Task 7, 2026-09-29), recorded with
 * their exact location and access status. Structured facts only — no manual text is stored
 * (the SEAT manual forbids copying without written permission).
 *
 * None of these claims is VERIFIED: they were located by an automated (AI) research step and no
 * human curator has reviewed them yet (V1 quality gate). They therefore never produce a schedule
 * on their own; they document what exists and what is still missing.
 */
export interface KnownSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
  retrievedOn: IsoDate;
  /** sha256 of the retrieved bytes, when the document itself was retrieved. */
  sha256?: string;
  access: 'public' | 'restricted_sign_in' | 'paper_only';
  /** Vehicles the source itself states it covers. */
  coverage: RequirementApplicability;
  /** What the source establishes, at an exact location (paraphrased, never copied). */
  findings: { locator: string; finding: string }[];
  /** Requirements stated by the source (candidates until a curator reviews them). */
  claims: MaintenanceRequirement[];
}

const RESEARCHED = isoDate('2026-09-29');

export const KNOWN_SOURCES: readonly KnownSource[] = [
  {
    id: 'seat-ibiza-my12-owners-manual-uk',
    title: "SEAT Ibiza owner's manual (UK English, 6J4012003DC, reprint 15.12.11)",
    publisher: 'SEAT S.A.',
    url: 'https://www.seat.com/datamanual-manual/ibiza/my12_w45/en-uk/Ibiza_EN.pdf',
    retrievedOn: RESEARCHED,
    sha256: '05e3aef11f15c91099e443f4dd3736201a49dc0cad5a9e0f817a52f4cc2f7fa1',
    access: 'public',
    coverage: {
      makes: ['SEAT'],
      models: ['Ibiza'],
      modelYears: { from: 2012, to: 2012 },
      markets: ['UK'],
    },
    findings: [
      {
        locator: 'PDF p.199 (printed p.197), "Service intervals"',
        finding:
          'The service regime is set per vehicle by the PR code on the back of the Maintenance Programme booklet: QG1 = flexible LongLife; QG0/QG2 = fixed, 1 year / 15,000 km, whichever first.',
      },
      {
        locator: 'PDF p.209 (printed p.207), "Changing the brake fluid"',
        finding:
          'Brake-fluid change intervals are given only in the Maintenance Programme booklet.',
      },
      {
        locator: 'PDF p.202, "Changing engine oil"',
        finding: 'Oil change intervals are given in the Maintenance Programme booklet.',
      },
      {
        locator: 'PDF p.249, "Vehicle data"',
        finding:
          'The vehicle data sticker (spare-wheel well, and rear cover of the Maintenance Programme) lists the vehicle codes.',
      },
    ],
    claims: [
      {
        id: 'seat-ibiza-my12-uk-fixed-service',
        task: 'periodic_service',
        taskText: 'Fixed service interval (QG0 / QG2)',
        action: 'other',
        interval: {
          every: { value: 15000, unit: 'km' },
          everyMonths: 12,
          rule: 'whichever_first',
          repeats: true,
        },
        applicability: {
          makes: ['SEAT'],
          models: ['Ibiza'],
          modelYears: { from: 2012, to: 2012 },
          markets: ['UK'],
          serviceRegimes: ['QG0', 'QG2'],
        },
        authority: 'manufacturer',
        evidence: [
          {
            documentId: 'seat-ibiza-my12-owners-manual-uk',
            documentTitle: "SEAT Ibiza owner's manual (UK English)",
            authority: 'manufacturer',
            markets: ['UK'],
            edition: '6J4012003DC, reprint 15.12.11',
            page: 199,
            section: 'Service intervals',
            locator: 'printed page 197',
            documentSha256: '05e3aef11f15c91099e443f4dd3736201a49dc0cad5a9e0f817a52f4cc2f7fa1',
          },
        ],
        verification: 'candidate',
        extraction: { method: 'ai_candidate', by: 'automated research (Claude)', at: RESEARCHED },
      },
    ],
  },
  {
    id: 'ford-il-service-plan-page',
    title: 'Ford Israel (Delek Motors) — service plan page ("תוכנית טיפול")',
    publisher: 'Delek Motors (Ford importer, Israel)',
    url: 'https://www.ford.co.il/תוכנית-טיפול/שירות',
    retrievedOn: RESEARCHED,
    access: 'public',
    coverage: { makes: ['Ford'], markets: ['IL'] },
    findings: [
      {
        locator: 'section "תוכנית טיפול", page note "correct as of 24/11/2024"',
        finding:
          'Service is due at the earliest of: a dashboard service alert, 15,000 km, or one year since the previous service. Per-model plans are offered by model and first-registration year.',
      },
      {
        locator: 'model selector → "Fiesta" → "from model 2008" (Ford_Fiesta_2008_2018.pdf)',
        finding:
          'An importer plan for the Fiesta from model 2008 exists, but its link requires a Delek Motors sign-in; its content could not be read.',
      },
    ],
    claims: [
      {
        id: 'ford-il-periodic-service',
        task: 'periodic_service',
        taskText: 'Periodic service (importer service plan)',
        action: 'other',
        interval: {
          every: { value: 15000, unit: 'km' },
          everyMonths: 12,
          rule: 'whichever_first',
          repeats: true,
        },
        applicability: { makes: ['Ford'], markets: ['IL'] },
        authority: 'importer',
        evidence: [
          {
            documentId: 'ford-il-service-plan-page',
            documentTitle: 'ford.co.il — תוכנית טיפול',
            authority: 'importer',
            markets: ['IL'],
            publishedOn: isoDate('2024-11-24'),
            section: 'תוכנית טיפול',
          },
        ],
        verification: 'candidate',
        extraction: { method: 'ai_candidate', by: 'automated research (Claude)', at: RESEARCHED },
      },
    ],
  },
];

/** All requirement claims from known sources (candidates unless curator-verified). */
export function knownRequirements(): MaintenanceRequirement[] {
  return KNOWN_SOURCES.flatMap((s) => s.claims);
}
