import type { CycleWindow, ISODate } from '../../lib/dates';

/**
 * Budget progress — pure, so every threshold is tested without a database.
 *
 * The 75% warning is the one that matters: being told you are over budget
 * after the fact is not actionable, so the amber band exists to arrive while
 * there is still something to decide.
 */

export interface BudgetRow {
  id: number;
  categoryId: number;
  limitPaise: number;
  resetDay: number;
  isActive: boolean;
  categoryName: string;
  categoryIcon: string | null;
  categoryColor: string | null;
}

/** Value names, not colour names — theming must not turn the data into a lie. */
export type BudgetState = 'under' | 'warning' | 'over' | 'paused';

export interface BudgetProgress extends BudgetRow {
  spentPaise: number;
  /** Negative once the budget is exceeded — the screen shows the magnitude. */
  remainingPaise: number;
  /** 0–1 for the bar; NOT clamped in `ratio`, clamped in `fill`. */
  ratio: number;
  fill: number;
  state: BudgetState;
  cycleStart: ISODate;
  cycleEnd: ISODate;
  daysLeft: number;
  daysTotal: number;
  /**
   * What could be spent per remaining day and still land on the limit.
   * Zero once the budget is gone.
   */
  perDayLeftPaise: number;
}

export const WARNING_RATIO = 0.75;

export function budgetStatus(budget: BudgetRow, window: CycleWindow, spentPaise: number): BudgetProgress {
  // A zero limit would divide by zero; treat it as immediately over, which is
  // the honest reading of "budget nothing, spend something".
  const ratio = budget.limitPaise > 0 ? spentPaise / budget.limitPaise : spentPaise > 0 ? 1 : 0;
  const remainingPaise = budget.limitPaise - spentPaise;

  const state: BudgetState = !budget.isActive
    ? 'paused'
    : ratio >= 1
      ? 'over'
      : ratio >= WARNING_RATIO
        ? 'warning'
        : 'under';

  // Today still counts as a day you can spend in, hence the +1.
  const daysUsable = Math.max(1, window.daysLeft + 1);

  return {
    ...budget,
    spentPaise,
    remainingPaise,
    ratio,
    fill: Math.max(0, Math.min(1, ratio)),
    state,
    cycleStart: window.start,
    cycleEnd: window.end,
    daysLeft: window.daysLeft,
    daysTotal: window.daysTotal,
    perDayLeftPaise: remainingPaise > 0 ? Math.floor(remainingPaise / daysUsable) : 0,
  };
}

export interface BudgetTotals {
  limitPaise: number;
  spentPaise: number;
  remainingPaise: number;
  overCount: number;
  warningCount: number;
}

/**
 * Totals across the budgets shown. Paused budgets are excluded: they are not
 * limiting anything this cycle, so including them would overstate headroom.
 */
export function budgetTotals(rows: BudgetProgress[]): BudgetTotals {
  let limitPaise = 0;
  let spentPaise = 0;
  let overCount = 0;
  let warningCount = 0;
  for (const r of rows) {
    if (r.state === 'paused') continue;
    limitPaise += r.limitPaise;
    spentPaise += r.spentPaise;
    if (r.state === 'over') overCount += 1;
    else if (r.state === 'warning') warningCount += 1;
  }
  return { limitPaise, spentPaise, remainingPaise: limitPaise - spentPaise, overCount, warningCount };
}

/** "Resets today" · "1 day left" · "12 days left". */
export function daysLeftLabel(daysLeft: number): string {
  if (daysLeft <= 0) return 'Resets today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}
