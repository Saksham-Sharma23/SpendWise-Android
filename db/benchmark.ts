import { sqliteDb } from './connection';

/**
 * Query timing for the dev harness — the instrument behind the Phase 1 exit
 * criterion ("24-month trend under ~50 ms on the device").
 *
 * It times the SHIPPED query builders (each feature exposes its list, e.g.
 * features/dashboard/benchmark.ts), executed the way screens execute them:
 * through db/read.ts on expo-sqlite's native thread. The previous version timed
 * hand-written raw SQL with getAllSync, which measured a query no screen ran.
 *
 * Plans are reported alongside timings. A plan with a TEMP B-TREE (a sort step)
 * or a full SCAN is flagged even when it is fast today, because that is what
 * stops being fast at 200k rows.
 */

export interface BenchResult {
  name: string;
  /** Median of the timed runs, in ms. */
  ms: number;
  rows: number;
  /** A full table scan of transactions. */
  scan: boolean;
  /** A temporary B-tree: SQLite had to sort or group without an index. */
  tempSort: boolean;
  plan: string;
}

export interface BenchQuery {
  name: string;
  /** Build a fresh query each run (a Drizzle builder from the feature's query file). */
  build: () => PromiseLike<unknown> & { toSQL(): { sql: string; params: unknown[] } };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export async function timeQuery({ name, build }: BenchQuery, runs = 5): Promise<BenchResult> {
  const { sql, params } = build().toSQL();
  const plan = sqliteDb
    .getAllSync<{ detail: string }>(`EXPLAIN QUERY PLAN ${sql}`, params as never[])
    .map((r) => r.detail)
    .join(' | ');

  await build(); // warm the statement cache and page cache
  const times: number[] = [];
  let rows = 0;
  for (let i = 0; i < runs; i++) {
    const t0 = now();
    const out = await build();
    times.push(now() - t0);
    rows = Array.isArray(out) ? out.length : out == null ? 0 : 1;
  }
  times.sort((a, b) => a - b);

  return {
    name,
    ms: Math.round(times[Math.floor(times.length / 2)]! * 10) / 10,
    rows,
    scan: /SCAN transactions(?! USING)/i.test(plan),
    tempSort: /TEMP B-TREE/i.test(plan),
    plan,
  };
}

export async function runBenchmark(queries: readonly BenchQuery[]): Promise<BenchResult[]> {
  const results: BenchResult[] = [];
  for (const q of queries) results.push(await timeQuery(q));
  return results;
}

export function countTransactions(): number {
  const row = sqliteDb.getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL');
  return row?.n ?? 0;
}

/** Approximate on-disk size in bytes — surfaced in Settings in Phase 7. */
export function databaseSizeBytes(): number {
  const page = sqliteDb.getFirstSync<{ page_size: number }>('PRAGMA page_size');
  const count = sqliteDb.getFirstSync<{ page_count: number }>('PRAGMA page_count');
  return (page?.page_size ?? 0) * (count?.page_count ?? 0);
}
