import { formatINR } from './money';

/**
 * The Home insight banner's rules — pure, so every branch is unit-tested.
 *
 * The banner's job is to make the dashboard feel like it is paying attention
 * rather than just reporting. It says ONE thing, chosen by priority, and every
 * figure it quotes comes from SQL aggregates the dashboard already has.
 *
 * Comparisons are month-TO-DATE against the same days of last month. Comparing
 * 14 days of September with all 30 days of August would call every month a
 * saving until the last week.
 */

export type InsightTone = 'good' | 'warn' | 'neutral';
export type InsightIcon = 'sparkles' | 'trending-down' | 'trending-up' | 'alert' | 'piggy-bank' | 'pie-chart';

export interface InsightInput {
  /** This month so far. */
  incomePaise: number;
  expensePaise: number;
  /** Rows this month — distinguishes "nothing yet" from "all zero". */
  count: number;
  /** Last month, cut off at the same day of the month. */
  lastExpenseToDatePaise: number;
  /** The largest expense category this month, if any. */
  topCategory?: { name: string; totalPaise: number } | null;
}

export interface Insight {
  tone: InsightTone;
  icon: InsightIcon;
  title: string;
  body: string;
}

/** Changes smaller than this read as noise, not news. */
const PACE_GOOD = -0.1;
const PACE_WARN = 0.15;
const TOP_SHARE = 0.35;
const SAVINGS_GOOD = 0.2;

const pct = (ratio: number) => `${Math.round(Math.abs(ratio) * 100)}%`;
const rupees = (paise: number) => formatINR(paise, { whole: true });

export function buildInsight(input: InsightInput): Insight {
  const { incomePaise, expensePaise, count, lastExpenseToDatePaise, topCategory } = input;

  // 1. Nothing recorded yet this month.
  if (count === 0) {
    return {
      tone: 'neutral',
      icon: 'sparkles',
      title: 'A fresh month',
      body: 'Add what you spend today, and your insights start here.',
    };
  }

  // 2. Spending more than came in — the one thing worth saying first.
  if (incomePaise > 0 && expensePaise > incomePaise) {
    return {
      tone: 'warn',
      icon: 'alert',
      title: 'Spending more than you earned',
      body: `You're ${rupees(expensePaise - incomePaise)} over this month's income so far.`,
    };
  }

  // 3. Pace against the same point last month.
  if (lastExpenseToDatePaise > 0) {
    const change = (expensePaise - lastExpenseToDatePaise) / lastExpenseToDatePaise;
    if (change <= PACE_GOOD) {
      return {
        tone: 'good',
        icon: 'trending-down',
        title: `${pct(change)} less than last month`,
        body: `${rupees(expensePaise)} spent so far, against ${rupees(lastExpenseToDatePaise)} by this day last month.`,
      };
    }
    if (change >= PACE_WARN) {
      return {
        tone: 'warn',
        icon: 'trending-up',
        title: `${pct(change)} more than last month`,
        body: `${rupees(expensePaise)} spent so far, against ${rupees(lastExpenseToDatePaise)} by this day last month.`,
      };
    }
  }

  // 4. One category dominating.
  if (topCategory && expensePaise > 0) {
    const share = topCategory.totalPaise / expensePaise;
    if (share >= TOP_SHARE) {
      return {
        tone: 'neutral',
        icon: 'pie-chart',
        title: `${topCategory.name} leads your spending`,
        body: `${pct(share)} of this month's expenses — ${rupees(topCategory.totalPaise)} so far.`,
      };
    }
  }

  // 5. A healthy savings rate.
  if (incomePaise > 0) {
    const rate = (incomePaise - expensePaise) / incomePaise;
    if (rate >= SAVINGS_GOOD) {
      return {
        tone: 'good',
        icon: 'piggy-bank',
        title: `Saving ${pct(rate)} of your income`,
        body: `${rupees(incomePaise - expensePaise)} kept so far this month.`,
      };
    }
  }

  // 6. Nothing stands out.
  return {
    tone: 'neutral',
    icon: 'sparkles',
    title: 'Right on track',
    body:
      lastExpenseToDatePaise > 0
        ? "Your spending is within a few percent of last month's pace."
        : `${rupees(expensePaise)} spent so far this month.`,
  };
}
