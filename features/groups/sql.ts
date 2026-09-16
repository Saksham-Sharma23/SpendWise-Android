import { and, asc, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import { categories, groupMembers, people, splitExpenses, splitGroups } from '../../db/schema';
import type * as schema from '../../db/schema';

/**
 * The Groups read builders. Like features/analytics/sql.ts they take the
 * database as a parameter, so the phone runs them through db/read.ts and the
 * tests run the SAME builders against the migrated schema.
 *
 * Balances are never stored — they are summed here, one row per
 * (group, person), however many expenses a group holds (CLAUDE.md #5). JS
 * then only runs the simplification over those few rows.
 *
 * Raw unions go through `select({...}).from(sql\`(…) x\`)`, never
 * `db.all(sql\`…\`)`: on the sqlite-proxy read handle a raw `all` returns bare
 * value arrays with no field names, while a select maps its fields by position.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GroupsDb = BaseSQLiteDatabase<'sync' | 'async', any, typeof schema>;

const inGroup = (column: SQL, groupId: number | null) => (groupId == null ? sql`` : sql` AND ${column} = ${groupId}`);

/**
 * Net per (group, person): paid − owed + settlements sent − settlements received.
 * Positive = the group owes them. Zero nets are omitted; per group they sum to 0.
 * Pass a group id for one group, or null for every live group.
 */
export function netsQuery(db: GroupsDb, groupId: number | null) {
  const flows = sql`
    SELECT e.group_id AS group_id, p.person_id AS person_id, p.paid_paise AS v
      FROM split_expense_payers p JOIN split_expenses e ON e.id = p.expense_id
     WHERE e.deleted_at IS NULL${inGroup(sql`e.group_id`, groupId)}
    UNION ALL
    SELECT e.group_id, s.person_id, -s.owed_paise
      FROM split_expense_shares s JOIN split_expenses e ON e.id = s.expense_id
     WHERE e.deleted_at IS NULL${inGroup(sql`e.group_id`, groupId)}
    UNION ALL
    SELECT group_id, from_person_id, amount_paise
      FROM settlements WHERE deleted_at IS NULL${inGroup(sql`group_id`, groupId)}
    UNION ALL
    SELECT group_id, to_person_id, -amount_paise
      FROM settlements WHERE deleted_at IS NULL${inGroup(sql`group_id`, groupId)}`;

  return db
    .select({
      groupId: sql<number>`x.group_id`,
      personId: sql<number>`x.person_id`,
      netPaise: sql<number>`sum(x.v)`,
    })
    .from(sql`(${flows}) x JOIN split_groups g ON g.id = x.group_id AND g.deleted_at IS NULL`)
    .groupBy(sql`x.group_id, x.person_id`)
    .having(sql`sum(x.v) <> 0`)
    .orderBy(sql`x.group_id, x.person_id`);
}

/**
 * Raw pairwise debts per group: every expense's derived debts, plus each
 * settlement as a debt in the opposite direction (A paying B ₹500 is B now
 * "owing" A ₹500 back, which nets against A's debt). Feed to `pairwiseNet`.
 * Summed per (group, debtor, creditor) so the row count tracks pairs of
 * people, not expenses.
 */
export function pairwiseQuery(db: GroupsDb, groupId: number | null) {
  const flows = sql`
    SELECT d.group_id AS group_id, d.debtor_id AS from_id, d.creditor_id AS to_id, d.amount_paise AS v
      FROM split_debts d JOIN split_expenses e ON e.id = d.expense_id
     WHERE e.deleted_at IS NULL${inGroup(sql`d.group_id`, groupId)}
    UNION ALL
    SELECT group_id, to_person_id, from_person_id, amount_paise
      FROM settlements WHERE deleted_at IS NULL${inGroup(sql`group_id`, groupId)}`;

  return db
    .select({
      groupId: sql<number>`x.group_id`,
      from: sql<number>`x.from_id`,
      to: sql<number>`x.to_id`,
      paise: sql<number>`sum(x.v)`,
    })
    .from(sql`(${flows}) x JOIN split_groups g ON g.id = x.group_id AND g.deleted_at IS NULL`)
    .groupBy(sql`x.group_id, x.from_id, x.to_id`)
    .orderBy(sql`x.group_id, x.from_id, x.to_id`);
}

/**
 * Every live group with its member count and the date of its latest activity.
 * Includes the hidden 1:1 groups (`directPersonId` set) — the hub filters
 * them out of the Groups list but needs them for friend balances.
 */
export function groupsQuery(db: GroupsDb) {
  return db
    .select({
      id: splitGroups.id,
      name: splitGroups.name,
      icon: splitGroups.icon,
      simplifyDebts: splitGroups.simplifyDebts,
      directPersonId: splitGroups.directPersonId,
      createdAt: splitGroups.createdAt,
      // Written as `split_groups.id`, NOT ${splitGroups.id}: in a single-table
      // select Drizzle renders a column unqualified ("id"), and inside these
      // subqueries SQLite binds that to the INNER table's id — counting
      // group_members whose own id equals their group_id.
      memberCount: sql<number>`(SELECT count(*) FROM group_members m WHERE m.group_id = split_groups.id AND m.deleted_at IS NULL)`,
      lastActivity: sql<string | null>`max(
        coalesce((SELECT max(date) FROM split_expenses e WHERE e.group_id = split_groups.id AND e.deleted_at IS NULL), ''),
        coalesce((SELECT max(date) FROM settlements s WHERE s.group_id = split_groups.id AND s.deleted_at IS NULL), '')
      )`,
    })
    .from(splitGroups)
    .where(isNull(splitGroups.deletedAt))
    .orderBy(asc(splitGroups.name));
}

/** Everyone, including you and removed friends — names for any id a balance mentions. */
export function peopleQuery(db: GroupsDb) {
  return db
    .select({ id: people.id, name: people.name, isSelf: people.isSelf, deletedAt: people.deletedAt })
    .from(people)
    .orderBy(sql`${people.isSelf} DESC`, sql`lower(${people.name})`);
}

/** Every live membership in a live group — which friends share which groups. */
export function membershipsQuery(db: GroupsDb) {
  return db
    .select({ groupId: groupMembers.groupId, personId: groupMembers.personId })
    .from(groupMembers)
    .innerJoin(splitGroups, eq(splitGroups.id, groupMembers.groupId))
    .where(and(isNull(groupMembers.deletedAt), isNull(splitGroups.deletedAt)));
}

/** A group's live members, you first, then by name. */
export function membersQuery(db: GroupsDb, groupId: number) {
  return db
    .select({ id: people.id, name: people.name, isSelf: people.isSelf })
    .from(groupMembers)
    .innerJoin(people, eq(people.id, groupMembers.personId))
    .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
    .orderBy(sql`${people.isSelf} DESC`, sql`lower(${people.name})`);
}

/**
 * A group's activity feed, newest first: expenses and settlements together.
 * For each expense it carries YOUR paid and owed amounts (so a row can say
 * "you lent ₹900") and its largest payer (so it can say "Aarav paid ₹6,000").
 *
 * Limited, not keyset-paged: a group's activity is a trip's worth of rows,
 * and "show older" raises the limit.
 */
export function activityQuery(db: GroupsDb, groupId: number, selfId: number, limit: number) {
  const rows = sql`
    SELECT 'expense' AS kind, e.id AS id, e.date AS date, e.created_at AS created_at,
           e.description AS title, e.amount_paise AS amount,
           c.icon AS icon, c.color AS color,
           coalesce((SELECT paid_paise FROM split_expense_payers WHERE expense_id = e.id AND person_id = ${selfId}), 0) AS you_paid,
           coalesce((SELECT owed_paise FROM split_expense_shares WHERE expense_id = e.id AND person_id = ${selfId}), 0) AS you_owe,
           (SELECT count(*) FROM split_expense_payers WHERE expense_id = e.id) AS payer_count,
           (SELECT p.person_id FROM split_expense_payers p WHERE p.expense_id = e.id ORDER BY p.paid_paise DESC, p.person_id LIMIT 1) AS lead_payer,
           NULL AS from_id, NULL AS to_id
      FROM split_expenses e LEFT JOIN categories c ON c.id = e.category_id
     WHERE e.group_id = ${groupId} AND e.deleted_at IS NULL
    UNION ALL
    SELECT 'settlement', s.id, s.date, s.created_at, s.note, s.amount_paise,
           NULL, NULL, 0, 0, 0, NULL, s.from_person_id, s.to_person_id
      FROM settlements s
     WHERE s.group_id = ${groupId} AND s.deleted_at IS NULL`;

  return db
    .select({
      kind: sql<'expense' | 'settlement'>`x.kind`,
      id: sql<number>`x.id`,
      date: sql<string>`x.date`,
      title: sql<string | null>`x.title`,
      amountPaise: sql<number>`x.amount`,
      icon: sql<string | null>`x.icon`,
      color: sql<string | null>`x.color`,
      youPaidPaise: sql<number>`x.you_paid`,
      youOwePaise: sql<number>`x.you_owe`,
      payerCount: sql<number>`x.payer_count`,
      leadPayerId: sql<number | null>`x.lead_payer`,
      fromId: sql<number | null>`x.from_id`,
      toId: sql<number | null>`x.to_id`,
    })
    .from(sql`(${rows}) x`)
    .orderBy(sql`x.date DESC, x.created_at DESC, x.id DESC`)
    .limit(limit);
}

/** Group totals: overall spend, your share and what you paid. One row. */
export function groupTotalsQuery(db: GroupsDb, groupId: number, selfId: number) {
  return db
    .select({
      totalPaise: sql<number>`coalesce(sum(e.amount_paise), 0)`,
      count: sql<number>`count(*)`,
      yourSharePaise: sql<number>`coalesce(sum((SELECT owed_paise FROM split_expense_shares WHERE expense_id = e.id AND person_id = ${selfId})), 0)`,
      youPaidPaise: sql<number>`coalesce(sum((SELECT paid_paise FROM split_expense_payers WHERE expense_id = e.id AND person_id = ${selfId})), 0)`,
    })
    .from(sql`split_expenses e`)
    .where(sql`e.group_id = ${groupId} AND e.deleted_at IS NULL`);
}

/** A group's spend per category, largest first. Uncategorised is a NULL id. */
export function groupCategoryQuery(db: GroupsDb, groupId: number) {
  const total = sql<number>`sum(${splitExpenses.amountPaise})`;
  return db
    .select({
      id: splitExpenses.categoryId,
      name: categories.name,
      icon: categories.icon,
      color: categories.color,
      totalPaise: total,
    })
    .from(splitExpenses)
    .leftJoin(categories, eq(categories.id, splitExpenses.categoryId))
    .where(and(eq(splitExpenses.groupId, groupId), isNull(splitExpenses.deletedAt)))
    .groupBy(splitExpenses.categoryId)
    .orderBy(desc(total));
}

/** What each member's share of the group's spending came to, largest first. */
export function memberShareQuery(db: GroupsDb, groupId: number) {
  return db
    .select({
      personId: sql<number>`s.person_id`,
      owedPaise: sql<number>`sum(s.owed_paise)`,
    })
    .from(sql`split_expense_shares s JOIN split_expenses e ON e.id = s.expense_id`)
    .where(sql`e.group_id = ${groupId} AND e.deleted_at IS NULL`)
    .groupBy(sql`s.person_id`)
    .orderBy(sql`sum(s.owed_paise) DESC`);
}

/** One expense with its payers and shares, for the edit form. */
export function expenseQuery(db: GroupsDb, expenseId: number) {
  return db
    .select({
      id: sql<number>`e.id`,
      groupId: sql<number>`e.group_id`,
      description: sql<string>`e.description`,
      amountPaise: sql<number>`e.amount_paise`,
      date: sql<string>`e.date`,
      categoryId: sql<number | null>`e.category_id`,
      splitMethod: sql<'equal' | 'exact' | 'percent' | 'shares'>`e.split_method`,
      note: sql<string | null>`e.note`,
      deletedAt: sql<string | null>`e.deleted_at`,
    })
    .from(sql`split_expenses e`)
    .where(sql`e.id = ${expenseId}`);
}

export function expensePayersQuery(db: GroupsDb, expenseId: number) {
  return db
    .select({ personId: sql<number>`person_id`, paise: sql<number>`paid_paise` })
    .from(sql`split_expense_payers`)
    .where(sql`expense_id = ${expenseId}`);
}

export function expenseSharesQuery(db: GroupsDb, expenseId: number) {
  return db
    .select({ personId: sql<number>`person_id`, paise: sql<number>`owed_paise`, input: sql<number | null>`input` })
    .from(sql`split_expense_shares`)
    .where(sql`expense_id = ${expenseId}`);
}

/** Your own `people` id. Exists from migration 0008 on. */
export function selfQuery(db: GroupsDb) {
  return db.select({ id: people.id }).from(people).where(eq(people.isSelf, true)).limit(1);
}
