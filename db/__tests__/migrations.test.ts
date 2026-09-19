import Database from 'better-sqlite3';

import {
  lastAppliedMillis,
  pendingMigrations,
  SHARE_PREFIX,
  shareCopiesToDelete,
  snapshotName,
  snapshotsToDelete,
} from '../migrate';
import { connectionOf, journal, migrateSafely, migrateWithForeignKeysOn } from './support';

/**
 * Convention #8: every migration is tested against a POPULATED database.
 *
 * The fixture is the shape real installs have at migration 0000: both
 * timestamp formats, date-only soft deletes, `is_recurring` set, a live and a
 * soft-deleted budget, a subscription, an import batch, uncategorised rows —
 * and 50,000 transactions. Then 0001–0005 are applied through drizzle's real
 * migrator, wrapped exactly as db/boot.ts wraps it.
 */

const SYSTEM = [
  'Food & Dining',
  'Groceries',
  'Transport',
  'Shopping',
  'Entertainment',
  'Bills & Utilities',
  'Health',
  'Education',
  'Rent',
  'Travel',
  'Subscriptions',
  'Personal Care',
  'Gifts & Donations',
  'Investments',
  'Salary',
  'Other Income',
  'Miscellaneous',
];

const TX_COUNT = 50_000;

async function legacyDatabase(): Promise<Database.Database> {
  const sqlite = new Database(':memory:');
  await migrateSafely(sqlite, 0);
  sqlite.pragma('foreign_keys = ON');

  const insertSystem = sqlite.prepare(
    "INSERT INTO categories (name, icon, color, is_system) VALUES (?, 'tag', '#888888', 1)",
  );
  for (const name of SYSTEM) insertSystem.run(name); // created_at via the OLD default: 'YYYY-MM-DD HH:MM:SS'
  sqlite
    .prepare("INSERT INTO categories (name, is_system, created_at) VALUES ('Coffee', 0, '2026-03-01T10:00:00.000Z')")
    .run();
  sqlite
    .prepare(
      "INSERT INTO categories (name, is_system, created_at, deleted_at) VALUES ('Old ⟨deleted #99⟩', 0, '2026-01-01 09:00:00', '2026-02-01')",
    )
    .run();

  const rent = (sqlite.prepare("SELECT id FROM categories WHERE name = 'Rent'").get() as { id: number }).id;
  const groceries = (sqlite.prepare("SELECT id FROM categories WHERE name = 'Groceries'").get() as { id: number }).id;
  sqlite.prepare('INSERT INTO budgets (category_id, limit_paise) VALUES (?, 2500000)').run(rent);
  sqlite
    .prepare(
      "INSERT INTO budgets (category_id, limit_paise, deleted_at) VALUES (?, 900000, '2026-05-01T00:00:00.000Z')",
    )
    .run(groceries);
  sqlite
    .prepare(
      "INSERT INTO subscriptions (name, amount_paise, billing_cycle, anchor_date, category_id) VALUES ('Netflix', 64900, 'monthly', '2026-01-05', ?)",
    )
    .run(rent);
  sqlite.prepare("INSERT INTO import_batches (source_name, rows_imported) VALUES ('hdfc.xls', 10)").run();
  sqlite.prepare("INSERT INTO app_meta (key, value) VALUES ('seeded_at', '2026-09-10T08:00:00.000Z')").run();

  const insertTx = sqlite.prepare(
    `INSERT INTO transactions (type, amount_paise, date, note, category_id, is_recurring, import_batch_id, created_at, updated_at, deleted_at)
     VALUES (@type, @amount, @date, @note, @cat, @rec, @batch, @created, @created, @deleted)`,
  );
  const insertTxDefaultTimes = sqlite.prepare(
    `INSERT INTO transactions (type, amount_paise, date, note, category_id, is_recurring)
     VALUES (@type, @amount, @date, @note, @cat, @rec)`,
  );
  let s = 42;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const start = Date.UTC(2022, 8, 1);
  sqlite.transaction(() => {
    for (let i = 0; i < TX_COUNT; i++) {
      const row = {
        type: rand() < 0.08 ? 'income' : 'expense',
        amount: Math.round((20 + rand() * 3000) * 100),
        date: new Date(start + Math.floor(rand() * 1460) * 86_400_000).toISOString().slice(0, 10),
        note: `note ${i % 300}`,
        cat: rand() < 0.1 ? null : 1 + Math.floor(rand() * (SYSTEM.length + 1)),
        rec: rand() < 0.05 ? 1 : 0,
      };
      if (i % 2 === 0) {
        insertTxDefaultTimes.run(row);
      } else {
        insertTx.run({
          ...row,
          batch: i % 97 === 0 ? 1 : null,
          created: '2026-04-01T12:00:00.000Z',
          deleted: i % 31 === 0 ? '2026-09-11' : null,
        });
      }
    }
  })();
  return sqlite;
}

interface Fingerprint {
  counts: Record<string, number>;
  liveSum: number;
  categoryIdSum: number;
  uncategorised: number;
  budgetsLive: number;
}

function fingerprint(sqlite: Database.Database): Fingerprint {
  const one = <T>(sql: string) => sqlite.prepare(sql).get() as T;
  const counts: Record<string, number> = {};
  for (const t of ['categories', 'transactions', 'budgets', 'subscriptions', 'import_batches', 'app_meta']) {
    counts[t] = one<{ n: number }>(`SELECT count(*) AS n FROM ${t}`).n;
  }
  return {
    counts,
    liveSum: one<{ v: number }>('SELECT sum(amount_paise) AS v FROM transactions WHERE deleted_at IS NULL').v,
    categoryIdSum: one<{ v: number }>('SELECT total(category_id) AS v FROM transactions').v,
    uncategorised: one<{ v: number }>('SELECT count(*) AS v FROM transactions WHERE category_id IS NULL').v,
    budgetsLive: one<{ v: number }>('SELECT count(*) AS v FROM budgets WHERE deleted_at IS NULL').v,
  };
}

describe('migrations 0001–0008 on a populated 0000 database', () => {
  let sqlite: Database.Database;
  let before: Fingerprint;

  beforeAll(async () => {
    sqlite = await legacyDatabase();
    before = fingerprint(sqlite);
    await migrateSafely(sqlite);
    sqlite.pragma('foreign_keys = ON');
  }, 120_000);

  afterAll(() => sqlite?.close());

  it('keeps every row, total and category assignment', () => {
    expect(fingerprint(sqlite)).toEqual(before);
  });

  it('leaves no foreign key violations', () => {
    expect(sqlite.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  });

  it('gives every row a unique, non-null uid', () => {
    for (const t of ['categories', 'transactions', 'budgets', 'subscriptions', 'import_batches']) {
      const r = sqlite.prepare(`SELECT count(*) AS n, count(DISTINCT uid) AS d, count(uid) AS nn FROM ${t}`).get() as {
        n: number;
        d: number;
        nn: number;
      };
      expect(r.nn).toBe(r.n);
      expect(r.d).toBe(r.n);
    }
  });

  it('gives system categories fixed sys: uids and the agreed kind', () => {
    const rows = sqlite.prepare('SELECT name, uid, kind FROM categories WHERE is_system = 1 ORDER BY name').all() as {
      name: string;
      uid: string;
      kind: string;
    }[];
    expect(rows).toHaveLength(SYSTEM.length);
    const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
    expect(byName.Rent).toMatchObject({ uid: 'sys:rent', kind: 'expense' });
    expect(byName.Salary).toMatchObject({ uid: 'sys:salary', kind: 'income' });
    expect(byName['Other Income']!.kind).toBe('income');
    expect(byName.Investments!.kind).toBe('both');
    expect(byName.Miscellaneous!.kind).toBe('both');
    const coffee = sqlite.prepare("SELECT kind, uid FROM categories WHERE name = 'Coffee'").get() as {
      kind: string;
      uid: string;
    };
    expect(coffee.kind).toBe('both');
    expect(coffee.uid).toMatch(/^[0-9a-f]{32}$/);
  });

  it('converts every timestamp to the one ISO format', () => {
    const columns: Record<string, string[]> = {
      categories: ['created_at', 'deleted_at'],
      import_batches: ['created_at', 'undone_at'],
      transactions: ['created_at', 'updated_at', 'deleted_at'],
      budgets: ['created_at', 'deleted_at'],
      subscriptions: ['created_at', 'deleted_at'],
      app_meta: ['updated_at'],
    };
    const iso = "'[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9].[0-9][0-9][0-9]Z'";
    for (const [table, cols] of Object.entries(columns)) {
      for (const c of cols) {
        const bad = sqlite
          .prepare(`SELECT count(*) AS n FROM ${table} WHERE ${c} IS NOT NULL AND ${c} NOT GLOB ${iso}`)
          .get() as { n: number };
        expect({ table, c, bad: bad.n }).toEqual({ table, c, bad: 0 });
      }
    }
  });

  it('writes the new default in the same format', () => {
    sqlite.prepare("INSERT INTO categories (name) VALUES ('Fresh default')").run();
    const r = sqlite.prepare("SELECT created_at FROM categories WHERE name = 'Fresh default'").get() as {
      created_at: string;
    };
    expect(r.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('drops is_recurring and derives month from date', () => {
    const cols = (
      sqlite.prepare("SELECT name FROM pragma_table_xinfo('transactions')").all() as { name: string }[]
    ).map((c) => c.name);
    expect(cols).not.toContain('is_recurring');
    expect(cols).toContain('month');
    const mismatched = sqlite
      .prepare('SELECT count(*) AS n FROM transactions WHERE month IS NOT substr(date, 1, 7)')
      .get() as { n: number };
    expect(mismatched.n).toBe(0);
  });

  it('creates every index, and drops the old tx_date_idx', () => {
    const names = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'tx_ledger_idx',
        'tx_month_idx',
        'tx_cat_idx',
        'tx_batch_idx',
        'tx_dedupe_idx',
        'tx_uid_unique',
        'cat_name_unique',
        'cat_uid_unique',
        'budget_cat_unique',
        'budget_uid_unique',
        'sub_status_idx',
        'sub_uid_unique',
        'batch_uid_unique',
      ]),
    );
    expect(names).not.toContain('tx_date_idx');
  });

  it('[0007] creates the Groups tables and their indexes', () => {
    const tables = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]
    ).map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining([
        'people',
        'split_groups',
        'group_members',
        'split_expenses',
        'split_expense_payers',
        'split_expense_shares',
        'split_debts',
        'settlements',
      ]),
    );
    const names = (
      sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all() as { name: string }[]
    ).map((r) => r.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'people_self_unique',
        'split_group_direct_unique',
        'group_member_unique',
        'split_expense_group_idx',
        'split_debt_group_idx',
        'settlement_group_idx',
      ]),
    );
  });

  it('[0008] seeds exactly one "You", and the partial index refuses a second', () => {
    const selves = sqlite.prepare('SELECT uid, name FROM people WHERE is_self = 1').all();
    expect(selves).toEqual([{ uid: 'sys:self', name: 'You' }]);
    expect(() => sqlite.prepare("INSERT INTO people (name, is_self) VALUES ('Also me', 1)").run()).toThrow(/UNIQUE/i);
    expect(() => sqlite.prepare("INSERT INTO people (name) VALUES ('Rahul')").run()).not.toThrow();
  });

  it('[0007] leaves the ledger untouched — groups never write transactions', () => {
    expect(fingerprint(sqlite).counts.transactions).toBe(before.counts.transactions);
  });

  it('records every migration as applied', () => {
    const last = lastAppliedMillis(connectionOf(sqlite));
    expect(pendingMigrations(journal(), last)).toEqual([]);
  });
});

describe('why boot turns foreign keys off before migrating', () => {
  it('migrating with foreign keys ON silently deletes budgets and uncategorises transactions', async () => {
    const sqlite = await legacyDatabase();
    const before = fingerprint(sqlite);
    migrateWithForeignKeysOn(sqlite);
    const after = fingerprint(sqlite);
    // The rebuild of `categories` runs an implicit DELETE FROM categories inside
    // the migration transaction, where PRAGMA foreign_keys=OFF is ignored.
    expect(after.budgetsLive).toBeLessThan(before.budgetsLive);
    expect(after.uncategorised).toBeGreaterThan(before.uncategorised);
    sqlite.close();
  }, 120_000);
});

describe('pending detection and snapshot retention', () => {
  const entries = [
    { idx: 0, when: 100, tag: 'a' },
    { idx: 1, when: 200, tag: 'b' },
    { idx: 2, when: 300, tag: 'c' },
  ];

  it('treats a never-migrated database as all pending', () => {
    expect(pendingMigrations(entries, null)).toHaveLength(3);
  });

  it('matches drizzle: pending means newer than the last applied', () => {
    expect(pendingMigrations(entries, 200).map((e) => e.tag)).toEqual(['c']);
    expect(pendingMigrations(entries, 300)).toEqual([]);
  });

  it('reads the last applied migration, or null before the table exists', async () => {
    const sqlite = new Database(':memory:');
    expect(lastAppliedMillis(connectionOf(sqlite))).toBeNull();
    await migrateSafely(sqlite, 1);
    expect(lastAppliedMillis(connectionOf(sqlite))).toBe(journal()[1]!.when);
    sqlite.close();
  });

  it('names snapshots so they sort chronologically, and keeps the newest two', () => {
    const a = snapshotName(4, new Date('2026-09-14T10:11:12.345Z'));
    expect(a).toBe('pre-migration-0004-20260914T101112.db');
    const names = [
      'pre-migration-0005-20260920T000000.db',
      'spendwise.db',
      'pre-migration-0003-20260901T000000.db',
      'pre-migration-0004-20260914T101112.db',
    ];
    expect(snapshotsToDelete(names)).toEqual(['pre-migration-0003-20260901T000000.db']);
    expect(snapshotsToDelete(names.slice(0, 2))).toEqual([]);
  });

  // B27: every share from the boot-failure screen left a whole database behind.
  it('prunes share copies to the newest, taking each copy’s -wal with it', () => {
    const names = [
      'spendwise-share-20260919T101500.db',
      'spendwise-share-20260919T100000.db',
      'spendwise-share-20260919T100000.db-wal',
      'spendwise-share-20260918T090000.db',
      'spendwise-unreadable-20260918T090000.db',
      'spendwise-unreadable-20260918T090000.db-wal',
    ];
    expect(shareCopiesToDelete(names, 1).sort()).toEqual([
      'spendwise-share-20260918T090000.db',
      'spendwise-share-20260919T100000.db',
      'spendwise-share-20260919T100000.db-wal',
    ]);
    // At a successful boot every share copy goes, but never a database moved aside by "Start fresh".
    expect(shareCopiesToDelete(names, 0)).toHaveLength(4);
    expect(shareCopiesToDelete(names, 0).every((n) => n.startsWith(SHARE_PREFIX))).toBe(true);
    expect(shareCopiesToDelete(names, 5)).toEqual([]);
  });
});
