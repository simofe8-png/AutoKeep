import type { RegistrationNumber } from '@/domain';

import { DataGovIlRegistry, PACKAGES } from '../dataGovIl';

/**
 * OPT-IN live check against the real, free, public data.gov.il API (`npm run test:live`).
 * No plate is hard-coded: one is taken from the public dataset itself, then looked up exactly.
 */
describe('data.gov.il live', () => {
  it('resolves current resources and finds a vehicle by exact plate', async () => {
    const registry = new DataGovIlRegistry({ timeoutMs: 20_000 });
    const resources = await registry.resources(PACKAGES.twoWheelers);
    expect(resources.length).toBeGreaterThan(0);
    const sample = (await (
      await fetch(
        `https://data.gov.il/api/3/action/datastore_search?resource_id=${resources[0]}&limit=1`,
      )
    ).json()) as { result: { records: { mispar_rechev: number }[] } };
    const plate = String(sample.result.records[0].mispar_rechev) as RegistrationNumber;
    const r = await registry.lookup(plate, { consent: true });
    expect(r.status).toBe('found');
    if (r.status === 'found') {
      expect(r.candidates[0].manufacturer.length).toBeGreaterThan(0);
      expect(r.candidates[0].year).toBeGreaterThan(1950);
    }
  }, 60_000);
});
