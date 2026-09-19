/**
 * Ledger aggregates shared by Home, Insights, the ledger and Budgets.
 * `sql.ts` holds the builders (tested on the real schema); `budgetState.ts`
 * holds the one budget threshold.
 */
export {
  budgetSpend,
  categoryTotals,
  expenseSum,
  fillMonths,
  incomeExpenseTotals,
  incomeSum,
  monthTrend,
  type MonthPoint,
  type SpendWindow,
} from './sql';
export { WARNING_RATIO, budgetRatio, budgetState, type BudgetState } from './budgetState';
