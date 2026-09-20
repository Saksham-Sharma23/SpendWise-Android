import type Database from 'better-sqlite3';

import { buildBackupJson, countRows, restoreJsonInto, type BackupReader, type BackupWriter } from '../backup/json';
import { exportSql, importSql, rowKeys, TABLE_SPECS } from '../backup/tables';
import {
  backupFileName,
  backupsToDelete,
  describeStamp,
  formatOf,
  isBackupName,
  kindOf,
  preRestoreName,
  safeName,
  stampOf,
} from '../backup/naming';
import { checkMigrationIndex, compareCounts, describeBackup, isFatal, parseBackupJson } from '../backup/validate';
import { appliedMigrationIdx, bundledMigrationIdx } from '../backup/version';
import type { JournalEntry } from '../migrate';
import { freshDb, journal } from './support';

/**
 * Backup and restore, run against the REAL migrated schema (CLAUDE.md #18).
 *
 * These are the tests that matter most in the project, because they cover the
 * one failure nobody can undo. The exit criterion on the phone is still
 * populate → export → uninstall → reinstall → restore; this is what makes that
 * drill likely to pass the first time.
 */

function readerOf(sqlite: Database.Database): BackupReader {
  return { all: <T>(sql: string, params: readonly unknown[] = []) => sqlite.prepare(sql).all(...params) as T[] };
}

function writerOf(sqlite: Database.Database): BackupWriter {
  return {
    exec: (sql) => void sqlite.exec(sql),
    run: (sql, params = []) => void sqlite.prepare(sql).run(...params),
    all: <T>(sql: string, params: readonly unknown[] = []) => sqlite.prepare(sql).all(...params) as T[],
  };
}

/**
 * A database with something of every shape in it: a soft-deleted row, a null
 * foreign key, an import batch, a budget, a subscription, and a group with two
 * payers, uneven shares, the derived debt and a settlement.
 */
function populate(sqlite: Database.Database): void {
  sqlite.exec(`
    INSERT INTO categories (uid, name, icon, color, kind, is_system) VALUES
      ('sys:food', 'Food', 'utensils', '#f97316', 'expense', 1),
      ('cat-salary', 'Salary', 'wallet', '#22c55e', 'income', 0),
      ('cat-gone', 'Old', null, null, 'both', 0);
    UPDATE categories SET deleted_at = '2026-01-02T03:04:05.000Z' WHERE uid = 'cat-gone';

    -- sys:self is already here: migration 0008 inserts it, and both
    -- people_uid_unique and people_self_unique would reject a second one.
    INSERT INTO people (uid, name, is_self) VALUES ('p-ana', 'Ana', 0), ('p-bo', 'Bo', 0);

    INSERT INTO import_batches (uid, source_name, rows_imported, rows_skipped, rows_duplicate)
      VALUES ('batch-1', 'march.csv', 2, 0, 1);

    INSERT INTO transactions (uid, type, amount_paise, date, note, category_id, import_batch_id, dedupe_hash)
      VALUES
      ('tx-1', 'expense', 124550, '2026-03-04', 'Lunch', (SELECT id FROM categories WHERE uid='sys:food'),
        (SELECT id FROM import_batches WHERE uid='batch-1'), 'h1'),
      ('tx-2', 'income', 5000000, '2026-03-01', 'March pay', (SELECT id FROM categories WHERE uid='cat-salary'), null, null),
      ('tx-3', 'expense', 999, '2026-03-05', 'Uncategorised', null, null, null);
    UPDATE transactions SET deleted_at = '2026-03-06T00:00:00.000Z' WHERE uid = 'tx-3';

    INSERT INTO budgets (uid, category_id, limit_paise, reset_day)
      VALUES ('b-1', (SELECT id FROM categories WHERE uid='sys:food'), 2000000, 5);

    INSERT INTO subscriptions (uid, name, amount_paise, billing_cycle, status, anchor_date, category_id)
      VALUES ('sub-1', 'Music', 19900, 'monthly', 'active', '2026-01-11',
        (SELECT id FROM categories WHERE uid='sys:food'));

    INSERT INTO split_groups (uid, name, icon, simplify_debts) VALUES ('g-1', 'Trip', 'plane', 1);
    INSERT INTO group_members (group_id, person_id) VALUES
      ((SELECT id FROM split_groups WHERE uid='g-1'), (SELECT id FROM people WHERE uid='sys:self')),
      ((SELECT id FROM split_groups WHERE uid='g-1'), (SELECT id FROM people WHERE uid='p-ana')),
      ((SELECT id FROM split_groups WHERE uid='g-1'), (SELECT id FROM people WHERE uid='p-bo'));

    INSERT INTO split_expenses (uid, group_id, description, amount_paise, date, split_method)
      VALUES ('e-1', (SELECT id FROM split_groups WHERE uid='g-1'), 'Hotel', 900000, '2026-03-02', 'exact');

    INSERT INTO split_expense_payers (expense_id, person_id, paid_paise) VALUES
      ((SELECT id FROM split_expenses WHERE uid='e-1'), (SELECT id FROM people WHERE uid='sys:self'), 600000),
      ((SELECT id FROM split_expenses WHERE uid='e-1'), (SELECT id FROM people WHERE uid='p-ana'), 300000);

    INSERT INTO split_expense_shares (expense_id, person_id, owed_paise, input) VALUES
      ((SELECT id FROM split_expenses WHERE uid='e-1'), (SELECT id FROM people WHERE uid='sys:self'), 300000, 300000),
      ((SELECT id FROM split_expenses WHERE uid='e-1'), (SELECT id FROM people WHERE uid='p-ana'), 300000, 300000),
      ((SELECT id FROM split_expenses WHERE uid='e-1'), (SELECT id FROM people WHERE uid='p-bo'), 300000, 300000);

    INSERT INTO split_debts (expense_id, group_id, debtor_id, creditor_id, amount_paise) VALUES
      ((SELECT id FROM split_expenses WHERE uid='e-1'), (SELECT id FROM split_groups WHERE uid='g-1'),
       (SELECT id FROM people WHERE uid='p-bo'), (SELECT id FROM people WHERE uid='sys:self'), 300000);

    INSERT INTO settlements (uid, group_id, from_person_id, to_person_id, amount_paise, date, note)
      VALUES ('s-1', (SELECT id FROM split_groups WHERE uid='g-1'), (SELECT id FROM people WHERE uid='p-bo'),
        (SELECT id FROM people WHERE uid='sys:self'), 100000, '2026-03-09', 'UPI');
  `);
}

describe('backup SQL', () => {
  it('never exports an id, and never writes the generated month column', () => {
    for (const spec of TABLE_SPECS) {
      const keys = rowKeys(spec);
      expect(keys).not.toContain('id');
      expect(keys).not.toContain('month');
      expect(importSql(spec)).not.toMatch(/"(id|month)"/);
    }
  });

  it('exports each foreign key as the uid of the row it points at', () => {
    const transactions = TABLE_SPECS.find((s) => s.name === 'transactions')!;
    const sql = exportSql(transactions);
    expect(sql).toContain('r0.uid AS "category"');
    expect(sql).toContain('LEFT JOIN "categories" r0 ON r0.id = t."category_id"');
    expect(importSql(transactions)).toContain('(SELECT id FROM "categories" WHERE uid = ?)');
  });

  it('lists every parent before the children that point at it', () => {
    const seen = new Set<string>();
    for (const spec of TABLE_SPECS) {
      for (const r of spec.refs) expect(seen.has(r.table) || r.table === spec.name).toBe(true);
      seen.add(spec.name);
    }
  });
});

describe('json round trip', () => {
  it('restores every row, every reference and every paise into a fresh database', async () => {
    const source = await freshDb();
    populate(source.sqlite);

    const payload = await buildBackupJson(readerOf(source.sqlite), { schemaMigrationIdx: 8 });

    const target = await freshDb();
    restoreJsonInto(writerOf(target.sqlite), payload);

    // Same number of rows in every table.
    expect(countRows(writerOf(target.sqlite))).toEqual(countRows(writerOf(source.sqlite)));

    // Same money, table by table — the figure a person would check.
    for (const [table, column] of [
      ['transactions', 'amount_paise'],
      ['budgets', 'limit_paise'],
      ['subscriptions', 'amount_paise'],
      ['split_expenses', 'amount_paise'],
      ['split_expense_payers', 'paid_paise'],
      ['split_expense_shares', 'owed_paise'],
      ['split_debts', 'amount_paise'],
      ['settlements', 'amount_paise'],
    ] as const) {
      const sum = (s: Database.Database) =>
        (s.prepare(`SELECT coalesce(sum(${column}), 0) AS t FROM ${table}`).get() as { t: number }).t;
      expect(sum(target.sqlite)).toBe(sum(source.sqlite));
    }

    // References survived: the same transaction is under the same category,
    // by uid, although every autoincrement id is different.
    const linked = (s: Database.Database) =>
      s
        .prepare(
          `SELECT t.uid AS tx, c.uid AS cat FROM transactions t
           LEFT JOIN categories c ON c.id = t.category_id ORDER BY t.uid`,
        )
        .all();
    expect(linked(target.sqlite)).toEqual(linked(source.sqlite));

    // A soft-deleted row is still soft-deleted, not quietly revived.
    const deleted = (s: Database.Database) =>
      s.prepare(`SELECT uid FROM transactions WHERE deleted_at IS NOT NULL`).all();
    expect(deleted(target.sqlite)).toEqual([{ uid: 'tx-3' }]);

    // The group survived as a shape, not just as counts.
    const debt = target.sqlite
      .prepare(
        `SELECT d.amount_paise AS amount, dr.uid AS debtor, cr.uid AS creditor, e.uid AS expense
         FROM split_debts d
         JOIN people dr ON dr.id = d.debtor_id
         JOIN people cr ON cr.id = d.creditor_id
         JOIN split_expenses e ON e.id = d.expense_id`,
      )
      .get();
    expect(debt).toEqual({ amount: 300000, debtor: 'p-bo', creditor: 'sys:self', expense: 'e-1' });
  });

  it('replaces rows a migration seeded rather than colliding with them', async () => {
    const source = await freshDb();
    populate(source.sqlite);
    const payload = await buildBackupJson(readerOf(source.sqlite), { schemaMigrationIdx: 8 });

    const target = await freshDb();
    // Migration 0008 inserts `sys:self`; the backup carries it too.
    expect(restoreJsonInto(writerOf(target.sqlite), payload).inserted.people).toBe(3);
    expect(target.sqlite.prepare(`SELECT count(*) AS n FROM people WHERE uid = 'sys:self'`).get()).toEqual({ n: 1 });
  });

  it('changes nothing when a row points at a parent the file does not contain', async () => {
    const source = await freshDb();
    populate(source.sqlite);
    const payload = await buildBackupJson(readerOf(source.sqlite), { schemaMigrationIdx: 8 });

    // A budget whose category is not in the file. category_id is NOT NULL, so
    // the scalar subquery yields NULL and the insert must fail.
    payload.tables.budgets = [{ ...payload.tables.budgets![0]!, category: 'no-such-category' }];

    const target = await freshDb();
    populate(target.sqlite);
    const before = countRows(writerOf(target.sqlite));

    expect(() => restoreJsonInto(writerOf(target.sqlite), payload)).toThrow();
    expect(countRows(writerOf(target.sqlite))).toEqual(before);
  });
});

describe('validation refuses before it writes', () => {
  const good = () =>
    JSON.stringify({
      app: 'spendwise-android',
      format_version: 1,
      created_at: '2026-09-20T00:00:00.000Z',
      schema_migration_idx: 8,
      row_counts: Object.fromEntries(TABLE_SPECS.map((s) => [s.name, 0])),
      tables: Object.fromEntries(TABLE_SPECS.map((s) => [s.name, []])),
    });

  it('accepts a well-formed empty backup', () => {
    const { payload, problems } = parseBackupJson(good());
    expect(isFatal(problems)).toBe(false);
    expect(payload?.schema_migration_idx).toBe(8);
  });

  it('refuses a file that is not JSON, and one that is not ours', () => {
    expect(isFatal(parseBackupJson('not json at all').problems)).toBe(true);
    expect(isFatal(parseBackupJson('{"app":"something-else"}').problems)).toBe(true);
  });

  it('refuses a newer format version rather than guessing', () => {
    const newer = JSON.parse(good());
    newer.format_version = 99;
    const { problems } = parseBackupJson(JSON.stringify(newer));
    expect(isFatal(problems)).toBe(true);
    expect(problems[0]!.message).toMatch(/newer format/i);
  });

  it('catches a truncated file through its own row counts', () => {
    const cut = JSON.parse(good());
    cut.row_counts.transactions = 12;
    const { problems } = parseBackupJson(JSON.stringify(cut));
    expect(isFatal(problems)).toBe(true);
    expect(problems.some((p) => p.message.includes('transactions'))).toBe(true);
  });

  it('catches a row missing a key, and a duplicated uid', () => {
    const missing = JSON.parse(good());
    missing.tables.categories = [{ uid: 'a', name: 'A' }];
    missing.row_counts.categories = 1;
    expect(isFatal(parseBackupJson(JSON.stringify(missing)).problems)).toBe(true);

    const twice = JSON.parse(good());
    const row = Object.fromEntries(rowKeys(TABLE_SPECS[0]!).map((k) => [k, null]));
    twice.tables.categories = [
      { ...row, uid: 'a' },
      { ...row, uid: 'a' },
    ];
    twice.row_counts.categories = 2;
    const { problems } = parseBackupJson(JSON.stringify(twice));
    expect(problems.some((p) => p.message.includes('twice'))).toBe(true);
  });

  it('refuses a backup from a newer schema, and only warns about an older one', () => {
    expect(isFatal(checkMigrationIndex(9, 8))).toBe(true);
    expect(checkMigrationIndex(9, 8)[0]!.message).toMatch(/newer version/i);
    expect(isFatal(checkMigrationIndex(7, 8))).toBe(false);
    expect(checkMigrationIndex(7, 8)[0]!.severity).toBe('warning');
    expect(checkMigrationIndex(8, 8)).toEqual([]);
    expect(isFatal(checkMigrationIndex(null, 8))).toBe(true);
  });

  it('reports which table disagrees, not just that something did', () => {
    const problems = compareCounts({ transactions: 10, budgets: 2 }, { transactions: 10, budgets: 1 });
    expect(problems).toHaveLength(1);
    expect(problems[0]!.message).toContain('budgets');
  });

  it('describes a backup in records, not in bytes', () => {
    expect(describeBackup({ transactions: 1284, budgets: 6, categories: 0 })).toBe('1284 transactions · 6 budgets');
    expect(describeBackup({})).toBe('no records');
  });
});

describe('backup file names', () => {
  it('reads the format from the extension, encrypted before plain', () => {
    expect(formatOf('spendwise-20260920T171200.enc.db')).toBe('encrypted-db');
    expect(formatOf('spendwise-20260920T171200.db')).toBe('db');
    expect(formatOf('spendwise-20260920T171200.json')).toBe('json');
    expect(formatOf('holiday-photo.jpg')).toBeNull();
  });

  it('tells an export from the copies a restore made', () => {
    expect(kindOf(backupFileName('db', '20260920T171200'))).toBe('export');
    expect(kindOf(preRestoreName('20260920T171200'))).toBe('pre-restore');
    expect(stampOf(preRestoreName('20260920T171200'))).toBe('20260920T171200');
    expect(stampOf(backupFileName('encrypted-db', '20260920T171200'))).toBe('20260920T171200');
  });

  /**
   * The one that matters: the copy taken before a restore is the only way back
   * from it, and an export made afterwards must never be what deletes it.
   */
  it('prunes only exports, never a pre-restore copy, and counts each format separately', () => {
    const names = [
      backupFileName('db', '20260101T000000'),
      backupFileName('db', '20260102T000000'),
      backupFileName('db', '20260103T000000'),
      backupFileName('db', '20260104T000000'),
      backupFileName('json', '20260101T000000'),
      preRestoreName('20260101T000000'),
      preRestoreName('20260102T000000'),
      'spendwise-failed-restore-20260101T000000.db',
      'unrelated.txt',
    ];
    const doomed = backupsToDelete(names, 3);

    expect(doomed).toEqual([backupFileName('db', '20260101T000000')]);
    expect(doomed.some((n) => kindOf(n) !== 'export')).toBe(false);
    // The single readable export is not crowded out by three fresh .db files.
    expect(doomed).not.toContain(backupFileName('json', '20260101T000000'));
  });

  it('keeps everything when there is nothing to spare', () => {
    expect(backupsToDelete([backupFileName('db', '20260101T000000')], 3)).toEqual([]);
    expect(backupsToDelete([], 3)).toEqual([]);
  });

  it('only recognises its own files', () => {
    expect(isBackupName(backupFileName('db', '20260101T000000'))).toBe(true);
    expect(isBackupName('someone-elses.db')).toBe(false);
    expect(isBackupName('spendwise-notes.txt')).toBe(false);
  });

  it('makes a picked file name safe without losing its extension', () => {
    expect(safeName('../../etc/passwd', 'X')).not.toContain('/');
    expect(safeName('my backup (1).db', 'X')).toBe('my backup _1_.db');
    expect(safeName('', 'STAMP')).toBe('picked-STAMP.db');
    expect(safeName('...', 'STAMP')).toBe('picked-STAMP.db');
  });

  it('shows a stamp as a date someone can read, and leaves anything else alone', () => {
    expect(describeStamp('20260920T171200')).toBe('20 Sep 2026, 17:12');
    expect(describeStamp('my-own-name')).toBe('my-own-name');
  });
});

describe('schema version', () => {
  const entries = () => journal() as JournalEntry[];

  it('reports the newest bundled migration', () => {
    const list = entries();
    expect(bundledMigrationIdx(list)).toBe(Math.max(...list.map((e) => e.idx)));
  });

  it('maps drizzle timestamps back to indexes, and flags one it has never seen', () => {
    const list = entries();
    const last = list[list.length - 1]!;
    expect(appliedMigrationIdx(list, null)).toBeNull();
    expect(appliedMigrationIdx(list, last.when)).toBe(last.idx);
    expect(appliedMigrationIdx(list, list[0]!.when)).toBe(list[0]!.idx);
    // A timestamp from a build with migrations this one does not ship.
    expect(appliedMigrationIdx(list, last.when + 1)).toBe(bundledMigrationIdx(list) + 1);
  });
});
