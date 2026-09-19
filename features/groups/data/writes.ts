import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';

import {
  groupMembers,
  people,
  settlements,
  splitDebts,
  splitExpensePayers,
  splitExpenseShares,
  splitExpenses,
  splitGroups,
} from '@/db/schema';
import type { SplitMethod } from '@/db/schema';
import { runWriteTx } from '@/db/tx';
import { UserFacingError } from '@/lib/db/errors';
import { nowISO } from '@/lib/dates';
import { formatINR } from '@/lib/money';
import type { PlannedSettlement } from '../domain/balances';
import { netsQuery } from './sql';
import { expenseDebts, type Contribution } from '../domain/debts';
import { MAX_EXPENSE_PAISE } from '../domain/split';
import { allSync, type SyncDb } from '@/db/types';

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

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function selfId(db: SyncDb): number {
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

export function createPerson(db: SyncDb, name: string): number {
  return db
    .insert(people)
    .values({ name: cleanName(name, 'friend') })
    .returning({ id: people.id })
    .all()[0]!.id;
}

export function renamePerson(db: SyncDb, id: number, name: string): void {
  const clean = cleanName(name, 'friend');
  runWriteTx(db, (tx) => {
    tx.update(people)
      .set({ name: clean, updatedAt: nowISO() })
      .where(and(eq(people.id, id), eq(people.isSelf, false)))
      .run();
    // The hidden 1:1 group is named after the friend.
    tx.update(splitGroups).set({ name: clean, updatedAt: nowISO() }).where(eq(splitGroups.directPersonId, id)).run();
  });
}

/**
 * Remove a friend. Refused while they are in a group or have any balance with
 * anyone: the balance would silently disappear from other people's figures.
 */
export function deletePerson(db: SyncDb, id: number): void {
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
    const at = nowISO();
    tx.update(people).set({ deletedAt: at }).where(eq(people.id, id)).run();
    tx.update(splitGroups)
      .set({ deletedAt: at })
      .where(and(eq(splitGroups.directPersonId, id), isNull(splitGroups.deletedAt)))
      .run();
  });
}

export function restorePerson(db: SyncDb, id: number): void {
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

export function createGroup(db: SyncDb, input: GroupInput): number {
  const name = cleanName(input.name, 'group');
  const me = selfId(db);
  return runWriteTx(db, (tx) => {
    const id = tx
      .insert(splitGroups)
      .values({ name, icon: input.icon, simplifyDebts: input.simplifyDebts })
      .returning({ id: splitGroups.id })
      .all()[0]!.id;
    const members = [...new Set([me, ...input.memberIds])];
    tx.insert(groupMembers)
      .values(members.map((personId) => ({ groupId: id, personId })))
      .run();
    return id;
  });
}

/**
 * Rename, re-icon, toggle simplification and set the member list. A member
 * with a balance in this group cannot be removed — settle them first.
 */
export function updateGroup(db: SyncDb, groupId: number, input: GroupInput): void {
  const name = cleanName(input.name, 'group');
  const me = selfId(db);
  const wanted = new Set([me, ...input.memberIds]);

  runWriteTx(db, (tx) => {
    tx.update(splitGroups)
      .set({ name, icon: input.icon, simplifyDebts: input.simplifyDebts, updatedAt: nowISO() })
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
      const nets = groupNetsSync(tx, groupId);
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
        .set({ deletedAt: nowISO() })
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
      tx.insert(groupMembers)
        .values(joining.map((personId) => ({ groupId, personId })))
        .run();
    }
  });
}

/**
 * Soft-delete a group — only while everyone in it is square (B14).
 *
 * Deleting a group with live balances hid them from the hub and silently
 * changed every member's friend total, with no settlement to explain it. The
 * app's promise is that balances are derived from expenses and settlements
 * alone, so no other action may move them. Same rule, and the same wording,
 * as removing a single member in `updateGroup`.
 */
export function deleteGroup(db: SyncDb, groupId: number): void {
  runWriteTx(db, (tx) => {
    const nets = groupNetsSync(tx, groupId);
    const outstanding = [...nets.entries()].filter(([, net]) => net !== 0);

    if (outstanding.length > 0) {
      const names = new Map(
        tx
          .select({ id: people.id, name: people.name })
          .from(people)
          .where(
            inArray(
              people.id,
              outstanding.map(([personId]) => personId),
            ),
          )
          .all()
          .map((p) => [p.id, p.name] as const),
      );
      const [personId, net] = outstanding[0]!;
      const who = names.get(personId) ?? 'Someone';
      throw new UserFacingError(
        net > 0
          ? `${who} is still owed ${formatINR(net)} here. Settle up before deleting this group`
          : `${who} still owes ${formatINR(-net)} here. Settle up before deleting this group`,
      );
    }

    tx.update(splitGroups).set({ deletedAt: nowISO() }).where(eq(splitGroups.id, groupId)).run();
  });
}

/**
 * Undo a group delete — refused if a member has since been removed as a friend.
 * `deletePerson` only looks at live groups, so it can remove someone who is
 * still a member of a deleted one; restoring it would list a removed friend.
 */
export function restoreGroup(db: SyncDb, groupId: number): void {
  runWriteTx(db, (tx) => {
    const removed = tx
      .select({ name: people.name })
      .from(groupMembers)
      .innerJoin(people, eq(people.id, groupMembers.personId))
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt), isNotNull(people.deletedAt)))
      .all()[0];
    if (removed) {
      throw new UserFacingError(`${removed.name} is no longer one of your friends, so this group can’t be restored`);
    }
    tx.update(splitGroups).set({ deletedAt: null }).where(eq(splitGroups.id, groupId)).run();
  });
}

/** The hidden group behind a 1:1 friendship, created the first time it is needed. */
export function getOrCreateDirectGroup(db: SyncDb, personId: number): number {
  return runWriteTx(db, (tx) => {
    const existing = tx
      .select({ id: splitGroups.id })
      .from(splitGroups)
      .where(and(eq(splitGroups.directPersonId, personId), isNull(splitGroups.deletedAt)))
      .all()[0];
    if (existing) return existing.id;

    const person = tx
      .select()
      .from(people)
      .where(and(eq(people.id, personId), isNull(people.deletedAt)))
      .all()[0];
    if (!person || person.isSelf) throw new UserFacingError('That friend no longer exists');
    const me = tx.select({ id: people.id }).from(people).where(eq(people.isSelf, true)).all()[0]!.id;

    const id = tx
      .insert(splitGroups)
      .values({ name: person.name, directPersonId: personId, simplifyDebts: false })
      .returning({ id: splitGroups.id })
      .all()[0]!.id;
    tx.insert(groupMembers)
      .values([
        { groupId: id, personId: me },
        { groupId: id, personId },
      ])
      .run();
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
      if (!Number.isSafeInteger(c.paise) || c.paise < 0)
        throw new UserFacingError(`Every ${label} amount must be a whole amount`);
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

function liveMemberIds(db: SyncDb, groupId: number): Set<number> {
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
export function saveExpense(db: SyncDb, input: ExpenseInput, id?: number): number {
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
      // Replacing the payers and shares drops anyone who has since left the
      // group, which would move a balance onto them (B21).
      const old = tx
        .select({ groupId: splitExpenses.groupId })
        .from(splitExpenses)
        .where(and(eq(splitExpenses.id, id), isNull(splitExpenses.deletedAt)))
        .all()[0];
      if (!old) throw new UserFacingError('That expense no longer exists');
      assertPeopleStillMembers(tx, old.groupId, peopleOnExpense(tx, id), 'expense', 'changed');

      const res = tx
        .update(splitExpenses)
        .set({ ...values, updatedAt: nowISO() })
        .where(and(eq(splitExpenses.id, id), isNull(splitExpenses.deletedAt)))
        .run() as { changes: number };
      if (res.changes === 0) throw new UserFacingError('That expense no longer exists');
      expenseId = id;
      tx.delete(splitExpensePayers).where(eq(splitExpensePayers.expenseId, id)).run();
      tx.delete(splitExpenseShares).where(eq(splitExpenseShares.expenseId, id)).run();
      tx.delete(splitDebts).where(eq(splitDebts.expenseId, id)).run();
    }

    tx.insert(splitExpensePayers)
      .values(payers.map((p) => ({ expenseId, personId: p.personId, paidPaise: p.paise })))
      .run();
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

/**
 * Delete an expense — only while everyone it names is still a member (B21).
 *
 * Removing an expense moves the balance of everyone on it. Someone who has
 * left the group can't settle up any more, so a balance moved onto them could
 * never be cleared. The mirror image of `restoreExpense`.
 */
export function deleteExpense(db: SyncDb, id: number): void {
  runWriteTx(db, (tx) => {
    const expense = tx
      .select({ groupId: splitExpenses.groupId })
      .from(splitExpenses)
      .where(and(eq(splitExpenses.id, id), isNull(splitExpenses.deletedAt)))
      .all()[0];
    if (!expense) throw new UserFacingError('That expense no longer exists');

    assertPeopleStillMembers(tx, expense.groupId, peopleOnExpense(tx, id), 'expense', 'deleted');

    tx.update(splitExpenses).set({ deletedAt: nowISO() }).where(eq(splitExpenses.id, id)).run();
  });
}

/**
 * Undo a delete — only while everyone the expense names is still a member (B14).
 *
 * A member can be removed once their balance is zero, which the deleted
 * expense is not counted in. Restoring it afterwards would put a balance back
 * on somebody who has left, so the group would no longer sum to zero.
 */
export function restoreExpense(db: SyncDb, id: number): void {
  runWriteTx(db, (tx) => {
    const expense = tx
      .select({ groupId: splitExpenses.groupId })
      .from(splitExpenses)
      .where(eq(splitExpenses.id, id))
      .all()[0];
    if (!expense) throw new UserFacingError('That expense no longer exists');

    assertPeopleStillMembers(tx, expense.groupId, peopleOnExpense(tx, id), 'expense', 'restored');

    tx.update(splitExpenses).set({ deletedAt: null }).where(eq(splitExpenses.id, id)).run();
  });
}

/** Everyone named by an expense: its payers and everyone it charges a share to. */
function peopleOnExpense(db: SyncDb, expenseId: number): number[] {
  const payers = db
    .select({ personId: splitExpensePayers.personId })
    .from(splitExpensePayers)
    .where(eq(splitExpensePayers.expenseId, expenseId))
    .all();
  const shares = db
    .select({ personId: splitExpenseShares.personId })
    .from(splitExpenseShares)
    .where(eq(splitExpenseShares.expenseId, expenseId))
    .all();
  return [...new Set([...payers, ...shares].map((r) => r.personId))];
}

/**
 * Refuse when anyone named is no longer a live member of the group: deleting,
 * changing or restoring the row would move a balance onto someone who can no
 * longer settle it.
 */
function assertPeopleStillMembers(
  db: SyncDb,
  groupId: number,
  personIds: readonly number[],
  what: 'expense' | 'settlement',
  action: 'restored' | 'deleted' | 'changed',
): void {
  if (personIds.length === 0) return;

  const live = new Set(
    db
      .select({ personId: groupMembers.personId })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), isNull(groupMembers.deletedAt)))
      .all()
      .map((m) => m.personId),
  );

  const missing = personIds.filter((id) => !live.has(id));
  if (missing.length === 0) return;

  const name =
    db.select({ name: people.name }).from(people).where(eq(people.id, missing[0]!)).all()[0]?.name ?? 'Someone';
  throw new UserFacingError(`${name} is no longer in this group, so that ${what} can’t be ${action}`);
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

export function recordSettlement(db: SyncDb, input: SettlementInput): number {
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
export function recordSettlements(db: SyncDb, plan: readonly PlannedSettlement[], date: string): number[] {
  if (plan.length === 0) throw new UserFacingError('There is nothing to settle');
  for (const p of plan)
    validateSettlement({ ...p, amountPaise: p.paise, date, note: null }, liveMemberIds(db, p.groupId));
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

/** Delete settle-ups — only while both people on each are still members (B21, as deleteExpense). */
export function deleteSettlements(db: SyncDb, ids: readonly number[]): void {
  if (ids.length === 0) return;
  runWriteTx(db, (tx) => {
    const rows = tx
      .select({ groupId: settlements.groupId, from: settlements.fromPersonId, to: settlements.toPersonId })
      .from(settlements)
      .where(and(inArray(settlements.id, [...ids]), isNull(settlements.deletedAt)))
      .all();

    for (const r of rows) {
      assertPeopleStillMembers(tx, r.groupId, [r.from, r.to], 'settlement', 'deleted');
    }

    tx.update(settlements)
      .set({ deletedAt: nowISO() })
      .where(and(inArray(settlements.id, [...ids]), isNull(settlements.deletedAt)))
      .run();
  });
}

/** Undo a settle-up — only while both people are still members (B14, as restoreExpense). */
export function restoreSettlements(db: SyncDb, ids: readonly number[]): void {
  if (ids.length === 0) return;
  runWriteTx(db, (tx) => {
    const rows = tx
      .select({ groupId: settlements.groupId, from: settlements.fromPersonId, to: settlements.toPersonId })
      .from(settlements)
      .where(inArray(settlements.id, [...ids]))
      .all();

    for (const r of rows) {
      assertPeopleStillMembers(tx, r.groupId, [r.from, r.to], 'settlement', 'restored');
    }

    tx.update(settlements)
      .set({ deletedAt: null })
      .where(inArray(settlements.id, [...ids]))
      .run();
  });
}

// ---------------------------------------------------------------------------
// Guards need balances synchronously, inside the write.
// ---------------------------------------------------------------------------

/** Net per person in one group — the same arithmetic as sql.ts `netsQuery`, run synchronously. */
function groupNetsSync(db: SyncDb, groupId: number): Map<number, number> {
  // The SAME query the balances screen reads (R3-12). This used to be a second
  // hand-written copy of the flows union, so a change to how balances are
  // summed would have moved the screen and not the guards, or the reverse.
  const rows = allSync<{ personId: number; netPaise: number }>(netsQuery(db, groupId));
  return new Map(rows.map((r) => [r.personId, r.netPaise]));
}

/** Whether a person has any non-zero balance in any live group. Returns the first non-zero net found, or 0. */
function personNetEverywhere(db: SyncDb, personId: number): number {
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
