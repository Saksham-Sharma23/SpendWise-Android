import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import {
  groupMembers,
  people,
  settlements,
  splitDebts,
  splitExpensePayers,
  splitExpenseShares,
  splitExpenses,
  splitGroups,
} from '../../db/schema';
import type * as schema from '../../db/schema';
import type { SplitMethod } from '../../db/schema';
import { runWriteTx } from '../../db/tx';
import { UserFacingError } from '../../lib/db/errors';
import { formatINR } from '../../lib/money';
import type { PlannedSettlement } from './balances';
import { expenseDebts, type Contribution } from './debts';
import { MAX_EXPENSE_PAISE } from './split';

/**
 * Every Groups write, against a SYNC database handle so the same code runs on
 * the phone (db/client.ts, wrapped by ./mutations.ts) and in Jest against the
 * migrated schema (`__tests__/writes.test.ts`).
 *
 * Multi-statement writes go through `runWriteTx` with synchronous callbacks
 * (CLAUDE.md #19). Rule violations throw `UserFacingError`, whose message is
 * shown to the user verbatim.
 *
 * The invariant every expense write keeps: payers' amounts sum to the
 * expense amount, shares sum to it too, every person involved is a live
 * member, and `split_debts` is rewritten from payers + shares in the same
 * transaction — so balances can never disagree with the expenses behind them.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GroupsWriteDb = BaseSQLiteDatabase<'sync', any, typeof schema>;

const now = () => new Date().toISOString();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function selfId(db: GroupsWriteDb): number {
  const row = db.select({ id: people.id }).from(people).where(eq(people.isSelf, true)).limit(1).all()[0];
  if (!row) throw new Error('The self person is missing — migration 0008 has not run');
  return row.id;
}

function cleanName(name: string, what: string): string {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) throw new UserFacingError(`Give the ${what} a name`);
  if (trimmed.length > 60) throw new UserFacingError(`That ${what} name is too long`);
  return trimmed;
}

export function createPerson(db: GroupsWriteDb, name: string): number {
  return db.insert(people).values({ name: cleanName(name, 'friend') }).returning({ id: people.id }).all()[0]!.id;
}

export function renamePerson(db: GroupsWriteDb, id: number, name: string): void {
  const clean = cleanName(name, 'friend');
  runWriteTx(db, (tx) => {
    tx.update(people).set({ name: clean, updatedAt: now() }).where(and(eq(people.id, id), eq(people.isSelf, false))).run();
    // The hidden 1:1 group is named after the friend.
    tx.update(splitGroups).set({ name: clean, updatedAt: now() }).where(eq(splitGroups.directPersonId, id)).run();
  });
}

/**
 * Remove a friend. Refused while they are in a group or have any balance with
 * anyone: the balance would silently disappear from other people's figures.
 */
export function deletePerson(db: GroupsWriteDb, id: number): void {
  const person = db.select().from(people).where(eq(people.id, id)).all()[0];
  if (!person || person.isSelf) throw new UserFacingError("You can't remove yourself");

  const inGroups = db
    .select({ name: splitGroups.name })
    .from(groupMembers)
    .innerJoin(splitGroups, eq(splitGroups.id, groupMembers.groupId))
    .where(
      and(
        eq(groupMembers.personId, id),
        isNull(groupMembers.deletedAt),
        isNull(splitGroups.deletedAt),
        isNull(splitGroups.directPersonId),
      ),
    )
    .all();
  if (inGroups.length > 0) {
    throw new UserFacingError(`${person.name} is still in ${inGroups[0]!.name}. Remove them from the group first`);
  }
  const net = personNetEverywhere(db, id);
  if (net !== 0) throw new UserFacingError(`Settle up with ${person.name} first`);

  runWriteTx(db, (tx) => {
    const at = now();
    tx.update(people).set({ deletedAt: at }).where(eq(people.id, id)).run();
    tx.update(splitGroups).set({ deletedAt: at }).where(and(eq(splitGroups.directPersonId, id), isNull(splitGroups.deletedAt))).run();
  });
}

export function restorePerson(db: GroupsWriteDb, id: number): void {
  runWriteTx(db, (tx) => {
    const row = tx.select({ deletedAt: people.deletedAt }).from(people).where(eq(people.id, id)).all()[0];
    if (!row?.deletedAt) return;
    tx.update(people).set({ deletedAt: null }).where(eq(people.id, id)).run();
    tx.update(splitGroups)
      .set({ deletedAt: null })
      .where(and(eq(splitGroups.directPersonId, id), eq(splitGroups.deletedAt, row.deletedAt)))
      .run();
  });
}

// ---------------------------------------------------------------------------
// Groups and members
// ---------------------------------------------------------------------------

export interface GroupInput {
  name: string;
  icon: string | null;
  simplifyDebts: boolean;
  /** Friends in the group. You are always added. */
  memberIds: number[];
}

export function createGroup(db: GroupsWriteDb, input: GroupInput): number {
  const name = cleanName(input.name, 'group');
  const me = selfId(db);
  return runWriteTx(db, (tx) => {
    const id = tx
      .insert(splitGroups)
      .values({ name, icon: input.icon, simplifyDebts: input.simplifyDebts })
      .returning({ id: splitGroups.id })
      .all()[0]!.id;
    const members = [...new Set([me, ...input.memberIds])];
    tx.insert(groupMembers).values(members.map((personId) => ({ groupId: id, personId }))).run();
    return id;
  });
}

/**
 * Rename, re-icon, toggle simplification and set the member list. A member
 * with a balance in this group cannot be removed — settle them first.
 */
export function updateGroup(db: GroupsWriteDb, groupId: number, input: GroupInput): void {
  const name = cleanName(input.name, 'group');
  const me = selfId(db);
  const wanted = new Set([me, ...input.memberIds]);

  runWriteTx(db, (tx) => {
    tx.update(splitGroups)
      .set({ name, icon: input.icon, simplifyDebts: input.simplifyDebts, updatedAt: now() })
      .where(eq(splitGroups.id, groupId))
      .run();

    const current = tx
      .select({ personId: groupMembers.personId, name: people.name })
      .from(groupMembers)
      .innerJoin(people, eq(people.id, groupMembers.personId))
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
      .all();
    const currentIds = new Set(current.map((m) => m.personId));

    const leaving = current.filter((m) => !wanted.has(m.personId));
    if (leaving.length > 0) {
      const nets = groupNetsSync(tx as unknown as GroupsWriteDb, groupId);
      for (const m of leaving) {
        const net = nets.get(m.personId) ?? 0;
        if (net !== 0) {
          throw new UserFacingError(
            net > 0
              ? `${m.name} is still owed ${formatINR(net)} here. Settle up before removing them`
              : `${m.name} still owes ${formatINR(-net)} here. Settle up before removing them`,
          );
        }
      }
      tx.update(groupMembers)
        .set({ deletedAt: now() })
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            isNull(groupMembers.deletedAt),
            inArray(
              groupMembers.personId,
              leaving.map((m) => m.personId),
            ),
          ),
        )
        .run();
    }

    const joining = [...wanted].filter((id) => !currentIds.has(id));
    if (joining.length > 0) {
      tx.insert(groupMembers).values(joining.map((personId) => ({ groupId, personId }))).run();
    }
  });
}

export function deleteGroup(db: GroupsWriteDb, groupId: number): void {
  db.update(splitGroups).set({ deletedAt: now() }).where(eq(splitGroups.id, groupId)).run();
}

export function restoreGroup(db: GroupsWriteDb, groupId: number): void {
  db.update(splitGroups).set({ deletedAt: null }).where(eq(splitGroups.id, groupId)).run();
}

/** The hidden group behind a 1:1 friendship, created the first time it is needed. */
export function getOrCreateDirectGroup(db: GroupsWriteDb, personId: number): number {
  return runWriteTx(db, (tx) => {
    const existing = tx
      .select({ id: splitGroups.id })
      .from(splitGroups)
      .where(and(eq(splitGroups.directPersonId, personId), isNull(splitGroups.deletedAt)))
      .all()[0];
    if (existing) return existing.id;

    const person = tx.select().from(people).where(and(eq(people.id, personId), isNull(people.deletedAt))).all()[0];
    if (!person || person.isSelf) throw new UserFacingError('That friend no longer exists');
    const me = tx.select({ id: people.id }).from(people).where(eq(people.isSelf, true)).all()[0]!.id;

    const id = tx
      .insert(splitGroups)
      .values({ name: person.name, directPersonId: personId, simplifyDebts: false })
      .returning({ id: splitGroups.id })
      .all()[0]!.id;
    tx.insert(groupMembers).values([
      { groupId: id, personId: me },
      { groupId: id, personId },
    ]).run();
    return id;
  });
}

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export interface ShareInput extends Contribution {
  /** What was typed: basis points (percent), units (shares), paise (exact); null for equal. */
  input: number | null;
}

export interface ExpenseInput {
  groupId: number;
  description: string;
  amountPaise: number;
  date: string;
  categoryId: number | null;
  splitMethod: SplitMethod;
  note: string | null;
  payers: Contribution[];
  shares: ShareInput[];
}

/** Check an expense before writing it. Throws UserFacingError; exported for the form's final gate. */
export function validateExpense(input: ExpenseInput, memberIds: ReadonlySet<number>): void {
  if (!input.description.trim()) throw new UserFacingError('Add a description');
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new UserFacingError('Enter an amount more than zero');
  }
  if (input.amountPaise > MAX_EXPENSE_PAISE) throw new UserFacingError('That amount looks too large');
  if (!DATE.test(input.date)) throw new UserFacingError('Pick a date');

  const check = (list: Contribution[], label: string) => {
    const ids = new Set<number>();
    let sum = 0;
    for (const c of list) {
      if (!Number.isSafeInteger(c.paise) || c.paise < 0) throw new UserFacingError(`Every ${label} amount must be a whole amount`);
      if (ids.has(c.personId)) throw new UserFacingError(`Someone is listed twice in ${label}`);
      if (!memberIds.has(c.personId)) throw new UserFacingError(`Everyone in ${label} must be in the group`);
      ids.add(c.personId);
      sum += c.paise;
    }
    return sum;
  };

  const paid = check(input.payers, 'paid by');
  if (paid !== input.amountPaise) {
    throw new UserFacingError(`The payers add up to ${formatINR(paid)}, not ${formatINR(input.amountPaise)}`);
  }
  if (!input.payers.some((p) => p.paise > 0)) throw new UserFacingError('Choose who paid');

  const owed = check(input.shares, 'the split');
  if (owed !== input.amountPaise) {
    throw new UserFacingError(`The split adds up to ${formatINR(owed)}, not ${formatINR(input.amountPaise)}`);
  }
  if (!input.shares.some((s) => s.paise > 0)) throw new UserFacingError('Choose who this was for');
}

function liveMemberIds(db: GroupsWriteDb, groupId: number): Set<number> {
  const group = db
    .select({ id: splitGroups.id })
    .from(splitGroups)
    .where(and(eq(splitGroups.id, groupId), isNull(splitGroups.deletedAt)))
    .all()[0];
  if (!group) throw new UserFacingError('That group no longer exists');
  return new Set(
    db
      .select({ personId: groupMembers.personId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
      .all()
      .map((m) => m.personId),
  );
}

/**
 * Create (no `id`) or replace an expense, its payers, its shares and its
 * derived debts — atomically. Zero rows are dropped: someone who paid ₹0 or
 * owes ₹0 is simply not part of it.
 */
export function saveExpense(db: GroupsWriteDb, input: ExpenseInput, id?: number): number {
  validateExpense(input, liveMemberIds(db, input.groupId));

  const payers = input.payers.filter((p) => p.paise > 0);
  const shares = input.shares.filter((s) => s.paise > 0);
  const debts = expenseDebts(payers, shares);
  const values = {
    groupId: input.groupId,
    description: input.description.trim(),
    amountPaise: input.amountPaise,
    date: input.date,
    categoryId: input.categoryId,
    splitMethod: input.splitMethod,
    note: input.note?.trim() || null,
  };

  return runWriteTx(db, (tx) => {
    let expenseId: number;
    if (id == null) {
      expenseId = tx.insert(splitExpenses).values(values).returning({ id: splitExpenses.id }).all()[0]!.id;
    } else {
      const res = tx
        .update(splitExpenses)
        .set({ ...values, updatedAt: now() })
        .where(and(eq(splitExpenses.id, id), isNull(splitExpenses.deletedAt)))
        .run() as { changes: number };
      if (res.changes === 0) throw new UserFacingError('That expense no longer exists');
      expenseId = id;
      tx.delete(splitExpensePayers).where(eq(splitExpensePayers.expenseId, id)).run();
      tx.delete(splitExpenseShares).where(eq(splitExpenseShares.expenseId, id)).run();
      tx.delete(splitDebts).where(eq(splitDebts.expenseId, id)).run();
    }

    tx.insert(splitExpensePayers).values(payers.map((p) => ({ expenseId, personId: p.personId, paidPaise: p.paise }))).run();
    tx.insert(splitExpenseShares)
      .values(shares.map((s) => ({ expenseId, personId: s.personId, owedPaise: s.paise, input: s.input })))
      .run();
    if (debts.length > 0) {
      tx.insert(splitDebts)
        .values(
          debts.map((d) => ({
            expenseId,
            groupId: input.groupId,
            debtorId: d.from,
            creditorId: d.to,
            amountPaise: d.paise,
          })),
        )
        .run();
    }
    return expenseId;
  });
}

export function deleteExpense(db: GroupsWriteDb, id: number): void {
  db.update(splitExpenses).set({ deletedAt: now() }).where(eq(splitExpenses.id, id)).run();
}

export function restoreExpense(db: GroupsWriteDb, id: number): void {
  db.update(splitExpenses).set({ deletedAt: null }).where(eq(splitExpenses.id, id)).run();
}

// ---------------------------------------------------------------------------
// Settlements
// ---------------------------------------------------------------------------

export interface SettlementInput {
  groupId: number;
  from: number;
  to: number;
  amountPaise: number;
  date: string;
  note: string | null;
}

function validateSettlement(input: SettlementInput, members: ReadonlySet<number>): void {
  if (input.from === input.to) throw new UserFacingError('Pick two different people');
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new UserFacingError('Enter an amount more than zero');
  }
  if (input.amountPaise > MAX_EXPENSE_PAISE) throw new UserFacingError('That amount looks too large');
  if (!DATE.test(input.date)) throw new UserFacingError('Pick a date');
  if (!members.has(input.from) || !members.has(input.to)) throw new UserFacingError('Both people must be in the group');
}

export function recordSettlement(db: GroupsWriteDb, input: SettlementInput): number {
  validateSettlement(input, liveMemberIds(db, input.groupId));
  return db
    .insert(settlements)
    .values({
      groupId: input.groupId,
      fromPersonId: input.from,
      toPersonId: input.to,
      amountPaise: input.amountPaise,
      date: input.date,
      note: input.note?.trim() || null,
    })
    .returning({ id: settlements.id })
    .all()[0]!.id;
}

/** A friend settle-up across several groups, all or nothing. Returns the new settlement ids. */
export function recordSettlements(db: GroupsWriteDb, plan: readonly PlannedSettlement[], date: string): number[] {
  if (plan.length === 0) throw new UserFacingError('There is nothing to settle');
  for (const p of plan) validateSettlement({ ...p, amountPaise: p.paise, date, note: null }, liveMemberIds(db, p.groupId));
  return runWriteTx(db, (tx) =>
    plan.map(
      (p) =>
        tx
          .insert(settlements)
          .values({ groupId: p.groupId, fromPersonId: p.from, toPersonId: p.to, amountPaise: p.paise, date })
          .returning({ id: settlements.id })
          .all()[0]!.id,
    ),
  );
}

export function deleteSettlements(db: GroupsWriteDb, ids: readonly number[]): void {
  if (ids.length === 0) return;
  db.update(settlements).set({ deletedAt: now() }).where(inArray(settlements.id, [...ids])).run();
}

export function restoreSettlements(db: GroupsWriteDb, ids: readonly number[]): void {
  if (ids.length === 0) return;
  db.update(settlements).set({ deletedAt: null }).where(inArray(settlements.id, [...ids])).run();
}

// ---------------------------------------------------------------------------
// Guards need balances synchronously, inside the write.
// ---------------------------------------------------------------------------

/** Net per person in one group — the same arithmetic as sql.ts `netsQuery`, run synchronously. */
function groupNetsSync(db: GroupsWriteDb, groupId: number): Map<number, number> {
  const rows = db
    .select({ personId: sql<number>`x.person_id`, net: sql<number>`sum(x.v)` })
    .from(
      sql`(
        SELECT p.person_id AS person_id, p.paid_paise AS v FROM split_expense_payers p JOIN split_expenses e ON e.id = p.expense_id
         WHERE e.deleted_at IS NULL AND e.group_id = ${groupId}
        UNION ALL
        SELECT s.person_id, -s.owed_paise FROM split_expense_shares s JOIN split_expenses e ON e.id = s.expense_id
         WHERE e.deleted_at IS NULL AND e.group_id = ${groupId}
        UNION ALL
        SELECT from_person_id, amount_paise FROM settlements WHERE deleted_at IS NULL AND group_id = ${groupId}
        UNION ALL
        SELECT to_person_id, -amount_paise FROM settlements WHERE deleted_at IS NULL AND group_id = ${groupId}
      ) x`,
    )
    .groupBy(sql`x.person_id`)
    .all();
  return new Map(rows.map((r) => [r.personId, r.net]));
}

/** Whether a person has any non-zero balance in any live group. Returns the first non-zero net found, or 0. */
function personNetEverywhere(db: GroupsWriteDb, personId: number): number {
  const groups = db
    .select({ id: groupMembers.groupId })
    .from(groupMembers)
    .innerJoin(splitGroups, eq(splitGroups.id, groupMembers.groupId))
    .where(and(eq(groupMembers.personId, personId), isNull(splitGroups.deletedAt)))
    .all();
  for (const g of groups) {
    const net = groupNetsSync(db, g.id).get(personId) ?? 0;
    if (net !== 0) return net;
  }
  return 0;
}
