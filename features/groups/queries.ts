import { db } from '@/db/client';
import { readDb } from '@/db/read';
import { useDbQuery, type DbQueryResult, type TableName } from '@/lib/db/useDbQuery';
import {
  buildGroupBalances,
  friendBalances,
  yourView,
  type FriendBalance,
  type GroupBalances,
  type GroupRef,
  type YourView,
} from './balances';
import type { PersonId } from './debts';
import {
  activityQuery,
  expensePayersQuery,
  expenseQuery,
  expenseSharesQuery,
  groupCategoryQuery,
  groupTotalsQuery,
  groupsQuery,
  memberShareQuery,
  membershipsQuery,
  membersQuery,
  netsQuery,
  pairwiseQuery,
  peopleQuery,
  selfQuery,
} from './sql';
import { allSync, type AnyDb } from '@/db/types';

/**
 * The Groups query boundary. Screens call these hooks and never see SQL.
 *
 * Balances are summed in SQL (one row per group × person) and the
 * who-owes-whom maths runs over those rows here — never over expenses.
 */

const r: AnyDb = readDb;
const w: AnyDb = db;

/** Everything a balance depends on — any write to these can move a figure. */
const BALANCE_TABLES: TableName[] = [
  'people',
  'split_groups',
  'group_members',
  'split_expenses',
  'split_expense_payers',
  'split_expense_shares',
  'split_debts',
  'settlements',
];

export interface PersonRow {
  id: number;
  name: string;
  isSelf: boolean;
  deletedAt: string | null;
}

export interface GroupRow extends GroupRef {
  name: string;
  icon: string | null;
  memberCount: number;
  createdAt: string;
}

export interface HubGroup extends GroupRow {
  view: YourView;
}

export interface Hub {
  selfId: number;
  people: Map<number, PersonRow>;
  groups: HubGroup[];
  /** Friends with a balance, largest absolute first; then settled friends by name. */
  friends: { person: PersonRow; balance: FriendBalance | null }[];
  balances: Map<number, GroupBalances>;
  groupsById: Map<number, GroupRow>;
  /** personId → the live groups they are a member of (hidden 1:1 groups included). */
  groupsOf: Map<number, Set<number>>;
  owedToYouPaise: number;
  youOwePaise: number;
}

const EMPTY_HUB: Hub = {
  selfId: 0,
  people: new Map(),
  groups: [],
  friends: [],
  balances: new Map(),
  groupsById: new Map(),
  groupsOf: new Map(),
  owedToYouPaise: 0,
  youOwePaise: 0,
};

async function loadHub(): Promise<Hub> {
  const [[self], groupRows, peopleRows, nets, pairs, memberRows] = await Promise.all([
    selfQuery(r),
    groupsQuery(r),
    peopleQuery(r),
    netsQuery(r, null),
    pairwiseQuery(r, null),
    membershipsQuery(r),
  ]);
  const groupsOf = new Map<number, Set<number>>();
  for (const m of memberRows) {
    const set = groupsOf.get(m.personId) ?? new Set<number>();
    set.add(m.groupId);
    groupsOf.set(m.personId, set);
  }
  const selfId = self?.id ?? 0;
  const groups: GroupRow[] = groupRows.map((g) => ({ ...g, lastActivity: g.lastActivity || null }));
  const balances = buildGroupBalances(groups, nets, pairs);
  const people = new Map(peopleRows.map((p) => [p.id, p]));
  const byFriend = friendBalances(groups, balances, selfId);

  let owedToYouPaise = 0;
  let youOwePaise = 0;
  for (const f of byFriend.values()) {
    if (f.netPaise > 0) owedToYouPaise += f.netPaise;
    else youOwePaise += -f.netPaise;
  }

  const friends = peopleRows
    .filter((p) => !p.isSelf && p.deletedAt == null)
    .map((person) => ({ person, balance: byFriend.get(person.id) ?? null }))
    .sort((a, b) => {
      const av = Math.abs(a.balance?.netPaise ?? 0);
      const bv = Math.abs(b.balance?.netPaise ?? 0);
      return bv - av || a.person.name.localeCompare(b.person.name);
    });

  return {
    selfId,
    people,
    groups: groups
      .filter((g) => g.directPersonId == null)
      .map((g) => ({ ...g, view: yourView(balances.get(g.id), selfId) }))
      // Most recent activity first; brand-new groups by when they were made.
      .sort((a, b) => (b.lastActivity ?? b.createdAt).localeCompare(a.lastActivity ?? a.createdAt)),
    friends,
    balances,
    groupsById: new Map(groups.map((g) => [g.id, g])),
    groupsOf,
    owedToYouPaise,
    youOwePaise,
  };
}

/** The Groups hub: every group and friend with your balances. */
export function useGroupsHub(): DbQueryResult<Hub> {
  return useDbQuery(loadHub, BALANCE_TABLES, [], EMPTY_HUB);
}

export interface GroupScreen {
  group: GroupRow | null;
  members: { id: number; name: string; isSelf: boolean }[];
  balances: GroupBalances | null;
  view: YourView;
  selfId: number;
  people: Map<number, PersonRow>;
}

const EMPTY_GROUP: GroupScreen = {
  group: null,
  members: [],
  balances: null,
  view: { netPaise: 0, owedToYou: [], youOwe: [] },
  selfId: 0,
  people: new Map(),
};

/** One group: its row, members, balances and your view of them. `group` is null if it no longer exists. */
export function useGroup(groupId: number): DbQueryResult<GroupScreen> {
  return useDbQuery(
    async () => {
      const [[self], groupRows, members, nets, pairs, peopleRows] = await Promise.all([
        selfQuery(r),
        groupsQuery(r),
        membersQuery(r, groupId),
        netsQuery(r, groupId),
        pairwiseQuery(r, groupId),
        peopleQuery(r),
      ]);
      const row = groupRows.find((g) => g.id === groupId);
      if (!row) return EMPTY_GROUP;
      const group: GroupRow = { ...row, lastActivity: row.lastActivity || null };
      const balances = buildGroupBalances([group], nets, pairs).get(groupId)!;
      const selfId = self?.id ?? 0;
      return {
        group,
        members,
        balances,
        view: yourView(balances, selfId),
        selfId,
        people: new Map(peopleRows.map((p) => [p.id, p])),
      };
    },
    BALANCE_TABLES,
    [groupId],
    EMPTY_GROUP,
    // Another group is another entity: never draw A's balances under B's name.
    { entity: groupId },
  );
}

export type ActivityRow = Awaited<ReturnType<typeof activityQuery>>[number];
const EMPTY_ACTIVITY: ActivityRow[] = [];

/** A group's expenses and settlements, newest first. */
export function useGroupActivity(groupId: number, selfId: number, limit: number): DbQueryResult<ActivityRow[]> {
  return useDbQuery(
    () => activityQuery(r, groupId, selfId, limit) as Promise<ActivityRow[]>,
    ['split_expenses', 'split_expense_payers', 'split_expense_shares', 'settlements', 'categories'],
    [groupId, selfId, limit],
    EMPTY_ACTIVITY,
    { entity: groupId },
  );
}

export interface GroupStats {
  totalPaise: number;
  count: number;
  yourSharePaise: number;
  youPaidPaise: number;
  categories: {
    id: number | null;
    name: string | null;
    icon: string | null;
    color: string | null;
    totalPaise: number;
  }[];
  members: { personId: number; owedPaise: number }[];
}

const EMPTY_STATS: GroupStats = {
  totalPaise: 0,
  count: 0,
  yourSharePaise: 0,
  youPaidPaise: 0,
  categories: [],
  members: [],
};

export function useGroupStats(groupId: number, selfId: number): DbQueryResult<GroupStats> {
  return useDbQuery(
    async () => {
      const [[totals], cats, members] = await Promise.all([
        groupTotalsQuery(r, groupId, selfId),
        groupCategoryQuery(r, groupId),
        memberShareQuery(r, groupId),
      ]);
      return { ...EMPTY_STATS, ...totals, categories: cats, members };
    },
    ['split_expenses', 'split_expense_payers', 'split_expense_shares', 'categories'],
    [groupId, selfId],
    EMPTY_STATS,
    { entity: groupId },
  );
}

// ---------------------------------------------------------------------------
// Point reads for forms — tiny and synchronous, on the write handle (db/client).
// ---------------------------------------------------------------------------

export function getSelfId(): number {
  return allSync<{ id: number }>(selfQuery(w))[0]?.id ?? 0;
}

export function getMembers(groupId: number) {
  return allSync<{ id: number; name: string; isSelf: boolean }>(membersQuery(w, groupId));
}

export function getGroupRow(groupId: number): GroupRow | undefined {
  const rows = allSync<GroupRow>(groupsQuery(w));
  const row = rows.find((g) => g.id === groupId);
  return row ? { ...row, lastActivity: row.lastActivity || null } : undefined;
}

export function getFriends(): PersonRow[] {
  return allSync<PersonRow>(peopleQuery(w)).filter((p) => !p.isSelf && p.deletedAt == null);
}

export interface ExpenseForEdit {
  id: number;
  groupId: number;
  description: string;
  amountPaise: number;
  date: string;
  categoryId: number | null;
  splitMethod: 'equal' | 'exact' | 'percent' | 'shares';
  note: string | null;
  payers: { personId: PersonId; paise: number }[];
  shares: { personId: PersonId; paise: number; input: number | null }[];
}

export function getExpenseForEdit(expenseId: number): ExpenseForEdit | undefined {
  const [row] = allSync<Omit<ExpenseForEdit, 'payers' | 'shares'> & { deletedAt: string | null }>(
    expenseQuery(w, expenseId),
  );
  if (!row || row.deletedAt != null) return undefined;
  const payers = allSync<ExpenseForEdit['payers'][number]>(expensePayersQuery(w, expenseId));
  const shares = allSync<ExpenseForEdit['shares'][number]>(expenseSharesQuery(w, expenseId));
  return { ...row, payers, shares };
}
