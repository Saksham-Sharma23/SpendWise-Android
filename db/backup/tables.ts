/**
 * What a JSON backup contains, table by table — and the SQL that reads it out
 * and puts it back.
 *
 * Pure string building over a fixed description of the schema, so Jest proves
 * it against the real migrated database (CLAUDE.md #18) without a phone.
 *
 * THE ONE IDEA HERE: a JSON backup never contains an autoincrement `id`.
 *
 * Ids are local to one database file. Restoring into a fresh install gives
 * every row a different id, so any foreign key exported as an id would point
 * at whatever row happened to land there — a transaction filed under a
 * stranger's category, a settlement between the wrong two people. Every row
 * therefore carries its `uid` (32 hex chars, or a fixed `sys:*`), and every
 * foreign key is exported as the TARGET ROW'S uid. Restore turns them back
 * into ids with a scalar subquery, which is why TABLE_SPECS is ordered
 * parents-first: a child can only resolve a parent that is already inserted.
 *
 * Tables with no uid of their own (`group_members`, the payer and share rows)
 * are identified entirely by their parents, which is also how the app treats
 * them — they are replaced wholesale whenever their expense is edited.
 *
 * `app_meta` is deliberately absent: it is app state, not user data — seed
 * version, onboarding, the integrity flag. Restoring someone's `seed_version`
 * into a build with newer system categories would skip the reconciliation that
 * adds them. Boot rewrites these anyway.
 *
 * `split_debts` IS exported, although it is derived from the payers and shares
 * beside it. Recomputing it on restore was the first design, and it was wrong:
 * the derivation is a real algorithm (proportional settlement with the
 * rounding remainder to the largest creditor, `features/groups/domain/debts.ts`)
 * that db/ may not import across the layer boundary, so restoring would have
 * meant a second copy of it in SQL — two implementations that must agree
 * forever, with the backup path being the one nobody exercises. Exporting the
 * rows costs a few bytes per expense and cannot disagree with itself: they
 * were written in the same transaction as the expense they belong to.
 */

export interface RefSpec {
  /** The foreign key column in this table. */
  column: string;
  /** The table it points at. Must appear EARLIER in TABLE_SPECS. */
  table: string;
  /** The key it is exported under: `category_id` → `category`. */
  as: string;
  /** Whether the column may legitimately be null (an `ON DELETE SET NULL` reference). */
  nullable: boolean;
}

export interface TableSpec {
  name: string;
  /**
   * Columns copied verbatim, in export order. Never `id` (see above), and
   * never a generated column — `transactions.month` is VIRTUAL, so SQLite
   * rejects any attempt to insert it.
   */
  columns: string[];
  refs: RefSpec[];
  /** Whether rows carry their own `uid`. False for child rows keyed by their parents. */
  keyed: boolean;
}

const ref = (column: string, table: string, as: string, nullable: boolean): RefSpec => ({
  column,
  table,
  as,
  nullable,
});

/** Parents first: restore inserts in this order and resolves each uid as it goes. */
export const TABLE_SPECS: readonly TableSpec[] = [
  {
    name: 'categories',
    columns: ['name', 'icon', 'color', 'kind', 'is_system', 'created_at', 'deleted_at'],
    refs: [],
    keyed: true,
  },
  {
    name: 'people',
    columns: ['name', 'is_self', 'created_at', 'updated_at', 'deleted_at'],
    refs: [],
    keyed: true,
  },
  {
    name: 'import_batches',
    columns: ['source_name', 'rows_imported', 'rows_skipped', 'rows_duplicate', 'created_at', 'undone_at'],
    refs: [],
    keyed: true,
  },
  {
    name: 'transactions',
    columns: ['type', 'amount_paise', 'date', 'note', 'dedupe_hash', 'created_at', 'updated_at', 'deleted_at'],
    refs: [
      ref('category_id', 'categories', 'category', true),
      ref('import_batch_id', 'import_batches', 'import_batch', true),
    ],
    keyed: true,
  },
  {
    name: 'budgets',
    columns: ['limit_paise', 'reset_day', 'is_active', 'created_at', 'deleted_at'],
    refs: [ref('category_id', 'categories', 'category', false)],
    keyed: true,
  },
  {
    name: 'subscriptions',
    columns: [
      'name',
      'amount_paise',
      'billing_cycle',
      'status',
      'anchor_date',
      'reminder_days_before',
      'created_at',
      'deleted_at',
    ],
    refs: [ref('category_id', 'categories', 'category', true)],
    keyed: true,
  },
  {
    name: 'split_groups',
    columns: ['name', 'icon', 'simplify_debts', 'created_at', 'updated_at', 'deleted_at'],
    refs: [ref('direct_person_id', 'people', 'direct_person', true)],
    keyed: true,
  },
  {
    name: 'group_members',
    columns: ['created_at', 'deleted_at'],
    refs: [ref('group_id', 'split_groups', 'group', false), ref('person_id', 'people', 'person', false)],
    keyed: false,
  },
  {
    name: 'split_expenses',
    columns: ['description', 'amount_paise', 'date', 'split_method', 'note', 'created_at', 'updated_at', 'deleted_at'],
    refs: [ref('group_id', 'split_groups', 'group', false), ref('category_id', 'categories', 'category', true)],
    keyed: true,
  },
  {
    name: 'split_expense_payers',
    columns: ['paid_paise'],
    refs: [ref('expense_id', 'split_expenses', 'expense', false), ref('person_id', 'people', 'person', false)],
    keyed: false,
  },
  {
    name: 'split_expense_shares',
    columns: ['owed_paise', 'input'],
    refs: [ref('expense_id', 'split_expenses', 'expense', false), ref('person_id', 'people', 'person', false)],
    keyed: false,
  },
  {
    name: 'split_debts',
    columns: ['amount_paise'],
    refs: [
      ref('expense_id', 'split_expenses', 'expense', false),
      ref('group_id', 'split_groups', 'group', false),
      ref('debtor_id', 'people', 'debtor', false),
      ref('creditor_id', 'people', 'creditor', false),
    ],
    keyed: false,
  },
  {
    name: 'settlements',
    columns: ['amount_paise', 'date', 'note', 'created_at', 'updated_at', 'deleted_at'],
    refs: [
      ref('group_id', 'split_groups', 'group', false),
      ref('from_person_id', 'people', 'from_person', false),
      ref('to_person_id', 'people', 'to_person', false),
    ],
    keyed: true,
  },
];

/** Not user data: boot and seeding own these. */
export const EXCLUDED_TABLES = ['app_meta', '__drizzle_migrations'] as const;

/** A double-quoted SQL identifier. */
export function quoteId(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** The keys one exported row has, in order. */
export function rowKeys(spec: TableSpec): string[] {
  return [...(spec.keyed ? ['uid'] : []), ...spec.columns, ...spec.refs.map((r) => r.as)];
}

/**
 * Read every row of one table, with each foreign key replaced by the uid of
 * the row it points at.
 *
 * LEFT JOIN even for a NOT NULL column: an inner join would silently DROP a
 * row whose parent is missing, and losing a row from a backup without saying
 * so is the one thing this file exists to prevent. A broken reference comes
 * back as null instead, and `validate.ts` reports it.
 */
export function exportSql(spec: TableSpec): string {
  const t = quoteId(spec.name);
  const select = [
    ...(spec.keyed ? [`t.uid AS "uid"`] : []),
    ...spec.columns.map((c) => `t.${quoteId(c)} AS ${quoteId(c)}`),
    ...spec.refs.map((r, i) => `r${i}.uid AS ${quoteId(r.as)}`),
  ];
  const joins = spec.refs.map((r, i) => `LEFT JOIN ${quoteId(r.table)} r${i} ON r${i}.id = t.${quoteId(r.column)}`);
  // ORDER BY rowid so a re-export of the same data is byte-identical, which is
  // what makes "did anything change?" answerable by diffing two backups.
  return `SELECT ${select.join(', ')} FROM ${t} t ${joins.join(' ')} ORDER BY t.rowid`.replace(/\s+/g, ' ').trim();
}

/**
 * Insert one exported row, turning each uid back into a local id.
 *
 * The scalar subquery is the whole trick: `(SELECT id FROM categories WHERE
 * uid = ?)` yields the id if the parent is there and NULL if it is not. For a
 * nullable reference that is the right answer either way. For a NOT NULL one
 * the NULL trips the column's constraint, the transaction rolls back, and the
 * restore fails loudly rather than writing a row that points nowhere.
 *
 * Parameters bind in the order `rowKeys` lists them.
 */
export function importSql(spec: TableSpec): string {
  const cols = [...(spec.keyed ? ['uid'] : []), ...spec.columns, ...spec.refs.map((r) => r.column)];
  const values = [
    ...(spec.keyed ? ['?'] : []),
    ...spec.columns.map(() => '?'),
    ...spec.refs.map((r) => `(SELECT id FROM ${quoteId(r.table)} WHERE uid = ?)`),
  ];
  return `INSERT INTO ${quoteId(spec.name)} (${cols.map(quoteId).join(', ')}) VALUES (${values.join(', ')})`;
}

/** `SELECT count(*)` for one table. */
export function countSql(table: string): string {
  return `SELECT count(*) AS n FROM ${quoteId(table)}`;
}
