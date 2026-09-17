import Database from 'better-sqlite3';

import {
  existingTables,
  integrityFailureRecorded,
  recheckIntegrity,
  recordIntegrityFailure,
  userDataProbeSql,
} from '../migrate';
import { connectionOf, freshDb } from './support';

/**
 * B13: the pre-migration snapshot ran only when `transactions` had rows, so
 * someone who used only Groups, Budgets or the Tracker got NO safety copy
 * before a migration — the single moment their data is most at risk. If that
 * migration failed there was nothing to restore.
 *
 * These run against the real migrated schema, so the probe is checked against
 * the columns it actually has to read (`is_self`, `is_system`).
 */

type Fresh = Awaited<ReturnType<typeof freshDb>>;

function hasUserData(fresh: Fresh): boolean {
  const sql = userDataProbeSql(existingTables(connectionOf(fresh.sqlite)));
  if (sql == null) return false;
  const row = fresh.sqlite.prepare(sql).get() as { has_data: number };
  return row.has_data > 0;
}

describe('userDataProbeSql', () => {
  let fresh: Fresh;
  beforeEach(async () => {
    fresh = await freshDb();
  });
  afterEach(() => fresh.sqlite.close());

  it('says no on a migrated but unused database', () => {
    // Seeded system categories and the sys:self person are NOT user data:
    // they exist in every fresh install and seeding puts them back.
    expect(hasUserData(fresh)).toBe(false);
  });

  it('says yes for a ledger transaction', () => {
    fresh.sqlite
      .prepare(
        `INSERT INTO transactions (uid, type, amount_paise, date, created_at, updated_at)
         VALUES ('t1', 'expense', 1000, '2026-09-01', 'now', 'now')`,
      )
      .run();
    expect(hasUserData(fresh)).toBe(true);
  });

  /** The bug, stated directly: each of these alone used to yield NO snapshot. */
  it.each([
    [
      'a group',
      `INSERT INTO split_groups (uid, name, icon, simplify_debts, created_at)
       VALUES ('g1', 'Goa', 'plane', 1, 'now')`,
    ],
    [
      'a budget',
      `INSERT INTO categories (id, uid, name, icon, color, kind, is_system, created_at)
         VALUES (1, 'csys', 'Food', 'utensils', '#E8833A', 'expense', 1, 'now');
       INSERT INTO budgets (uid, category_id, limit_paise, reset_day, is_active, created_at)
         VALUES ('b1', 1, 500000, 1, 1, 'now')`,
    ],
    [
      'a subscription',
      `INSERT INTO subscriptions (uid, name, amount_paise, billing_cycle, status, anchor_date, reminder_days_before, created_at)
       VALUES ('s1', 'Netflix', 19900, 'monthly', 'active', '2026-09-01', 3, 'now')`,
    ],
    ['a friend', `INSERT INTO people (uid, name, is_self, created_at) VALUES ('p9', 'Rahul', 0, 'now')`],
    [
      'a user-made category',
      `INSERT INTO categories (uid, name, icon, color, kind, is_system, created_at)
       VALUES ('c9', 'Chai', 'coffee', '#E8833A', 'expense', 0, 'now')`,
    ],
  ])('says yes for %s on its own', (_label, sql) => {
    fresh.sqlite.exec(sql);
    expect(hasUserData(fresh)).toBe(true);
  });

  it('builds no query for a database with none of the tables', () => {
    const empty = new Database(':memory:');
    expect(userDataProbeSql(existingTables(connectionOf(empty)))).toBeNull();
    empty.close();
  });

  it('probes only the tables that exist, so an older schema cannot throw', () => {
    // A pre-Groups database: the Groups tables are simply absent.
    const sql = userDataProbeSql(['transactions', 'budgets', 'categories']);
    expect(sql).not.toBeNull();
    expect(sql).not.toMatch(/split_groups|settlements|people/);
    expect(sql).toMatch(/transactions/);

    const old = new Database(':memory:');
    old.exec('CREATE TABLE transactions (id INTEGER); CREATE TABLE budgets (id INTEGER);');
    old.exec('CREATE TABLE categories (id INTEGER, is_system INTEGER);');
    expect(() => old.prepare(sql!).get()).not.toThrow();
    old.close();
  });
});

/**
 * B8: `foreign_key_check` necessarily runs AFTER drizzle has committed — it
 * migrates everything in one transaction — so a violation could not be rolled
 * back. Boot reported it once, and the next launch found nothing pending and
 * opened straight onto the broken data. The failure now outlives the launch
 * that found it.
 */
describe('integrity failures persist across launches', () => {
  let fresh: Fresh;
  beforeEach(async () => {
    fresh = await freshDb();
  });
  afterEach(() => fresh.sqlite.close());

  /** A transaction pointing at a category that does not exist. */
  function breakAReference() {
    fresh.sqlite.pragma('foreign_keys = OFF');
    fresh.sqlite
      .prepare(
        `INSERT INTO transactions (uid, type, amount_paise, date, category_id, created_at, updated_at)
         VALUES ('orphan', 'expense', 1000, '2026-09-01', 4242, 'now', 'now')`,
      )
      .run();
  }

  it('records nothing when the database is sound', () => {
    const conn = connectionOf(fresh.sqlite);
    expect(fresh.sqlite.prepare('PRAGMA foreign_key_check').all()).toHaveLength(0);
    expect(integrityFailureRecorded(conn)).toBe(false);
  });

  it('records the failure, and still reports it on the NEXT launch', () => {
    const conn = connectionOf(fresh.sqlite);
    breakAReference();

    // Launch 1: the check finds the violation after the commit.
    const violations = fresh.sqlite.prepare('PRAGMA foreign_key_check').all();
    expect(violations.length).toBeGreaterThan(0);
    recordIntegrityFailure(conn, violations.length);

    // Launch 2: nothing is pending, so only the flag can save us.
    expect(integrityFailureRecorded(conn)).toBe(true);
    expect(recheckIntegrity(conn)).toBeGreaterThan(0);

    // …and launch 3, and every launch after it.
    expect(integrityFailureRecorded(conn)).toBe(true);
  });

  it('clears itself once the damage is actually repaired', () => {
    const conn = connectionOf(fresh.sqlite);
    breakAReference();
    recordIntegrityFailure(conn, 1);
    expect(integrityFailureRecorded(conn)).toBe(true);

    // A later fix migration, or a restore, removes the orphan.
    fresh.sqlite.prepare("DELETE FROM transactions WHERE uid = 'orphan'").run();

    expect(recheckIntegrity(conn)).toBe(0);
    expect(integrityFailureRecorded(conn)).toBe(false);
  });

  it('never throws, even with no app_meta table at all', () => {
    const bare = new Database(':memory:');
    const conn = connectionOf(bare);
    expect(integrityFailureRecorded(conn)).toBe(false);
    expect(() => recordIntegrityFailure(conn, 3)).not.toThrow();
    expect(integrityFailureRecorded(conn)).toBe(true);
    bare.close();
  });
});
