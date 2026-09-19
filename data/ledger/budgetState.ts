/**
 * How full a budget is, and what that means — ONE threshold for the whole app.
 *
 * Home used a literal `0.75` while the Budgets screen used `WARNING_RATIO`.
 * They agreed by coincidence; the next person to tune one would have split
 * them. Pure, so the Budgets screen, Home and Phase 8's alerts share it.
 */

export type BudgetState = 'under' | 'warning' | 'over' | 'paused';

/** At or past this share of the limit, a budget warns. */
export const WARNING_RATIO = 0.75;

/**
 * Spend as a share of the limit. A zero limit would divide by zero; it reads
 * as immediately over, the honest reading of "budget nothing, spend something".
 */
export function budgetRatio(spentPaise: number, limitPaise: number): number {
  return limitPaise > 0 ? spentPaise / limitPaise : spentPaise > 0 ? 1 : 0;
}

export function budgetState(ratio: number, isActive: boolean): BudgetState {
  if (!isActive) return 'paused';
  if (ratio >= 1) return 'over';
  if (ratio >= WARNING_RATIO) return 'warning';
  return 'under';
}
