import { asId, type ServiceDraft as DomainDraft } from '@/domain';

import type { ServiceDraft } from '../draft';
import { mergeInvoiceDraft } from '../invoiceDraft';

const ui: ServiceDraft = {
  vehicleId: 'v1',
  origin: 'document',
  date: '2026-09-26',
  odometer: '84000',
  garage: '',
  notes: '',
  actions: [
    {
      id: 'draft-oil',
      title: 'שמן מנוע',
      actionType: 'replacement',
      performed: false,
      maintenanceItemId: 'oil',
      unlisted: false,
    },
  ],
  uncertain: [],
};

const x: DomainDraft = {
  vehicleId: asId<'Vehicle'>('00000000-0000-4000-8000-0000000000aa'),
  origin: 'document',
  date: '2026-09-18',
  odometerKm: 84190,
  garageName: 'מוסך',
  notes: '',
  actions: [
    {
      title: 'החלפת נורה',
      actionType: 'replacement',
      performed: true,
      maintenanceItemId: null,
      unlisted: true,
    },
  ],
  documentIds: [],
  extractionId: null,
};

describe('invoice extraction → editable draft (T115)', () => {
  it('prefills values, adds lines as unlisted actions and keeps manufacturer items unchecked', () => {
    const d = mergeInvoiceDraft(ui, x, ['odometer', 'line:0'], false);
    expect(d).toMatchObject({ date: '2026-09-18', odometer: '84190', garage: 'מוסך' });
    expect(d.actions[0]).toMatchObject({ id: 'draft-oil', performed: false });
    expect(d.actions[1]).toMatchObject({ title: 'החלפת נורה', unlisted: true, performed: true });
    expect(d.uncertain).toEqual(['odometer', `action:${d.actions[1].id}`]);
    expect(d.readingNote).toBeUndefined();
  });

  it('a flagged document marks every extracted value for review', () => {
    const d = mergeInvoiceDraft(ui, x, [], true);
    expect(d.readingNote).toBe('flagged');
    expect(d.uncertain).toEqual(
      expect.arrayContaining(['date', 'odometer', 'garage', `action:${d.actions[1].id}`]),
    );
  });

  it('missing extracted values keep what the user already had', () => {
    const d = mergeInvoiceDraft(
      ui,
      { ...x, date: '', odometerKm: null, garageName: '' },
      [],
      false,
    );
    expect(d).toMatchObject({ date: '2026-09-26', odometer: '84000', garage: '' });
  });
});
