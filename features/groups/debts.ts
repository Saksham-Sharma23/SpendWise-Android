import { MaxHeap } from '../../lib/heap';
import { allocate } from './split';

/**
 * Balances and "who owes whom" — pure integer arithmetic.
 *
 * Vocabulary:
 *   net      a person's balance in a group: what they paid (plus settlements
 *            they sent) minus what they owe (plus settlements they received).
 *            Positive = the group owes them. Nets in a group always sum to 0.
 *   edge     "A owes B ₹x" between two specific people.
 *   transfer a suggested payment that settles balances.
 *
 * Tested in `__tests__/debts.test.ts`, including random groups whose nets must
 * survive simplification unchanged.
 */

export type PersonId = number;

export interface Contribution {
  personId: PersonId;
  paise: number;
}

/** `from` owes `to` `paise`. */
export interface Edge {
  from: PersonId;
  to: PersonId;
  paise: number;
}

/** Per person, paid − owed for one expense. People with a zero net are omitted. */
export function expenseNets(payers: readonly Contribution[], shares: readonly Contribution[]): Map<PersonId, number> {
  const nets = new Map<PersonId, number>();
  for (const p of payers) nets.set(p.personId, (nets.get(p.personId) ?? 0) + p.paise);
  for (const s of shares) nets.set(s.personId, (nets.get(s.personId) ?? 0) - s.paise);
  for (const [id, v] of nets) if (v === 0) nets.delete(id);
  return nets;
}

/**
 * Who owes whom inside ONE expense.
 *
 * With one payer this is simply "each participant owes the payer their share".
 * With several payers, each debtor's debt is spread across the creditors in
 * proportion to what each creditor is STILL owed (largest-remainder, exact in
 * paise). Using the remaining amount rather than the original one is what
 * keeps every creditor's total exact: spreading each debtor independently
 * could hand two debtors' odd paisa to the same creditor and over-pay them.
 *
 * Debtors and creditors are processed in person-id order, so the result is
 * deterministic.
 */
export function expenseDebts(payers: readonly Contribution[], shares: readonly Contribution[]): Edge[] {
  const nets = expenseNets(payers, shares);
  const ids = [...nets.keys()].sort((a, b) => a - b);
  const creditors = ids.filter((id) => nets.get(id)! > 0);
  const debtors = ids.filter((id) => nets.get(id)! < 0);
  const remaining = creditors.map((id) => nets.get(id)!);

  const edges: Edge[] = [];
  for (const debtor of debtors) {
    const owed = -nets.get(debtor)!;
    const parts = allocate(owed, remaining);
    parts.forEach((paise, j) => {
      if (paise <= 0) return;
      remaining[j]! -= paise;
      edges.push({ from: debtor, to: creditors[j]!, paise });
    });
  }
  return edges;
}

/**
 * Net each pair of people against each other: "A owes B ₹500" and "B owes A
 * ₹200" become "A owes B ₹300". This is the SIMPLIFY-OFF view — everyone pays
 * back exactly the people they owe. Sorted by debtor, then creditor.
 */
export function pairwiseNet(edges: readonly Edge[]): Edge[] {
  const byPair = new Map<string, { lo: PersonId; hi: PersonId; paise: number }>();
  for (const e of edges) {
    if (e.from === e.to || e.paise === 0) continue;
    const lo = Math.min(e.from, e.to);
    const hi = Math.max(e.from, e.to);
    const key = `${lo}:${hi}`;
    const entry = byPair.get(key) ?? { lo, hi, paise: 0 };
    // Positive means lo owes hi.
    entry.paise += e.from === lo ? e.paise : -e.paise;
    byPair.set(key, entry);
  }
  const out: Edge[] = [];
  for (const { lo, hi, paise } of byPair.values()) {
    if (paise > 0) out.push({ from: lo, to: hi, paise });
    else if (paise < 0) out.push({ from: hi, to: lo, paise: -paise });
  }
  return out.sort((a, b) => a.from - b.from || a.to - b.to);
}

/** The nets implied by a set of edges (from: −, to: +). Zero nets omitted. */
export function netsFromEdges(edges: readonly Edge[]): Map<PersonId, number> {
  const nets = new Map<PersonId, number>();
  for (const e of edges) {
    nets.set(e.from, (nets.get(e.from) ?? 0) - e.paise);
    nets.set(e.to, (nets.get(e.to) ?? 0) + e.paise);
  }
  for (const [id, v] of nets) if (v === 0) nets.delete(id);
  return nets;
}

interface Party {
  id: PersonId;
  paise: number;
}

/** Larger amount first; on a tie, the lower person id — so output never reshuffles. */
const byAmountThenId = (a: Party, b: Party) => a.paise - b.paise || b.id - a.id;

/**
 * Suggest the payments that settle a group — Splitwise's "simplify debts".
 *
 *   1. Exactly equal-and-opposite balances (+₹500 and −₹500) are paired first,
 *      one payment each. Greedy matching alone can split such a pair across
 *      other people and use an extra payment.
 *   2. Everyone else goes into two max-heaps — creditors by what they are
 *      owed, debtors by what they owe. The largest debtor pays the largest
 *      creditor min(debt, credit); whoever has something left goes back in.
 *
 * Every round settles at least one person completely, so a group of n people
 * with balances needs at most n − 1 payments, found in O(n log n). Nobody's
 * net changes. (The true minimum is NP-hard — it means partitioning balances
 * into zero-sum subsets — and this greedy is what Splitwise ships.)
 *
 * Throws if the nets do not sum to zero: that is a broken invariant upstream,
 * and suggesting payments on top of it would move money that doesn't exist.
 */
export function simplifyDebts(nets: ReadonlyMap<PersonId, number>): Edge[] {
  let sum = 0;
  for (const v of nets.values()) {
    if (!Number.isSafeInteger(v)) throw new Error(`Balances must be whole paise, got ${v}`);
    sum += v;
  }
  if (sum !== 0) throw new Error(`Balances must sum to zero, got ${sum}`);

  const creditors: Party[] = [];
  const debtors: Party[] = [];
  for (const [id, v] of nets) {
    if (v > 0) creditors.push({ id, paise: v });
    else if (v < 0) debtors.push({ id, paise: -v });
  }
  creditors.sort((a, b) => byAmountThenId(b, a));
  debtors.sort((a, b) => byAmountThenId(b, a));

  const transfers: Edge[] = [];

  // 1. Pair exact matches. Debtors waiting at each amount, lowest id first.
  const waiting = new Map<number, Party[]>();
  for (const d of debtors) {
    const list = waiting.get(d.paise) ?? [];
    list.push(d);
    waiting.set(d.paise, list);
  }
  const paired = new Set<Party>();
  for (const c of creditors) {
    const match = waiting.get(c.paise)?.shift();
    if (!match) continue;
    transfers.push({ from: match.id, to: c.id, paise: c.paise });
    paired.add(c);
    paired.add(match);
  }

  // 2. Greedy on two max-heaps.
  const credit = new MaxHeap<Party>(byAmountThenId);
  const debt = new MaxHeap<Party>(byAmountThenId);
  for (const c of creditors) if (!paired.has(c)) credit.push({ ...c });
  for (const d of debtors) if (!paired.has(d)) debt.push({ ...d });

  while (credit.size > 0 && debt.size > 0) {
    const c = credit.pop()!;
    const d = debt.pop()!;
    const paise = Math.min(c.paise, d.paise);
    transfers.push({ from: d.id, to: c.id, paise });
    if (c.paise > paise) credit.push({ id: c.id, paise: c.paise - paise });
    if (d.paise > paise) debt.push({ id: d.id, paise: d.paise - paise });
  }

  return transfers.sort((a, b) => b.paise - a.paise || a.from - b.from || a.to - b.to);
}
