import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

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
    kind: text('kind', { enum: ['expense', 'income', 'both'] }).notNull().default('both'),
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
    index('tx_ledger_idx').on(t.date).where(sql`deleted_at IS NULL`),
    // Month aggregates (trend, summaries). Ordered by month, so `GROUP BY month`
    // needs no temporary B-tree (200k rows: 146 ms → 33 ms in Node). SQLite does
    // not treat an index on a VIRTUAL column as covering, so rows are still read.
    // Queries must filter and group on `month` (not substr(date,…)) to use it.
    index('tx_month_idx').on(t.month, t.type, t.amountPaise).where(sql`deleted_at IS NULL`),
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
    uniqueIndex('budget_cat_unique').on(t.categoryId).where(sql`deleted_at IS NULL`),
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
  (t) => [
    uniqueIndex('sub_uid_unique').on(t.uid),
    index('sub_status_idx').on(t.status, t.deletedAt),
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

export type TransactionType = Transaction['type'];
export type BillingCycle = Subscription['billingCycle'];
export type SubscriptionStatus = Subscription['status'];
