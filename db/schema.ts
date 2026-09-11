import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * SpendWise local schema — the single source of truth for every type in the app.
 *
 * Three rules govern this file (CLAUDE.md conventions #2 and #3):
 *
 *  1. MONEY IS AN INTEGER. SQLite has no decimal type; anything decimal-shaped
 *     is stored as REAL, and floats lose money as one-paise drift that surfaces
 *     months later in a total that will not reconcile. Every amount is paise.
 *
 *  2. DATES ARE TEXT, 'YYYY-MM-DD'. SQLite has no date type either. Text dates
 *     sort lexicographically, group with substr(date,1,7) for months, and are
 *     unambiguous across timezones.
 *
 *  3. SOFT DELETE via deleted_at. It powers undo on swipe-delete and undo on a
 *     whole import batch. Every read filters `isNull(deletedAt)`.
 *
 * There is no user_id anywhere: one database, one person, one device.
 */

// ---------------------------------------------------------------------------
// categories
// ---------------------------------------------------------------------------

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    icon: text('icon'),
    color: text('color'),
    /** Seeded on first launch; system rows are protected from deletion. */
    isSystem: integer('is_system', { mode: 'boolean' }).notNull().default(false),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    // Case-insensitive uniqueness: the importer will otherwise happily create
    // "Food" alongside "food" from two different spreadsheets.
    uniqueIndex('cat_name_unique').on(sql`lower(${t.name})`),
  ],
);

// ---------------------------------------------------------------------------
// import_batches — every import is one undoable unit
// ---------------------------------------------------------------------------

export const importBatches = sqliteTable('import_batches', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sourceName: text('source_name').notNull(),
  rowsImported: integer('rows_imported').notNull().default(0),
  rowsSkipped: integer('rows_skipped').notNull().default(0),
  rowsDuplicate: integer('rows_duplicate').notNull().default(0),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
  /** Set when the whole batch is undone. */
  undoneAt: text('undone_at'),
});

// ---------------------------------------------------------------------------
// transactions — the ledger
// ---------------------------------------------------------------------------

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    type: text('type', { enum: ['expense', 'income'] }).notNull(),
    /** Integer paise. NEVER a float. ₹1,245.50 is stored as 124550. */
    amountPaise: integer('amount_paise').notNull(),
    /** 'YYYY-MM-DD'. */
    date: text('date').notNull(),
    note: text('note'),
    categoryId: integer('category_id').references(() => categories.id, {
      onDelete: 'set null',
    }),
    isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
    importBatchId: integer('import_batch_id').references(() => importBatches.id, {
      onDelete: 'set null',
    }),
    /**
     * Stable hash of (date · amountPaise · normalised note), written on insert.
     * Lets the importer detect duplicates against the existing ledger with one
     * indexed query instead of a table scan per candidate row.
     */
    dedupeHash: text('dedupe_hash'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
  },
  (t) => [
    // The index every ledger read and every analytics aggregate depends on.
    index('tx_date_idx').on(t.date, t.deletedAt),
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
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
  },
  (t) => [uniqueIndex('budget_cat_unique').on(t.categoryId)],
);

// ---------------------------------------------------------------------------
// subscriptions — the Tracker
// ---------------------------------------------------------------------------

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
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
    createdAt: text('created_at')
      .notNull()
      .default(sql`(CURRENT_TIMESTAMP)`),
    deletedAt: text('deleted_at'),
  },
  (t) => [index('sub_status_idx').on(t.status, t.deletedAt)],
);

// ---------------------------------------------------------------------------
// app_meta — one row, read at launch
// ---------------------------------------------------------------------------

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(CURRENT_TIMESTAMP)`),
});

/** Well-known app_meta keys. Kept as a const so typos are compile errors. */
export const META_KEYS = {
  SCHEMA_VERSION: 'schema_version',
  SEEDED_AT: 'seeded_at',
  LAST_BACKUP_AT: 'last_backup_at',
} as const;

// ---------------------------------------------------------------------------
// Inferred types — import these, never redeclare a row shape by hand.
// ---------------------------------------------------------------------------

export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;

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
