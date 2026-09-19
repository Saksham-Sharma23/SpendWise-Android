import { sql } from 'drizzle-orm';
import { File, Paths } from 'expo-file-system';

import { addDays, nowISO, toISODate } from '@/lib/dates';
import { makeDedupeHash } from '@/lib/dedupe';
import { db, sqliteDb, writeTx } from './client';
import { verifyEncryptedCopy, writeEncryptedCopy, type CopyVerification } from './encryptedCopy';
import { categories, transactions } from './schema';

/**
 * Debug-only bulk seeder and database utilities.
 *
 * You cannot judge query performance on twelve rows. This is the instrument
 * behind the Phase 1 exit criterion — "a 24-month trend query in under ~50ms
 * on the actual device" — and behind every later decision about whether a
 * query needs an index, a window, or a rollup.
 *
 * Never shipped to users: guarded by __DEV__ at both call sites and here.
 */

const NOTES = [
  'Chai',
  'Auto fare',
  'Groceries',
  'Metro card',
  'Lunch',
  'Coffee',
  'Electricity bill',
  'Mobile recharge',
  'Medicines',
  'Books',
  'Movie tickets',
  'Petrol',
  'Rent',
  'Gym',
  'Haircut',
  'Swiggy',
  'Amazon order',
  'Gift',
  'Laundry',
  'Stationery',
];

function assertDev(name: string): void {
  if (!__DEV__) throw new Error(`${name} is a development-only utility.`);
}

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
 * ONE synchronous transaction, in chunks (SQLite caps variables per
 * statement). The previous version passed an async callback to
 * `db.transaction`, which committed after the first chunk and ran the rest in
 * autocommit — see db/tx.ts.
 */
export function devSeedTransactions(count = 50_000, years = 4, seed = 20260911): DevSeedResult {
  assertDev('devSeedTransactions');

  const rand = mulberry32(seed);
  const started = Date.now();

  const cats = db.select({ id: categories.id }).from(categories).all();
  if (cats.length === 0) throw new Error('Seed system categories before running the dev seeder.');

  const today = new Date();
  const spanDays = Math.round(years * 365.25);
  const startISO = toISODate(new Date(today.getTime() - spanDays * 86_400_000));
  const CHUNK = 500;
  const now = nowISO();

  const inserted = writeTx((tx) => {
    let n = 0;
    for (let offset = 0; offset < count; offset += CHUNK) {
      const size = Math.min(CHUNK, count - offset);
      const rows = [];
      for (let i = 0; i < size; i++) {
        const date = addDays(startISO, Math.floor(rand() * spanDays));
        // ~8% income, matching a realistic ledger: a few salary rows among many small expenses.
        const isIncome = rand() < 0.08;
        const amountPaise = isIncome
          ? Math.round((35_000 + rand() * 60_000) * 100)
          : Math.round((20 + rand() * 3_000) * 100);
        const note = NOTES[Math.floor(rand() * NOTES.length)] ?? null;
        rows.push({
          type: (isIncome ? 'income' : 'expense') as 'income' | 'expense',
          amountPaise,
          date,
          note,
          categoryId: cats[Math.floor(rand() * cats.length)]?.id ?? null,
          dedupeHash: makeDedupeHash(date, amountPaise, note),
          createdAt: now,
          updatedAt: now,
        });
      }
      tx.insert(transactions).values(rows).run();
      n += size;
    }
    return n;
  });

  // Without this the planner may still use empty-table statistics, which
  // makes any timing taken straight after a seed a lie.
  sqliteDb.execSync('ANALYZE');

  return { inserted, ms: Date.now() - started, fromDate: startISO, toDate: toISODate(today) };
}

/** Remove every transaction (hard delete). Leaves categories and app_meta intact. */
export function devClearTransactions(): number {
  assertDev('devClearTransactions');
  const before =
    db
      .select({ n: sql<number>`count(*)` })
      .from(transactions)
      .all()[0]?.n ?? 0;
  writeTx((tx) => {
    tx.delete(transactions).run();
  });
  sqliteDb.execSync('VACUUM');
  return before;
}

/**
 * Prove the backup-file path (decision F0-1) end to end on the device:
 * write a passphrase-encrypted copy with SQLCipher, read it back with the
 * passphrase, compare every table's row count, and confirm the file is not a
 * plain SQLite file. Phase 7's encrypted export is built on the same calls.
 */
export function devEncryptedCopyRoundTrip(passphrase = 'dev-harness-passphrase'): CopyVerification & { path: string } {
  assertDev('devEncryptedCopyRoundTrip');
  const target = new File(Paths.cache, 'spendwise-encrypted-roundtrip.db');
  writeEncryptedCopy(target, passphrase);
  return { ...verifyEncryptedCopy(target, passphrase), path: target.uri };
}
