import { and, asc, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';

import { setMeta } from '@/db/seed';
import { readDb } from '@/db/read';
import { appMeta, budgets, categories, META_KEYS, subscriptions, transactions } from '@/db/schema';
import type { BillingCycle, SubscriptionStatus } from '@/db/schema';
import { useDbQuery, type DbQueryResult } from '@/lib/db/useDbQuery';
import { addMonthsClamped, getCycleWindow, startOfMonth, type ISODate } from '@/lib/dates';
import { topCategoriesQuery, trendQuery } from './sql';

/**
 * The dashboard's query boundary.
 *
 * Home shows several figures at once and every write re-runs the subscribed
 * queries, so each figure is ONE small aggregate on an index, executed off the
 * JS thread (db/read.ts), re-run at most once per burst of writes, and only
 * while Home is focused (lib/db/useDbQuery.ts).
 *
 * Every hook returns the full `DbQueryResult` so a screen can tell "no data
 * yet" (pending) from "genuinely empty" (ok + empty) from "failed" (error).
 */

export interface MonthOverview {
  incomePaise: number;
  expensePaise: number;
  lastIncomePaise: number;
  lastExpensePaise: number;
  /**
   * Last month's expenses up to the same day of the month as today (clamped to
   * last month's length). Compares like with like: on the 10th, this month's
   * ten days against last month's first ten, not against all of last month.
   */
  lastExpenseToDatePaise: number;
  count: number;
}

const EMPTY_OVERVIEW: MonthOverview = {
  incomePaise: 0,
  expensePaise: 0,
  lastIncomePaise: 0,
  lastExpensePaise: 0,
  lastExpenseToDatePaise: 0,
  count: 0,
};

/**
 * This month and last month side by side in a single query: one range scan
 * on tx_ledger_idx, split into sums by CASE.
 */
export function useMonthOverview(today: ISODate): DbQueryResult<MonthOverview> {
  const thisStart = startOfMonth(today);
  const lastToDate = addMonthsClamped(today, -1);

  return useDbQuery(
    async () => (await dashboardQueries.overview(today))[0] ?? EMPTY_OVERVIEW,
    ['transactions'],
    [thisStart, lastToDate],
    EMPTY_OVERVIEW,
  );
}

function overviewQuery(today: ISODate) {
  const thisStart = startOfMonth(today);
  const lastStart = addMonthsClamped(thisStart, -1);
  const nextStart = addMonthsClamped(thisStart, 1);
  const lastToDate = addMonthsClamped(today, -1);
  const inThis = sql`${transactions.date} >= ${thisStart}`;
  return readDb
    .select({
      incomePaise: sql<number>`coalesce(sum(case when ${inThis} and ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`,
      expensePaise: sql<number>`coalesce(sum(case when ${inThis} and ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
      lastIncomePaise: sql<number>`coalesce(sum(case when not (${inThis}) and ${transactions.type} = 'income' then ${transactions.amountPaise} else 0 end), 0)`,
      lastExpensePaise: sql<number>`coalesce(sum(case when not (${inThis}) and ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
      lastExpenseToDatePaise: sql<number>`coalesce(sum(case when not (${inThis}) and ${transactions.date} <= ${lastToDate} and ${transactions.type} = 'expense' then ${transactions.amountPaise} else 0 end), 0)`,
      count: sql<number>`coalesce(sum(case when ${inThis} then 1 else 0 end), 0)`,
    })
    .from(transactions)
    .where(and(isNull(transactions.deletedAt), gte(transactions.date, lastStart), lt(transactions.date, nextStart)));
}

export interface TrendPoint {
  /** 'YYYY-MM' */
  month: string;
  incomePaise: number;
  expensePaise: number;
}

const EMPTY_TREND: { month: string; incomePaise: number; expensePaise: number }[] = [];

/**
 * Income vs expense per month for the last `months` months, oldest first.
 *
 * Filters and groups on the generated `month` column so SQLite walks
 * tx_month_idx in order with no temporary sort. SQLite only returns months
 * that HAVE rows, so gaps are filled here — a chart that silently skips an
 * empty month misrepresents the trend.
 */
export function useMonthlyTrend(months: number, today: ISODate): DbQueryResult<TrendPoint[]> {
  const firstMonth = addMonthsClamped(startOfMonth(today), -(months - 1));
  const firstKey = firstMonth.slice(0, 7);

  const result = useDbQuery(() => dashboardQueries.trend(months, today), ['transactions'], [firstKey], EMPTY_TREND);

  const byMonth = new Map(result.data.map((r) => [r.month, r]));
  const points: TrendPoint[] = [];
  for (let i = 0; i < months; i++) {
    const key = addMonthsClamped(firstMonth, i).slice(0, 7);
    const row = byMonth.get(key);
    points.push({ month: key, incomePaise: row?.incomePaise ?? 0, expensePaise: row?.expensePaise ?? 0 });
  }
  return { ...result, data: points };
}

export interface CategorySpend {
  id: number | null;
  name: string | null;
  color: string | null;
  icon: string | null;
  totalPaise: number;
}

const EMPTY_SPEND: CategorySpend[] = [];

/** This month's biggest expense categories. */
export function useTopCategories(today: ISODate, limit = 4): DbQueryResult<CategorySpend[]> {
  const thisStart = startOfMonth(today);

  return useDbQuery(
    async () => (await dashboardQueries.topCategories(today, limit)) as CategorySpend[],
    // categories too: a rename or recolour must refresh the bars.
    ['transactions', 'categories'],
    [thisStart, limit],
    EMPTY_SPEND,
  );
}

export interface RecentTransaction {
  id: number;
  type: 'expense' | 'income';
  amountPaise: number;
  date: string;
  note: string | null;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

const EMPTY_RECENT: RecentTransaction[] = [];

export function useRecentTransactions(limit = 5): DbQueryResult<RecentTransaction[]> {
  return useDbQuery(
    async () => (await dashboardQueries.recent(limit)) as RecentTransaction[],
    ['transactions', 'categories'],
    [limit],
    EMPTY_RECENT,
  );
}

// ---------------------------------------------------------------------------
// Query builders — shared by the hooks above and the dev benchmark
// (db/benchmark.ts), so the timed SQL is exactly the shipped SQL.
//
// The month-bounded builders TAKE `db`, so features/dashboard/__tests__ can run
// the shipped SQL on better-sqlite3 (convention #18). The rest still close over
// readDb until R3 moves the whole feature to the standard layout.
// ---------------------------------------------------------------------------

function recentQuery(limit: number) {
  return readDb
    .select({
      id: transactions.id,
      type: transactions.type,
      amountPaise: transactions.amountPaise,
      date: transactions.date,
      note: transactions.note,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      categoryColor: categories.color,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(isNull(transactions.deletedAt))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit);
}

/**
 * Bound to the app's read handle, so the benchmark times exactly what screens
 * run. Tests import the builders from `./sql` and pass their own handle.
 */
export const dashboardQueries = {
  overview: overviewQuery,
  trend: (months: number, today: ISODate) => trendQuery(readDb, months, today),
  topCategories: (today: ISODate, limit: number) => topCategoriesQuery(readDb, today, limit),
  recent: recentQuery,
};

// ---------------------------------------------------------------------------
// For the renewals card and first-run onboarding (wired by the Home screen)
// ---------------------------------------------------------------------------

export interface ActiveSubscription {
  id: number;
  name: string;
  amountPaise: number;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  anchorDate: ISODate;
  reminderDaysBefore: number;
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
}

const EMPTY_SUBS: ActiveSubscription[] = [];

/**
 * Live, non-deleted ACTIVE subscriptions with their category's look. Renewal
 * dates are computed on read from these (lib/renewals.ts), never stored.
 * Shape matches lib/renewals `SubscriptionLike`.
 */
export function useActiveSubscriptions(): DbQueryResult<ActiveSubscription[]> {
  return useDbQuery(
    async () =>
      (await readDb
        .select({
          id: subscriptions.id,
          name: subscriptions.name,
          amountPaise: subscriptions.amountPaise,
          billingCycle: subscriptions.billingCycle,
          status: subscriptions.status,
          anchorDate: subscriptions.anchorDate,
          reminderDaysBefore: subscriptions.reminderDaysBefore,
          categoryName: categories.name,
          categoryIcon: categories.icon,
          categoryColor: categories.color,
        })
        .from(subscriptions)
        .leftJoin(categories, eq(subscriptions.categoryId, categories.id))
        .where(and(isNull(subscriptions.deletedAt), eq(subscriptions.status, 'active')))
        .orderBy(asc(subscriptions.name))) as ActiveSubscription[],
    ['subscriptions', 'categories'],
    [],
    EMPTY_SUBS,
  );
}

/** Whether the ledger holds any live transaction — one indexed probe, never a count. */
export function useHasTransactions(): DbQueryResult<boolean> {
  return useDbQuery(
    async () => {
      const rows = await readDb
        .select({ id: transactions.id })
        .from(transactions)
        .where(isNull(transactions.deletedAt))
        .limit(1);
      return rows.length > 0;
    },
    ['transactions'],
    [],
    false,
  );
}

/** Whether the user dismissed first-run onboarding (app_meta `onboarding_dismissed`). */
export function useOnboardingDismissed(): DbQueryResult<boolean> {
  return useDbQuery(
    async () => {
      const rows = await readDb
        .select({ value: appMeta.value })
        .from(appMeta)
        .where(eq(appMeta.key, META_KEYS.ONBOARDING_DISMISSED))
        .limit(1);
      return rows[0]?.value === '1';
    },
    ['app_meta'],
    [],
    false,
  );
}

export function dismissOnboarding(): void {
  setMeta(META_KEYS.ONBOARDING_DISMISSED, '1');
}

// ---------------------------------------------------------------------------
// Budgets on Home
// ---------------------------------------------------------------------------

export interface DashboardBudget {
  id: number;
  categoryName: string;
  limitPaise: number;
  spentPaise: number;
  ratio: number;
  fill: number;
  state: 'under' | 'warning' | 'over' | 'paused';
}

const EMPTY_BUDGETS: DashboardBudget[] = [];

/**
 * The few budgets worth showing on Home: closest to their limit first.
 *
 * Home cannot import features/budgets (siblings never import each other,
 * CLAUDE.md #9), so the same cycle-window arithmetic is reached through
 * lib/dates — the shared floor both features stand on. Spend is summed per
 * budget in SQL, each within its OWN window, exactly as the Budgets screen
 * does it.
 */
export function useDashboardBudgets(today: ISODate, limit = 4): DbQueryResult<DashboardBudget[]> {
  return useDbQuery(
    async () => {
      const rows = await readDb
        .select({
          id: budgets.id,
          categoryId: budgets.categoryId,
          limitPaise: budgets.limitPaise,
          resetDay: budgets.resetDay,
          isActive: budgets.isActive,
          categoryName: categories.name,
        })
        .from(budgets)
        .innerJoin(categories, eq(budgets.categoryId, categories.id))
        .where(and(isNull(budgets.deletedAt), isNull(categories.deletedAt)));

      if (rows.length === 0) return EMPTY_BUDGETS;

      const windows = rows.map((b) => getCycleWindow(b.resetDay, today));
      const clauses = rows.map(
        (b, i) =>
          sql`(${transactions.categoryId} = ${b.categoryId} and ${transactions.date} >= ${windows[i]!.start} and ${transactions.date} <= ${windows[i]!.end})`,
      );
      const spend = await readDb
        .select({
          categoryId: sql<number>`${transactions.categoryId}`,
          spentPaise: sql<number>`coalesce(sum(${transactions.amountPaise}), 0)`,
        })
        .from(transactions)
        .where(
          and(isNull(transactions.deletedAt), eq(transactions.type, 'expense'), sql`(${sql.join(clauses, sql` or `)})`),
        )
        .groupBy(transactions.categoryId);

      const byCategory = new Map(spend.map((s) => [s.categoryId, s.spentPaise]));

      return (
        rows
          .map((b): DashboardBudget => {
            const spentPaise = byCategory.get(b.categoryId) ?? 0;
            const ratio = b.limitPaise > 0 ? spentPaise / b.limitPaise : spentPaise > 0 ? 1 : 0;
            return {
              id: b.id,
              categoryName: b.categoryName,
              limitPaise: b.limitPaise,
              spentPaise,
              ratio,
              fill: Math.max(0, Math.min(1, ratio)),
              state: !b.isActive ? 'paused' : ratio >= 1 ? 'over' : ratio >= 0.75 ? 'warning' : 'under',
            };
          })
          // Closest to the limit first: that is the one worth a glance.
          .sort((a, b) => b.ratio - a.ratio)
          .slice(0, limit)
      );
    },
    ['budgets', 'transactions', 'categories'],
    [today, limit],
    EMPTY_BUDGETS,
  );
}
