import { readDb } from '../../db/read';
import type { TrendPoint } from '../../components/charts/TrendChart';
import { useDbQuery, type DbQueryResult } from '../../lib/db/useDbQuery';
import type { ISODate } from '../../lib/dates';
import {
  activeDays,
  monthKeys,
  perDayPaise,
  periodWindow,
  savingsRate,
  type CategoryTotal,
} from './period';
import {
  biggestExpenseQuery,
  categoryTotalsQuery,
  earliestDateQuery,
  totalsQuery,
  trendQuery,
  type AnalyticsDb,
} from './sql';

/**
 * The Analytics screen's query boundary. Screens call these hooks and never
 * see a table name (CLAUDE.md #4).
 *
 * Every hook runs the builders in ./sql through db/read.ts — off the JS
 * thread — and lists every base table it reads, joins included (#6).
 */

// sqlite-proxy is the async member of the same Drizzle family the builders accept.
const db = readDb as unknown as AnalyticsDb;

/**
 * The builders bound to the read handle, shared with the dev benchmark.
 *
 * Every range takes BOTH ends (#5). The upper end is always the current month:
 * the date picker allows a year ahead, and before B2 was fixed a future-dated
 * row inflated the totals, avg/day and savings-rate cards while the trend chart
 * dropped it — the same screen disagreeing with itself.
 */
export const analyticsQueries = {
  trend: (firstMonth: string, lastMonth: string) => trendQuery(db, firstMonth, lastMonth),
  totals: (firstMonth: string, lastMonth: string) => totalsQuery(db, firstMonth, lastMonth),
  earliestDate: (lastMonth: string) => earliestDateQuery(db, lastMonth),
  biggestExpense: (firstMonth: string, lastMonth: string) => biggestExpenseQuery(db, firstMonth, lastMonth),
  categoryTotals: (fromMonth: string, toMonth: string, limit?: number) =>
    categoryTotalsQuery(db, fromMonth, toMonth, limit),
};

const EMPTY_TREND: TrendPoint[] = [];

/**
 * Income vs expense for each of the last `months` months, oldest first.
 * SQLite returns only months that HAVE rows; the gaps are filled here, so an
 * empty month draws as a dip to zero instead of the curve silently skipping it.
 */
export function useSpendingTrend(months: number, today: ISODate): DbQueryResult<TrendPoint[]> {
  const { firstMonth } = periodWindow(months, today);
  const currentMonth = today.slice(0, 7);
  const result = useDbQuery(
    async () => (await analyticsQueries.trend(firstMonth, currentMonth)) as TrendPoint[],
    ['transactions'],
    [firstMonth, currentMonth],
    EMPTY_TREND,
  );

  const byMonth = new Map(result.data.map((r) => [r.month, r]));
  const data = monthKeys(firstMonth, months).map((month) => ({
    month,
    incomePaise: byMonth.get(month)?.incomePaise ?? 0,
    expensePaise: byMonth.get(month)?.expensePaise ?? 0,
  }));
  return { ...result, data };
}

export interface BiggestExpense {
  id: number;
  amountPaise: number;
  date: ISODate;
  note: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

export interface PeriodStats {
  incomePaise: number;
  expensePaise: number;
  netPaise: number;
  count: number;
  /** Days the period has been running (see period.activeDays). */
  days: number;
  avgPerDayPaise: number;
  /** Percent of income kept; null with no income. */
  savingsRate: number | null;
  biggest: BiggestExpense | null;
  topCategory: CategoryTotal | null;
}

const EMPTY_STATS: PeriodStats = {
  incomePaise: 0,
  expensePaise: 0,
  netPaise: 0,
  count: 0,
  days: 1,
  avgPerDayPaise: 0,
  savingsRate: null,
  biggest: null,
  topCategory: null,
};

/**
 * Everything the summary and stat cards show for a range, as ONE hook with
 * one status. Four small aggregates run together, so the cards appear
 * together rather than popping in one by one.
 */
export function usePeriodStats(months: number, today: ISODate): DbQueryResult<PeriodStats> {
  const { firstMonth, start } = periodWindow(months, today);
  const currentMonth = today.slice(0, 7);

  return useDbQuery(
    async () => {
      const [[totals], [earliest], [biggest], [top]] = await Promise.all([
        analyticsQueries.totals(firstMonth, currentMonth),
        analyticsQueries.earliestDate(currentMonth),
        analyticsQueries.biggestExpense(firstMonth, currentMonth),
        analyticsQueries.categoryTotals(firstMonth, currentMonth, 1),
      ]);

      const incomePaise = totals?.incomePaise ?? 0;
      const expensePaise = totals?.expensePaise ?? 0;
      const days = activeDays(start, earliest?.date ?? null, today);

      return {
        incomePaise,
        expensePaise,
        netPaise: incomePaise - expensePaise,
        count: totals?.count ?? 0,
        days,
        avgPerDayPaise: perDayPaise(expensePaise, days),
        savingsRate: savingsRate(incomePaise, expensePaise),
        biggest:
          biggest?.amountPaise != null && biggest.id != null
            ? ({ ...biggest, amountPaise: biggest.amountPaise } as BiggestExpense)
            : null,
        topCategory: (top as CategoryTotal | undefined) ?? null,
      };
    },
    // categories: the biggest expense and top category show a category's name and colour.
    ['transactions', 'categories'],
    [firstMonth, today],
    EMPTY_STATS,
  );
}

const EMPTY_TOTALS: CategoryTotal[] = [];

/** Expense per category for one month ('YYYY-MM'), largest first. */
export function useCategoryBreakdown(month: string): DbQueryResult<CategoryTotal[]> {
  return useDbQuery(
    async () => (await analyticsQueries.categoryTotals(month, month)) as CategoryTotal[],
    ['transactions', 'categories'],
    [month],
    EMPTY_TOTALS,
  );
}

/**
 * The ledger's first transaction date at or before this month, or null when
 * there is none. Decides the empty state and how far back the donut's month
 * picker may go — bounded, so a future-dated row cannot open a month the
 * breakdown would show as empty.
 */
export function useEarliestDate(today: ISODate): DbQueryResult<ISODate | null> {
  const currentMonth = today.slice(0, 7);
  return useDbQuery(
    async () => (await analyticsQueries.earliestDate(currentMonth))[0]?.date ?? null,
    ['transactions'],
    [currentMonth],
    null,
  );
}
