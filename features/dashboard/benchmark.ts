import type { BenchQuery } from '../../db/benchmark';
import { todayISO } from '../../lib/dates';
import { dashboardQueries } from './queries';

/** The dashboard's shipped queries, for the dev harness benchmark. Local dates, never UTC. */
export function dashboardBenchQueries(today = todayISO()): BenchQuery[] {
  return [
    { name: 'trend (24 months)', build: () => dashboardQueries.trend(24, today) },
    { name: 'trend (12 months)', build: () => dashboardQueries.trend(12, today) },
    { name: 'month overview', build: () => dashboardQueries.overview(today) },
    { name: 'top categories (month)', build: () => dashboardQueries.topCategories(today, 4) },
    { name: 'recent (5)', build: () => dashboardQueries.recent(5) },
  ];
}
