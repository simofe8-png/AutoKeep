import type { TableAction } from '@/domain';
import type { ActionType, ServiceActionVM } from '@/features/data/types';
import { he } from '@/i18n/he';

/**
 * One performed item of a table service as a history action: "שמן מנוע — החלף". Checked =
 * performed (invariant 10); the action type is separate (replacement / inspection / other).
 */
export function tableAction(title: string, actions: readonly TableAction[]): ServiceActionVM {
  const actionType: ActionType = actions.includes('replace')
    ? 'replacement'
    : actions.every((a) => a === 'check')
      ? 'inspection'
      : 'other';
  return {
    id: '',
    title: `${title} — ${actions.map((a) => he.serviceTable.actions[a]).join(' / ')}`,
    actionType,
    performed: true,
    unlisted: false,
  };
}
