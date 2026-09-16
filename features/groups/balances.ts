import { pairwiseNet, simplifyDebts, type Edge, type PersonId } from './debts';

/**
 * From the summed rows SQL returns to what the screens say — pure, tested in
 * `__tests__/balances.test.ts`.
 */

export interface NetRow {
  groupId: number;
  personId: PersonId;
  netPaise: number;
}

export interface PairRow {
  groupId: number;
  from: PersonId;
  to: PersonId;
  paise: number;
}

export interface GroupRef {
  id: number;
  simplifyDebts: boolean;
  /** Oldest-first allocation of a friend settle-up uses this. '' or null = no activity. */
  lastActivity: string | null;
  directPersonId: number | null;
}

export interface GroupBalances {
  groupId: number;
  nets: Map<PersonId, number>;
  /** Who owes whom — simplified or pairwise, per the group's toggle. */
  edges: Edge[];
  /** How many payments paying everyone back pairwise would take (for "1 instead of 3"). */
  pairwiseCount: number;
}

/** Per-group balances and settle-up edges for every group in `groups`. */
export function buildGroupBalances(groups: readonly GroupRef[], nets: readonly NetRow[], pairs: readonly PairRow[]): Map<number, GroupBalances> {
  const out = new Map<number, GroupBalances>();
  const netsBy = new Map<number, Map<PersonId, number>>();
  for (const r of nets) {
    const m = netsBy.get(r.groupId) ?? new Map<PersonId, number>();
    m.set(r.personId, r.netPaise);
    netsBy.set(r.groupId, m);
  }
  const pairsBy = new Map<number, Edge[]>();
  for (const r of pairs) {
    const list = pairsBy.get(r.groupId) ?? [];
    list.push({ from: r.from, to: r.to, paise: r.paise });
    pairsBy.set(r.groupId, list);
  }

  for (const g of groups) {
    const groupNets = netsBy.get(g.id) ?? new Map<PersonId, number>();
    const pairwise = pairwiseNet(pairsBy.get(g.id) ?? []);
    out.set(g.id, {
      groupId: g.id,
      nets: groupNets,
      edges: g.simplifyDebts ? simplifyDebts(groupNets) : pairwise,
      pairwiseCount: pairwise.length,
    });
  }
  return out;
}

export interface YourView {
  /** Positive: you are owed overall. Negative: you owe. */
  netPaise: number;
  /** People who owe you, largest first. */
  owedToYou: { personId: PersonId; paise: number }[];
  /** People you owe, largest first. */
  youOwe: { personId: PersonId; paise: number }[];
}

/** The group from your point of view: your net, and the edges that involve you. */
export function yourView(balances: GroupBalances | undefined, selfId: PersonId): YourView {
  if (!balances) return { netPaise: 0, owedToYou: [], youOwe: [] };
  const owedToYou = balances.edges
    .filter((e) => e.to === selfId)
    .map((e) => ({ personId: e.from, paise: e.paise }))
    .sort((a, b) => b.paise - a.paise || a.personId - b.personId);
  const youOwe = balances.edges
    .filter((e) => e.from === selfId)
    .map((e) => ({ personId: e.to, paise: e.paise }))
    .sort((a, b) => b.paise - a.paise || a.personId - b.personId);
  return { netPaise: balances.nets.get(selfId) ?? 0, owedToYou, youOwe };
}

export interface FriendBalance {
  personId: PersonId;
  /** Positive: they owe you. Negative: you owe them. */
  netPaise: number;
  perGroup: { groupId: number; paise: number; lastActivity: string | null }[];
}

/**
 * What each friend owes you (or you owe them), summed over every group you
 * share — including the hidden 1:1 group.
 *
 * Per group it counts only the settle-up edges between you and that friend,
 * as the group currently suggests them (simplified or not). So a friend whose
 * debt a simplified group routes through someone else shows 0 there — the
 * same thing Splitwise shows, and the figure a settle-up would actually move.
 */
export function friendBalances(
  groups: readonly GroupRef[],
  balances: ReadonlyMap<number, GroupBalances>,
  selfId: PersonId,
): Map<PersonId, FriendBalance> {
  const out = new Map<PersonId, FriendBalance>();
  const touch = (personId: PersonId) => {
    const f = out.get(personId) ?? { personId, netPaise: 0, perGroup: [] };
    out.set(personId, f);
    return f;
  };

  for (const g of groups) {
    const b = balances.get(g.id);
    if (!b) continue;
    const byFriend = new Map<PersonId, number>();
    for (const e of b.edges) {
      if (e.to === selfId) byFriend.set(e.from, (byFriend.get(e.from) ?? 0) + e.paise);
      else if (e.from === selfId) byFriend.set(e.to, (byFriend.get(e.to) ?? 0) - e.paise);
    }
    for (const [personId, paise] of byFriend) {
      if (paise === 0) continue;
      const f = touch(personId);
      f.netPaise += paise;
      f.perGroup.push({ groupId: g.id, paise, lastActivity: g.lastActivity || null });
    }
  }
  return out;
}

export interface PlannedSettlement {
  groupId: number;
  from: PersonId;
  to: PersonId;
  paise: number;
}

/**
 * Turn "settle up with Rahul" into one settlement per shared group.
 *
 * `full`: clear every group, in whichever direction each one runs — so a
 * group where you owe Rahul ₹200 and another where he owes you ₹700 become
 * two settlements, and he hands you the difference, ₹500.
 *
 * Partial (`paise` less than the balance): only groups running in the
 * overall direction are settled, oldest activity first, each up to its own
 * amount. Never records more than a group owes.
 */
export function planFriendSettlement(
  friend: FriendBalance,
  selfId: PersonId,
  paise: number,
  full: boolean,
): PlannedSettlement[] {
  const edge = (groupId: number, amount: number): PlannedSettlement =>
    amount > 0
      ? { groupId, from: friend.personId, to: selfId, paise: amount }
      : { groupId, from: selfId, to: friend.personId, paise: -amount };

  if (full) return friend.perGroup.filter((g) => g.paise !== 0).map((g) => edge(g.groupId, g.paise));

  const direction = Math.sign(friend.netPaise);
  if (direction === 0 || paise <= 0) return [];
  let left = paise;
  const plan: PlannedSettlement[] = [];
  const candidates = friend.perGroup
    .filter((g) => Math.sign(g.paise) === direction)
    .sort((a, b) => (a.lastActivity ?? '').localeCompare(b.lastActivity ?? '') || a.groupId - b.groupId);
  for (const g of candidates) {
    if (left === 0) break;
    const take = Math.min(left, Math.abs(g.paise));
    plan.push(edge(g.groupId, take * direction));
    left -= take;
  }
  return plan;
}
