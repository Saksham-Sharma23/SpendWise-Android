import { sqliteDb } from './client';

/**
 * Phase 1 exit criterion: time every analytics query against a populated
 * database, on the real device.
 *
 * These are the exact queries Phase 5 will ship. Writing them now — before
 * any chart exists — means a slow one is a five-minute index fix rather than
 * a redesign of the Analytics screen.
 *
 * The governing rule (CLAUDE.md #5): never SELECT rows you intend to sum.
 * Every query below returns tens of rows regardless of ledger size.
 */

export interface BenchResult {
  name: string;
  ms: number;
  rows: number;
  /** True when SQLite reported a full table scan — the thing to avoid. */
  scan: boolean;
  plan: string;
}

function timeQuery(name: string, query: string, params: unknown[] = []): BenchResult {
  // EXPLAIN QUERY PLAN tells us whether an index was used. A query that is
  // fast on 50k rows but scanning will not stay fast at 200k.
  const plan = sqliteDb
    .getAllSync<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`, params as never[])
    .map((r) => r.detail)
    .join(' | ');

  const t0 = Date.now();
  const rows = sqliteDb.getAllSync(query, params as never[]);
  const ms = Date.now() - t0;

  return {
    name,
    ms,
    rows: rows.length,
    scan: /SCAN/i.test(plan) && !/USING (COVERING )?INDEX/i.test(plan),
    plan,
  };
}

/** ISO date N months back from today, as 'YYYY-MM-DD'. */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

export function runAnalyticsBenchmark(): BenchResult[] {
  const results: BenchResult[] = [];

  // 1. The trend query — the most important one in the app. Aggregates the
  //    whole ledger down to at most 24 rows.
  results.push(
    timeQuery(
      'trend (24 months)',
      `SELECT substr(date,1,7) AS month,
              SUM(CASE WHEN type='income'  THEN amount_paise ELSE 0 END) AS income_paise,
              SUM(CASE WHEN type='expense' THEN amount_paise ELSE 0 END) AS expense_paise
         FROM transactions
        WHERE deleted_at IS NULL AND date >= ?
        GROUP BY month
        ORDER BY month`,
      [monthsAgo(24)],
    ),
  );

  // 2. Category donut for a single month.
  results.push(
    timeQuery(
      'category breakdown (1 month)',
      `SELECT c.id, c.name, c.color, SUM(t.amount_paise) AS total_paise
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id
        WHERE t.deleted_at IS NULL
          AND t.type = 'expense'
          AND t.date >= ? AND t.date < ?
        GROUP BY c.id
        ORDER BY total_paise DESC`,
      [monthsAgo(1), monthsAgo(0)],
    ),
  );

  // 3. Summary cards — one row.
  results.push(
    timeQuery(
      'summary (1 month)',
      `SELECT SUM(CASE WHEN type='income'  THEN amount_paise ELSE 0 END) AS income_paise,
              SUM(CASE WHEN type='expense' THEN amount_paise ELSE 0 END) AS expense_paise,
              COUNT(*) AS n
         FROM transactions
        WHERE deleted_at IS NULL AND date >= ?`,
      [monthsAgo(1)],
    ),
  );

  // 4. The ledger's first page — what Transactions renders on open.
  results.push(
    timeQuery(
      'ledger page (50 rows)',
      `SELECT * FROM transactions
        WHERE deleted_at IS NULL
        ORDER BY date DESC, id DESC
        LIMIT 50`,
    ),
  );

  // 5. Biggest expense — a stat card.
  results.push(
    timeQuery(
      'biggest expense (1 month)',
      `SELECT * FROM transactions
        WHERE deleted_at IS NULL AND type='expense' AND date >= ?
        ORDER BY amount_paise DESC
        LIMIT 1`,
      [monthsAgo(1)],
    ),
  );

  // 6. Duplicate lookup — the Phase 6 importer runs this once per import,
  //    and it must not degrade into a scan.
  results.push(
    timeQuery(
      'dedupe hash lookup',
      `SELECT id FROM transactions WHERE dedupe_hash = ? LIMIT 1`,
      ['nonexistent-probe-hash'],
    ),
  );

  return results;
}

export function countTransactions(): number {
  const row = sqliteDb.getFirstSync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM transactions WHERE deleted_at IS NULL',
  );
  return row?.n ?? 0;
}

/** Approximate on-disk size in bytes — surfaced in Settings in Phase 7. */
export function databaseSizeBytes(): number {
  const page = sqliteDb.getFirstSync<{ v: number }>('PRAGMA page_size');
  const count = sqliteDb.getFirstSync<{ v: number }>('PRAGMA page_count');
  return (page?.v ?? 0) * (count?.v ?? 0);
}
