import { Redirect } from 'expo-router';

/**
 * The dev harness route — and nothing of it reaches a release build.
 *
 * `__DEV__` is a compile-time constant, so Metro's minifier drops the whole
 * `require` branch below from a production bundle. That matters because the
 * harness reaches the 50k-row seeder (`db/dev/devSeed.ts`), the benchmark
 * runner and every feature's benchmark query list: with static `import`s at
 * the top of this file, Metro followed them and bundled all of it into the
 * release APK. The `__DEV__` checks stopped that code RUNNING, never shipping
 * (review A8).
 *
 * So the require stays inside the branch, and the redirect is what a release
 * build contains. `DevHarness` refuses to render outside dev too — the second
 * of the two guards CLAUDE.md #17 asks for.
 */
export default function DevRoute() {
  if (!__DEV__) return <Redirect href="/(tabs)" />;
  return <DevHarnessLazy />;
}

function DevHarnessLazy() {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { DevHarness } = require('@/features/devtools') as typeof import('@/features/devtools');
  // Each benchmark.ts directly, NOT through the feature's index.ts: the real
  // tabs import those barrels, so a re-export there dragged db/dev into the
  // release bundle no matter how this route was written.
  const { analyticsBenchQueries } =
    require('@/features/analytics/benchmark') as typeof import('@/features/analytics/benchmark');
  const { dashboardBenchQueries } =
    require('@/features/dashboard/benchmark') as typeof import('@/features/dashboard/benchmark');
  const { transactionBenchQueries } =
    require('@/features/transactions/benchmark') as typeof import('@/features/transactions/benchmark');
  /* eslint-enable @typescript-eslint/no-require-imports */

  const benchQueries = () => [...dashboardBenchQueries(), ...analyticsBenchQueries(), ...transactionBenchQueries()];
  return <DevHarness benchQueries={benchQueries} />;
}
