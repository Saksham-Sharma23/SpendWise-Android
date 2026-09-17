import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * SpendWise local schema — the single source of truth for every type in the app.
 *
 * Rules this file follows (CLAUDE.md conventions #2, #3, #13):
 *
 *  1. MONEY IS AN INTEGER. SQLite has no decimal type; anything decimal-shaped
 *     is stored as REAL, and floats lose money as one-paise drift that surfaces
 *     months later in a total that will not reconcile. Every amount is paise.
 *
 *  2. DATES ARE TEXT, 'YYYY-MM-DD'. Text dates sort lexicographically, group
 *     with substr(date,1,7) for months, and are unambiguous across timezones.
 *
 *  3. TIMESTAMPS ARE TEXT in ONE format: `YYYY-MM-DDTHH:MM:SS.sssZ`, exactly
 *     what `toISOString()` / `nowISO()` produce. The column default below
 *     produces the same string, so SQLite-written and app-written timestamps
 *     compare correctly. (`CURRENT_TIMESTAMP` gave `YYYY-MM-DD HH:MM:SS`, and a
 *     space sorts before `T`.)
 *
 *  4. SOFT DELETE via deleted_at. Unique indexes are PARTIAL
 *     (`WHERE deleted_at IS NULL`) so a deleted row never blocks re-creating it.
 *
 *  5. Every user-data row has a stable `uid`. Autoincrement ids do not survive
 *     a JSON export → restore into a fresh database; `uid` does, which is what
 *     Phase 6B's sheet links and Phase 7's restore key on.
 *
 * There is no user_id anywhere: one database, one person, one device.
 */

/** `2026-09-14T10:11:12.345Z` — identical to `new Date().toISOString()`. */
const nowDefault = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** 32 random hex chars, generated per row by SQLite — so table rebuilds backfill it too. */
const uidDefault = sql`(lower(hex(randomblob(16))))`;

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** Stable identity. System categories use fixed `sys:…` uids (db/seed.ts). */
    uid: text('uid').notNull().default(uidDefault),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    /**
     * Which form offers this category. 'both' is the default so a category the
     * user creates is never hidden from either type.
     */
    kind: text('kind', { enum: ['expense', 'income', 'both'] })
      .notNull()
      .default('both'),
    /** Seeded on first launch; system rows are protected from deletion. */
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(nowDefault),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('cat_uid_unique').on(t.uid),
    // cat_name_unique — unique lower(name) among LIVE categories — is created by the
    // custom migration 0006, NOT declared here: drizzle-kit (0.31) emits a partial
    // expression index as `lower("name")` in backticks, which SQLite reads as a
    // column name. Any future drizzle-generated rebuild of `categories` drops it;
    // db/__tests__/migrations.test.ts asserts it exists so that cannot go unnoticed.
  ],
);

// ---------------------------------------------------------------------------
// import_batches — every import is one undoable unit
// ---------------------------------------------------------------------------

export const importBatches = sqliteTable(
  'import_batches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().default(uidDefault),
    sourceName: text('source_name').notNull(),
    rowsImported: integer('rows_imported').notNull().default(0),
    rowsSkipped: integer('rows_skipped').notNull().default(0),
    rowsDuplicate: integer('rows_duplicate').notNull().default(0),
    createdAt: text('created_at').notNull().default(nowDefault),
    /** Set when the whole batch is undone. */
    undoneAt: text('undone_at'),
  },
  (t) => [uniqueIndex('batch_uid_unique').on(t.uid)],
);

// ---------------------------------------------------------------------------
// transactions — the ledger
// ---------------------------------------------------------------------------

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().default(uidDefault),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    /** Integer paise. NEVER a float. ₹1,245.50 is stored as 124550. */
    amountPaise: integer('amount_paise').notNull(),
    /** 'YYYY-MM-DD'. */
    date: text('date').notNull(),
    /**
     * 'YYYY-MM', derived by SQLite (VIRTUAL: computed on read, costs no storage).
     * Exists so month aggregates can use a plain column index — drizzle-kit
     * cannot emit an expression index containing commas like substr(date,1,7).
     * Never written by app code.
     *
     * ⚠️ drizzle-kit bug (0.31): when it REBUILDS this table it copies generated
     * columns in its INSERT … SELECT, which SQLite rejects. Migration 0005 adds
     * `month` after the last rebuild for that reason. If a future schema change
     * makes drizzle-kit rebuild `transactions`, split it: drop `month` + its index,
     * generate, then add them back. db/__tests__/migrations.test.ts fails loudly
     * if this is forgotten.
     */
    month: text('month').generatedAlwaysAs(sql`substr(date, 1, 7)`, { mode: 'virtual' }),
    note: text('note'),
    categoryId: integer('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    importBatchId: integer('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    /**
     * Stable hash of (date · amountPaise · normalised note), written on insert.
     * Lets the importer detect duplicates against the existing ledger with one
     * indexed query instead of a table scan per candidate row.
     */
    dedupeHash: text('dedupe_hash'),
    createdAt: text('created_at').notNull().default(nowDefault),
    updatedAt: text('updated_at').notNull().default(nowDefault),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('tx_uid_unique').on(t.uid),
    // The ledger page. Partial, and on `date` alone: the index's implicit rowid
    // makes it exactly `ORDER BY date DESC, id DESC`, so keyset pages
    // `(date, id) < (?, ?)` are a range scan with no sort step. Queries must
    // include `deleted_at IS NULL` for SQLite to pick a partial index.
    index('tx_ledger_idx')
      .on(t.date)
      .where(sql`deleted_at IS NULL`),
    // Month aggregates (trend, summaries). Ordered by month, so `GROUP BY month`
    // needs no temporary B-tree (200k rows: 146 ms → 33 ms in Node). SQLite does
    // not treat an index on a VIRTUAL column as covering, so rows are still read.
    // Queries must filter and group on `month` (not substr(date,…)) to use it.
    index('tx_month_idx')
      .on(t.month, t.type, t.amountPaise)
      .where(sql`deleted_at IS NULL`),
    index('tx_cat_idx').on(t.categoryId, t.date),
    index('tx_batch_idx').on(t.importBatchId),
    index('tx_dedupe_idx').on(t.dedupeHash),
  ],
);

// ---------------------------------------------------------------------------
// budgets
// ---------------------------------------------------------------------------

export const budgets = sqliteTable(
  'budgets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().default(uidDefault),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    /** Integer paise, same rule as transactions. */
    limitPaise: integer('limit_paise').notNull(),
    /**
     * Day of month the cycle restarts, 1–31. A budget resetting on the 15th
     * spans two calendar months — the cycle window is computed in TypeScript
     * (lib/dates.ts) and passed to SQL as bound parameters.
     */
    resetDay: integer('reset_day').notNull().default(1),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull().default(nowDefault),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('budget_uid_unique').on(t.uid),
    // One LIVE budget per category; a deleted budget never blocks a new one.
    uniqueIndex('budget_cat_unique')
      .on(t.categoryId)
      .where(sql`deleted_at IS NULL`),
  ],
);

// ---------------------------------------------------------------------------
// subscriptions — the Tracker
// ---------------------------------------------------------------------------

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().default(uidDefault),
    name: text('name').notNull(),
    amountPaise: integer('amount_paise').notNull(),
    billingCycle: text('billing_cycle', {
      enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
    }).notNull(),
    status: text('status', { enum: ['active', 'paused', 'cancelled'] })
      .notNull()
      .default('active'),
    /**
     * Renewal is computed on read, never stored — advance anchorDate by the
     * billing cycle until >= today, clamping to month end. Self-correcting,
     * so no background job is needed. Ported from the web app's `_enrich`.
     */
    anchorDate: text('anchor_date').notNull(),
    categoryId: integer('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    reminderDaysBefore: integer('reminder_days_before').notNull().default(2),
    createdAt: text('created_at').notNull().default(nowDefault),
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('sub_uid_unique').on(t.uid), index('sub_status_idx').on(t.status, t.deletedAt)],
);

// ---------------------------------------------------------------------------
// Groups — split expenses with friends (features/groups)
//
// Kept entirely separate from the ledger (decided 2026-09-15): nothing here
// creates a transaction or counts toward budgets or analytics.
//
// Balances are never stored. A person's net in a group is derived on read:
//   paid (split_expense_payers) − owed (split_expense_shares)
//   + settlements they sent − settlements they received.
// `split_debts` is the one derived table, rewritten with its expense in one
// transaction, so pairwise "who owes whom" is a GROUP BY rather than a read of
// every expense. `groups` is avoided as a name: GROUPS is an SQLite keyword.
// ---------------------------------------------------------------------------

/** Friends, and exactly one row for you (`is_self`, uid `sys:self`, seeded by migration 0008). */
export const people = sqliteTable(
  'people',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().default(uidDefault),
    name: text('name').notNull(),
    isSelf: integer('is_self', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at').notNull().default(nowDefault),
    updatedAt: text('updated_at').notNull().default(nowDefault),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('people_uid_unique').on(t.uid),
    // Exactly one "you".
    uniqueIndex('people_self_unique')
      .on(t.isSelf)
      .where(sql`is_self = 1`),
  ],
);

export const splitGroups = sqliteTable(
  'split_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().default(uidDefault),
    name: text('name').notNull(),
    /** A CategoryIcon name; null falls back to the deterministic icon for the name. */
    icon: text('icon'),
    /** "Simplify group debts": suggest the fewest payments instead of pairwise paybacks. */
    simplifyDebts: integer('simplify_debts', { mode: 'boolean' }).notNull().default(true),
    /**
     * Set only on the hidden group behind a 1:1 friendship ({you, this person}),
     * so expenses outside any group use exactly the same balance code.
     */
    directPersonId: integer('direct_person_id').references(() => people.id),
    createdAt: text('created_at').notNull().default(nowDefault),
    updatedAt: text('updated_at').notNull().default(nowDefault),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('split_group_uid_unique').on(t.uid),
    // One live direct group per friend.
    uniqueIndex('split_group_direct_unique')
      .on(t.directPersonId)
      .where(sql`deleted_at IS NULL AND direct_person_id IS NOT NULL`),
  ],
);

export const groupMembers = sqliteTable(
  'group_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    groupId: integer('group_id')
      .notNull()
      .references(() => splitGroups.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id),
    createdAt: text('created_at').notNull().default(nowDefault),
    /** Removed from the group — only allowed once their balance there is zero. */
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('group_member_unique')
      .on(t.groupId, t.personId)
      .where(sql`deleted_at IS NULL`),
    index('group_member_person_idx').on(t.personId),
  ],
);

export const splitExpenses = sqliteTable(
  'split_expenses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().default(uidDefault),
    groupId: integer('group_id')
      .notNull()
      .references(() => splitGroups.id, { onDelete: 'cascade' }),
    description: text('description').notNull(),
    /** Integer paise, same rule as the ledger. Equals the payers' sum and the shares' sum. */
    amountPaise: integer('amount_paise').notNull(),
    /** 'YYYY-MM-DD'. */
    date: text('date').notNull(),
    /** Used only for the group's category breakdown — never touches the ledger. */
    categoryId: integer('category_id').references(() => categories.id, { onDelete: 'set null' }),
    splitMethod: text('split_method', { enum: ['equal', 'exact', 'percent', 'shares'] }).notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull().default(nowDefault),
    updatedAt: text('updated_at').notNull().default(nowDefault),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('split_expense_uid_unique').on(t.uid),
    index('split_expense_group_idx')
      .on(t.groupId, t.date)
      .where(sql`deleted_at IS NULL`),
  ],
);

/** Who paid for an expense, and how much. Replaced wholesale when the expense is edited. */
export const splitExpensePayers = sqliteTable(
  'split_expense_payers',
  {
    expenseId: integer('expense_id')
      .notNull()
      .references(() => splitExpenses.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id),
    paidPaise: integer('paid_paise').notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.personId] }), index('split_payer_person_idx').on(t.personId)],
);

/** What each participant owes for an expense. Replaced wholesale when the expense is edited. */
export const splitExpenseShares = sqliteTable(
  'split_expense_shares',
  {
    expenseId: integer('expense_id')
      .notNull()
      .references(() => splitExpenses.id, { onDelete: 'cascade' }),
    personId: integer('person_id')
      .notNull()
      .references(() => people.id),
    owedPaise: integer('owed_paise').notNull(),
    /**
     * What was typed, so the edit form rebuilds exactly: basis points for a
     * percent split, units for shares, paise for exact. Null for equal.
     */
    input: integer('input'),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.personId] }), index('split_share_person_idx').on(t.personId)],
);

/** DERIVED from payers + shares (features/groups/debts.ts `expenseDebts`); never edited directly. */
export const splitDebts = sqliteTable(
  'split_debts',
  {
    expenseId: integer('expense_id')
      .notNull()
      .references(() => splitExpenses.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => splitGroups.id, { onDelete: 'cascade' }),
    debtorId: integer('debtor_id')
      .notNull()
      .references(() => people.id),
    creditorId: integer('creditor_id')
      .notNull()
      .references(() => people.id),
    amountPaise: integer('amount_paise').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.debtorId, t.creditorId] }),
    index('split_debt_group_idx').on(t.groupId),
  ],
);

/** A payment between two members that settles (part of) a balance. */
export const settlements = sqliteTable(
  'settlements',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    uid: text('uid').notNull().default(uidDefault),
    groupId: integer('group_id')
      .notNull()
      .references(() => splitGroups.id, { onDelete: 'cascade' }),
    fromPersonId: integer('from_person_id')
      .notNull()
      .references(() => people.id),
    toPersonId: integer('to_person_id')
      .notNull()
      .references(() => people.id),
    amountPaise: integer('amount_paise').notNull(),
    date: text('date').notNull(),
    note: text('note'),
    createdAt: text('created_at').notNull().default(nowDefault),
    updatedAt: text('updated_at').notNull().default(nowDefault),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    uniqueIndex('settlement_uid_unique').on(t.uid),
    index('settlement_group_idx')
      .on(t.groupId, t.date)
      .where(sql`deleted_at IS NULL`),
  ],
);

// ---------------------------------------------------------------------------
// app_meta — one row per key, read at launch
// ---------------------------------------------------------------------------

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at').notNull().default(nowDefault),
});

/** Well-known app_meta keys. Kept as a const so typos are compile errors. */
export const META_KEYS = {
  SCHEMA_VERSION: 'schema_version',
  SEEDED_AT: 'seeded_at',
  /** Version of the system-category set last reconciled (db/seed.ts). */
  SEED_VERSION: 'seed_version',
  LAST_BACKUP_AT: 'last_backup_at',
  /** '1' once the user dismisses first-run onboarding on Home. */
  ONBOARDING_DISMISSED: 'onboarding_dismissed',
  /**
   * Set when `foreign_key_check` failed after a migration committed, cleared
   * when a later launch finds the database clean again (B8).
   *
   * Drizzle commits all pending migrations in one transaction, so the check
   * necessarily runs AFTER the commit. Without this key the failure screen
   * appeared once and the next launch — finding nothing pending — opened
   * normally onto the broken data, for ever.
   */
  INTEGRITY_FAILED: 'integrity_failed',
} as const;

// ---------------------------------------------------------------------------
// Inferred types — import these, never redeclare a row shape by hand.
// ---------------------------------------------------------------------------

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type CategoryKind = Category['kind'];

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;

export type Person = typeof people.$inferSelect;
export type SplitGroup = typeof splitGroups.$inferSelect;
export type SplitExpense = typeof splitExpenses.$inferSelect;
export type SplitMethod = SplitExpense['splitMethod'];
export type Settlement = typeof settlements.$inferSelect;

export type TransactionType = Transaction['type'];
export type BillingCycle = Subscription['billingCycle'];
export type SubscriptionStatus = Subscription['status'];
