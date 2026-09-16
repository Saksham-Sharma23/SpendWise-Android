import type { BenchQuery } from '../../db/benchmark';
import { todayISO } from '../../lib/dates';
import { periodWindow } from './period';
import { analyticsQueries } from './queries';

/**
 * The Analytics screen's shipped queries, for the dev harness benchmark.
 * The 24-month range is the stress case the Phase 5 exit criterion names.
 *
 * `category totals` reports a TEMP B-TREE by design: it groups and orders a
 * handful of per-category rows (bounded by the number of categories, not the
 * ledger), after walking tx_month_idx for the range.
 */
export function analyticsBenchQueries(today = todayISO()): BenchQuery[] {
  const month = today.slice(0, 7);
  const m24 = periodWindow(24, today).firstMonth;
  const m3 = periodWindow(3, today).firstMonth;
  return [
    { name: 'analytics trend (24 months)', build: () => analyticsQueries.trend(m24) },
    { name: 'analytics trend (3 months)', build: () => analyticsQueries.trend(m3) },
    { name: 'period totals (24 months)', build: () => analyticsQueries.totals(m24) },
    { name: 'earliest date', build: () => analyticsQueries.earliestDate() },
    { name: 'biggest expense (24 months)', build: () => analyticsQueries.biggestExpense(m24) },
    { name: 'top category (24 months)', build: () => analyticsQueries.categoryTotals(m24, month, 1) },
    { name: 'category donut (month)', build: () => analyticsQueries.categoryTotals(month, month) },
  ];
}
