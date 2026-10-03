import { KnownCandidatesAdapter } from '@/discovery/maintenance/msource/adapters';
import { makeCandidate } from '@/discovery/maintenance/msource/candidates';
import { buildFingerprint } from '@/discovery/maintenance/msource/fingerprint';
import { scheduleToRequirements } from '@/discovery/maintenance/msource/requirements';
import { runMSource } from '@/discovery/maintenance/msource/run';
import { ALLOW_ALL, FakeWeb, fakeDeps } from '@/discovery/maintenance/msource/testing';

import { buildMaintenancePlan } from '../../knowledge/plan';

/**
 * Conditional (service-plan code) applicability through the REAL plan engine. SYNTHETIC
 * manual page with invented codes (QG7/QG8/QG9) and an invented interval.
 */
const r = buildFingerprint({
  kind: 'car',
  manufacturer: 'סיאט ספרד',
  model: 'IBIZA',
  year: 2012,
  engine: '1390 סמ״ק',
  engineCode: 'CGG',
  fuel: 'בנזין',
});
if (!r.ok) throw new Error('fixture');
const IBIZA = r.fingerprint;

const MANUAL = `<html><head><title>SEAT Ibiza owner's manual</title></head><body>
  <h2>Service intervals</h2>
  <p>If the PR code that appears on the back of the Maintenance Programme booklet is QG7, this means that your vehicle has the LongLife service programmed.</p>
  <p>If it has the codes QG8 or QG9 the interval service is dependent on time/distance travelled.</p>
  <h3>Fixed service intervals</h3>
  <p>In this case, your vehicle must be serviced after a fixed interval of 1 year / 12 345 km (whatever comes first).</p>
  </body></html>`;
const URL_ = 'https://www.seat.co.uk/datamanual-manual/ibiza/my12_w45/en-uk/manual.html';

async function seatRun(serviceRegime: string | null) {
  const web = new FakeWeb({
    'https://www.seat.co.uk/robots.txt': { contentType: 'text/plain', body: ALLOW_ALL },
    [URL_]: { body: MANUAL },
  });
  return runMSource(
    IBIZA,
    fakeDeps(
      web,
      [
        new KnownCandidatesAdapter([
          makeCandidate({
            url: URL_,
            sourceType: 'other',
            discoveredBy: 'catalog',
            discoveredAt: 't',
          })!,
        ]),
      ],
      { facts: { serviceRegime } },
    ),
  );
}

describe('conditional service-plan code through the plan engine', () => {
  it('the owner confirming the code makes it eligible immediately — no new search', async () => {
    const run = await seatRun(null);
    const reqs = scheduleToRequirements(run.schedule!, IBIZA, '2026-10-02' as never);
    expect(reqs[0].applicability.serviceRegimes).toEqual(['QG8', 'QG9']);
    const vehicle = {
      id: 'veh-ibiza',
      kind: 'car' as const,
      manufacturer: 'סיאט ספרד',
      model: 'IBIZA',
      year: 2012,
      engine: '1390 סמ״ק',
      engineCode: 'CGG',
      fuel: 'בנזין',
    };
    const plan = (serviceRegime: string | null) =>
      buildMaintenancePlan({
        vehicle,
        profile: { inServiceDate: '2012-03-01' as never, serviceRegime, usage: null },
        requirements: reqs,
        history: [],
        readings: [{ date: '2026-10-01' as never, km: 100000 }],
        today: '2026-10-02' as never,
      });
    const unknown = plan(null);
    expect(unknown.items.some((i) => i.task === 'periodic_service')).toBe(false);
    expect(unknown.requests).toContainEqual(expect.objectContaining({ kind: 'service_regime' }));
    const confirmed = plan('QG8');
    expect(confirmed.items.find((i) => i.task === 'periodic_service')).toMatchObject({
      level: 'B',
    });
    expect(plan('QG7').items.some((i) => i.task === 'periodic_service')).toBe(false);
  });
});
