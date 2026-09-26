import type { ServiceDraft as DomainDraft } from '@/domain';

import type { ServiceDraft } from './draft';

/**
 * Merges an invoice extraction (domain draft from the M11 pipeline) into the UI draft. Extracted
 * lines become unlisted actions for the user to confirm; uncertain values are marked for review.
 * Nothing here touches history — only the explicit confirmation does (invariants 7/8).
 */
export function mergeInvoiceDraft(
  ui: ServiceDraft,
  x: DomainDraft,
  uncertain: readonly string[],
  flagged: boolean,
): ServiceDraft {
  const lineIds = x.actions.map((_, i) => `draft-x-${i}`);
  const marks: ServiceDraft['uncertain'] = [];
  const mark = (f: string) => {
    if (f === 'date' || f === 'odometer' || f === 'garage') marks.push(f);
    const m = /^line:(\d+)$/.exec(f);
    if (m) marks.push(`action:${lineIds[Number(m[1])]}`);
  };
  uncertain.forEach(mark);
  // A flagged document: every extracted value needs the user's attention.
  if (flagged)
    ['date', 'odometer', 'garage', ...x.actions.map((_, i) => `line:${i}`)].forEach(mark);
  return {
    ...ui,
    origin: 'document',
    date: x.date || ui.date,
    odometer: x.odometerKm != null ? String(x.odometerKm) : ui.odometer,
    garage: x.garageName || ui.garage,
    actions: [
      ...ui.actions,
      ...x.actions.map((a, i) => ({
        id: lineIds[i],
        title: a.title,
        actionType: a.actionType,
        performed: a.performed,
        unlisted: true,
      })),
    ],
    uncertain: [...new Set(marks)],
    readingNote: flagged ? 'flagged' : undefined,
  };
}
