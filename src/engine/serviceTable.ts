import {
  addMonths,
  daysBetween,
  serviceColumn,
  serviceKm,
  type IsoDate,
  type ServiceTable,
  type TableAction,
} from '@/domain';

/**
 * The periodic services the owner's table derives (owner decision 2026-10-06). Deterministic and
 * pure: what service n contains is the table's column for its km (service 165,000 = column "165";
 * after the last column the table starts again), and it is due at its km or `monthsStep` months
 * after the previous periodic service — whichever comes first. Without a recorded previous
 * service there is no due date (never invented). Rule rows ("החלף כל שנתיים") count from when the
 * item itself was last done; unknown stays unknown.
 */

/** A periodic service or a rule item the owner recorded as done (with or without a record). */
export interface TableDone {
  kind: 'periodic' | 'rule';
  /** periodic: the service number (km = n × kmStep). */
  serviceNo: number | null;
  /** rule: the table row. */
  rowId: string | null;
  km: number | null;
  date: IsoDate;
}

export type TableDueStatus = 'overdue' | 'soon' | 'later';

export interface TableServiceItem {
  rowId: string;
  title: string;
  group: string;
  actions: TableAction[];
}

export interface TableRuleItem {
  rowId: string;
  title: string;
  group: string;
  action: TableAction;
  dueKm: number | null;
  dueDate: IsoDate | null;
  lastDone: { km: number | null; date: IsoDate } | null;
}

export interface PeriodicService {
  /** Service number: due at n × kmStep km. */
  n: number;
  km: number;
  /** Months after the previous periodic service (null: no previous service recorded). */
  dueDate: IsoDate | null;
  remainingKm: number;
  remainingDays: number | null;
  status: TableDueStatus;
  items: TableServiceItem[];
  /** Rule items that fall due by this service. */
  rules: TableRuleItem[];
}

export interface TablePlan {
  next: PeriodicService;
  after: PeriodicService;
  lastPeriodic: { n: number; km: number | null; date: IsoDate } | null;
  /** Rule items never recorded as done: when they are due is unknown. */
  rulesUnknown: Omit<TableRuleItem, 'dueKm' | 'dueDate' | 'lastDone'>[];
}

/** Within this distance / time the service is "soon". */
export const SOON_KM = 1_500;
export const SOON_DAYS = 30;

const latest = <T extends { date: IsoDate; km: number | null }>(xs: T[]): T | null =>
  xs.reduce<T | null>(
    (best, x) =>
      !best || x.date > best.date || (x.date === best.date && (x.km ?? 0) > (best.km ?? 0))
        ? x
        : best,
    null,
  );

export function tablePlan(input: {
  table: ServiceTable;
  odometerKm: number;
  today: IsoDate;
  done: readonly TableDone[];
}): TablePlan {
  const { table, odometerKm, today, done } = input;

  const periodic = done.filter((d) => d.kind === 'periodic' && d.serviceNo != null);
  const topNo = Math.max(0, ...periodic.map((d) => d.serviceNo!));
  const last = latest(periodic.filter((d) => d.serviceNo === topNo));
  const lastPeriodic = last ? { n: topNo, km: last.km, date: last.date } : null;

  const nextNo = lastPeriodic ? lastPeriodic.n + 1 : Math.floor(odometerKm / table.kmStep) + 1;
  const nextDate = lastPeriodic ? addMonths(lastPeriodic.date, table.monthsStep) : null;
  const afterDate = nextDate ? addMonths(nextDate, table.monthsStep) : null;

  const rules: TableRuleItem[] = [];
  const rulesUnknown: TablePlan['rulesUnknown'] = [];
  for (const r of table.rows) {
    if (!r.rule || r.rule.action === 'none') continue;
    const base = { rowId: r.id, title: r.title, group: r.group, action: r.rule.action };
    const lastDone = latest(done.filter((d) => d.kind === 'rule' && d.rowId === r.id));
    if (!lastDone) {
      rulesUnknown.push(base);
      continue;
    }
    rules.push({
      ...base,
      dueKm: r.rule.everyKm != null && lastDone.km != null ? lastDone.km + r.rule.everyKm : null,
      dueDate: r.rule.everyMonths != null ? addMonths(lastDone.date, r.rule.everyMonths) : null,
      lastDone: { km: lastDone.km, date: lastDone.date },
    });
  }

  // Without a due date for the service, a rule joins it when due within one table interval.
  const horizon = (d: IsoDate | null) => d ?? addMonths(today, table.monthsStep);
  const dueBy = (rule: TableRuleItem, km: number, date: IsoDate) =>
    (rule.dueKm != null && rule.dueKm <= km) || (rule.dueDate != null && rule.dueDate <= date);

  const nextRules = rules.filter((r) => dueBy(r, serviceKm(table, nextNo), horizon(nextDate)));
  const afterRules = rules.filter(
    (r) =>
      !nextRules.includes(r) &&
      dueBy(
        r,
        serviceKm(table, nextNo + 1),
        afterDate ?? addMonths(horizon(nextDate), table.monthsStep),
      ),
  );

  const service = (n: number, dueDate: IsoDate | null, due: TableRuleItem[]): PeriodicService => {
    const col = serviceColumn(table, n);
    const km = serviceKm(table, n);
    const remainingKm = km - odometerKm;
    const remainingDays = dueDate ? daysBetween(today, dueDate) : null;
    const status: TableDueStatus =
      remainingKm < 0 || (remainingDays != null && remainingDays < 0)
        ? 'overdue'
        : remainingKm <= SOON_KM || (remainingDays != null && remainingDays <= SOON_DAYS)
          ? 'soon'
          : 'later';
    return {
      n,
      km,
      dueDate,
      remainingKm,
      remainingDays,
      status,
      items: table.rows.flatMap((r) =>
        r.cells && r.cells[col]?.length
          ? [{ rowId: r.id, title: r.title, group: r.group, actions: r.cells[col] }]
          : [],
      ),
      rules: due,
    };
  };

  return {
    next: service(nextNo, nextDate, nextRules),
    after: service(nextNo + 1, afterDate, afterRules),
    lastPeriodic,
    rulesUnknown,
  };
}
