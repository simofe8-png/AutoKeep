/**
 * MOCK DATA — UI prototype only. Simulated invoice extraction output used to exercise the
 * draft-review UI (uncertain fields, unlisted actions). Real OCR/AI extraction is M11 and is
 * draft-only by design.
 */
import type { ServiceDraft } from '@/features/service/draft';

export function mockExtractedDraft(base: ServiceDraft): ServiceDraft {
  const actions = base.actions.map((a, i) => (i < 2 ? { ...a, performed: true } : a));
  return {
    ...base,
    origin: 'document',
    date: '2026-09-18',
    odometer: '84,190',
    garage: 'מוסך הדגמה',
    notes: '',
    documentTitle: 'חשבונית — מסמך הדגמה',
    actions: [
      ...actions,
      {
        id: 'draft-extracted-bulb',
        title: 'החלפת נורת בלם',
        actionType: 'replacement',
        performed: true,
        unlisted: true,
      },
    ],
    uncertain: ['odometer', 'action:draft-extracted-bulb'],
  };
}
