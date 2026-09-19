import { budgetRatio, budgetSpend, budgetState, fillMonths } from '@/data/ledger';
import { META_KEYS, setMeta, useMeta } from '@/data/meta';
import { readDb } from '@/db/read';
import type { BillingCycle, SubscriptionStatus } from '@/db/schema';
import { useDbQuery, type DbQueryResult } from '@/lib/db/useDbQuery';
import { addMonthsClamped, getCycleWindow, startOfMonth, type ISODate } from '@/lib/dates';
import {
  activeSubscriptionsQuery,
  anyTransactionQuery,
  homeBudgetsQuery,
  overviewQuery,
  recentQuery,
  topCategoriesQuery,
  trendQuery,
} from './sql';

/**
 * Home's live reads. The SQL is in ./sql.ts (tested on the real schema) or
 * shared in `@/data/ledger`; these hooks only bind it to the read handle.
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

  const keys = Array.from({ length: months }, (_, i) => addMonthsClamped(firstMonth, i).slice(0, 7));
  return { ...result, data: fillMonths(result.data, keys) };
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

/**
 * Bound to the app's read handle, so the benchmark times exactly what screens
 * run. Tests import the builders from `./sql` and pass their own handle.
 */
export const dashboardQueries = {
  overview: (today: ISODate) => overviewQuery(readDb, today),
  trend: (months: number, today: ISODate) => trendQuery(readDb, months, today),
  topCategories: (today: ISODate, limit: number) => topCategoriesQuery(readDb, today, limit),
  recent: (limit: number) => recentQuery(readDb, limit),
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
    async () => (await activeSubscriptionsQuery(readDb)) as ActiveSubscription[],
    ['subscriptions', 'categories'],
    [],
    EMPTY_SUBS,
  );
}

/** Whether the ledger holds any live transaction — one indexed probe, never a count. */
export function useHasTransactions(): DbQueryResult<boolean> {
  return useDbQuery(async () => (await anyTransactionQuery(readDb)).length > 0, ['transactions'], [], false);
}

/** Whether the user dismissed first-run onboarding (app_meta `onboarding_dismissed`). */
export function useOnboardingDismissed(): DbQueryResult<boolean> {
  const meta = useMeta(META_KEYS.ONBOARDING_DISMISSED);
  return { ...meta, data: meta.data === '1' };
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
      const rows = await homeBudgetsQuery(readDb);

      if (rows.length === 0) return EMPTY_BUDGETS;

      const spend = await budgetSpend(
        readDb,
        rows.map((b) => {
          const w = getCycleWindow(b.resetDay, today);
          return { categoryId: b.categoryId, start: w.start, end: w.end };
        }),
      );
      const byCategory = new Map(spend.map((s) => [s.categoryId, s.spentPaise]));

      // The SAME spend query and threshold as the Budgets screen (R3-8), so
      // Home's card and the Budgets bar can never disagree. Home used to carry
      // its own copy of the query and a literal 0.75.
      return (
        rows
          .map((b): DashboardBudget => {
            const spentPaise = byCategory.get(b.categoryId) ?? 0;
            const ratio = budgetRatio(spentPaise, b.limitPaise);
            return {
              id: b.id,
              categoryName: b.categoryName,
              limitPaise: b.limitPaise,
              spentPaise,
              ratio,
              fill: Math.max(0, Math.min(1, ratio)),
              state: budgetState(ratio, b.isActive),
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
