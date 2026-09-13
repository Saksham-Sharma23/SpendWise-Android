import { sql } from 'drizzle-orm';
import { File } from 'expo-file-system';
import { db, sqliteDb } from './client';
import { categories, transactions } from './schema';
import { addDays, toISODate } from '../lib/dates';

/**
 * Debug-only bulk seeder.
 *
 * You cannot judge query performance on twelve rows. This is the instrument
 * behind the Phase 1 exit criterion — "a 24-month trend query in under ~50ms
 * on the actual device" — and behind every later decision about whether a
 * query needs an index, a window, or a rollup.
 *
 * Never shipped to users: guarded by __DEV__ at both call sites and here.
 */

const NOTES = [
  'Chai', 'Auto fare', 'Groceries', 'Metro card', 'Lunch', 'Coffee',
  'Electricity bill', 'Mobile recharge', 'Medicines', 'Books',
  'Movie tickets', 'Petrol', 'Rent', 'Gym', 'Haircut', 'Swiggy',
  'Amazon order', 'Gift', 'Laundry', 'Stationery',
];

/** Deterministic PRNG so a run is reproducible when comparing timings. */
function mulberry32(seed: number) {
  return function next() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DevSeedResult {
  inserted: number;
  ms: number;
  fromDate: string;
  toDate: string;
}

/**
 * Insert `count` synthetic transactions spread across `years` back from today.
 *
 * Inserts in chunks inside one transaction: SQLite has a hard limit on
 * variables per statement (SQLITE_MAX_VARIABLE_NUMBER), so a single 50k-row
 * INSERT would fail regardless of how the driver batches it.
 */
export async function devSeedTransactions(
  count = 50_000,
  years = 4,
  seed = 20260911,
): Promise<DevSeedResult> {
  if (!__DEV__) {
    throw new Error('devSeedTransactions is a development-only utility.');
  }

  const rand = mulberry32(seed);
  const started = Date.now();

  const cats = await db.select({ id: categories.id }).from(categories);
  if (cats.length === 0) {
    throw new Error('Seed system categories before running the dev seeder.');
  }

  const today = new Date();
  const spanDays = Math.round(years * 365.25);
  const startISO = toISODate(new Date(today.getTime() - spanDays * 86_400_000));

  const CHUNK = 500;
  let inserted = 0;

  await db.transaction(async (tx) => {
    for (let offset = 0; offset < count; offset += CHUNK) {
      const rows = [];
      const n = Math.min(CHUNK, count - offset);

      for (let i = 0; i < n; i++) {
        const dayOffset = Math.floor(rand() * spanDays);
        const date = addDays(startISO, dayOffset);

        // ~8% income, matching a realistic ledger shape: a few salary rows
        // among many small expenses.
        const isIncome = rand() < 0.08;

        const amountPaise = isIncome
          ? Math.round((35_000 + rand() * 60_000) * 100)
          : Math.round((20 + rand() * 3_000) * 100);

        const cat = cats[Math.floor(rand() * cats.length)];
        const note = NOTES[Math.floor(rand() * NOTES.length)];

        rows.push({
          type: (isIncome ? 'income' : 'expense') as 'income' | 'expense',
          amountPaise,
          date,
          note: note ?? null,
          categoryId: cat?.id ?? null,
          isRecurring: false,
        });
      }

      await tx.insert(transactions).values(rows);
      inserted += n;
    }
  });

  // Without this the query planner may still be working off empty-table
  // statistics, which makes any timing taken straight after a seed a lie.
  sqliteDb.execSync('ANALYZE');

  return {
    inserted,
    ms: Date.now() - started,
    fromDate: startISO,
    toDate: toISODate(today),
  };
}

/**
 * Write an UNENCRYPTED copy of the database next to the real one, for
 * inspection with Drizzle Studio.
 *
 * The on-device file is SQLCipher-encrypted with a per-install key held in
 * the Keystore, so a raw `adb` pull is unreadable — that is the point of the
 * encryption, and it also means the "pull the DB and open it" workflow cannot
 * work on the real file. `sqlcipher_export` into an attached database with an
 * empty key produces a plain SQLite copy. Development builds only: shipping
 * this would undo the encryption entirely.
 *
 * Pull it with:  npm run db:pull   then:  npm run db:studio
 */
export function devExportDecryptedCopy(): string {
  if (!__DEV__) {
    throw new Error('devExportDecryptedCopy is a development-only utility.');
  }
  const plainPath = sqliteDb.databasePath.replace(/[^/]+$/, 'spendwise-plain.db');

  // sqlcipher_export refuses to write into a non-empty database, so a copy
  // from a previous run must go first.
  const previous = new File(`file://${plainPath}`);
  if (previous.exists) previous.delete();

  sqliteDb.execSync(`ATTACH DATABASE '${plainPath.replace(/'/g, "''")}' AS plaintext KEY ''`);
  try {
    sqliteDb.getFirstSync(`SELECT sqlcipher_export('plaintext')`);
  } finally {
    sqliteDb.execSync('DETACH DATABASE plaintext');
  }
  return plainPath;
}

/** Remove every dev-seeded row. Leaves categories and app_meta intact. */
export async function devClearTransactions(): Promise<number> {
  if (!__DEV__) {
    throw new Error('devClearTransactions is a development-only utility.');
  }
  const before = await db
    .select({ n: sql<number>`count(*)` })
    .from(transactions);
  await db.delete(transactions);
  sqliteDb.execSync('VACUUM');
  return before[0]?.n ?? 0;
}
