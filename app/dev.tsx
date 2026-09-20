import { Redirect } from 'expo-router';

import { analyticsBenchQueries } from '@/features/analytics';
import { dashboardBenchQueries } from '@/features/dashboard';
import { DevHarness } from '@/features/devtools';
import { transactionBenchQueries } from '@/features/transactions';

const benchQueries = () => [...dashboardBenchQueries(), ...analyticsBenchQueries(), ...transactionBenchQueries()];

/** Bundled in release too (it is a route), so it redirects away there; the screen also refuses. */
export default function DevRoute() {
  if (!__DEV__) return <Redirect href="/(tabs)" />;
  return <DevHarness benchQueries={benchQueries} />;
}
