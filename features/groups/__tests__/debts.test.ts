import {
  expenseDebts,
  expenseNets,
  netsFromEdges,
  pairwiseNet,
  simplifyDebts,
  type Contribution,
  type Edge,
  type PersonId,
} from '../domain/debts';
import { splitEqual } from '../domain/split';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const AARAV = 1;
const BHAVNA = 2;
const CHIRAG = 3;

/** An expense paid by one person, split equally among `among`. */
function paidBy(payer: PersonId, paise: number, among: PersonId[]) {
  const shares = splitEqual(paise, among.length).map((s, i) => ({ personId: among[i]!, paise: s }));
  return { payers: [{ personId: payer, paise }], shares };
}

function addInto(total: Map<PersonId, number>, part: Map<PersonId, number>) {
  for (const [id, v] of part) total.set(id, (total.get(id) ?? 0) + v);
  for (const [id, v] of total) if (v === 0) total.delete(id);
}

function sorted(m: Map<PersonId, number>) {
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

describe('the Goa trip (the worked example from the plan)', () => {
  const expenses = [
    paidBy(AARAV, 6_000_00, [AARAV, BHAVNA, CHIRAG]), // hotel
    paidBy(BHAVNA, 3_000_00, [AARAV, BHAVNA, CHIRAG]), // cab
    paidBy(CHIRAG, 1_500_00, [AARAV, CHIRAG]), // dinner
  ];

  it('nets: Aarav +2,250 · Bhavna 0 · Chirag −2,250', () => {
    const nets = new Map<PersonId, number>();
    expenses.forEach((e) => addInto(nets, expenseNets(e.payers, e.shares)));
    expect(sorted(nets)).toEqual([
      [AARAV, 2_250_00],
      [CHIRAG, -2_250_00],
    ]);
  });

  it('simplify off: three pairwise payments', () => {
    const edges = expenses.flatMap((e) => expenseDebts(e.payers, e.shares));
    expect(pairwiseNet(edges)).toEqual([
      { from: BHAVNA, to: AARAV, paise: 1_000_00 },
      { from: CHIRAG, to: AARAV, paise: 1_250_00 },
      { from: CHIRAG, to: BHAVNA, paise: 1_000_00 },
    ]);
  });

  it('simplify on: one payment', () => {
    const nets = new Map<PersonId, number>();
    expenses.forEach((e) => addInto(nets, expenseNets(e.payers, e.shares)));
    expect(simplifyDebts(nets)).toEqual([{ from: CHIRAG, to: AARAV, paise: 2_250_00 }]);
  });
});

describe('expenseDebts', () => {
  it('single payer: each participant owes the payer their share, the payer owes nothing', () => {
    const e = paidBy(AARAV, 1_000, [AARAV, BHAVNA, CHIRAG]);
    expect(expenseDebts(e.payers, e.shares)).toEqual([
      { from: BHAVNA, to: AARAV, paise: 333 },
      { from: CHIRAG, to: AARAV, paise: 333 },
    ]);
  });

  it('multiple payers: a debt is spread across creditors near-proportionally', () => {
    // ₹1,200 dinner: Aarav paid 800, Bhavna 400, split equally by 4.
    // Aarav +500, Bhavna +100, Chirag −300, Dev −300.
    const payers: Contribution[] = [
      { personId: AARAV, paise: 800 },
      { personId: BHAVNA, paise: 400 },
    ];
    const shares: Contribution[] = [1, 2, 3, 4].map((id) => ({ personId: id, paise: 300 }));
    const edges = expenseDebts(payers, shares);
    expect(sorted(netsFromEdges(edges))).toEqual(sorted(expenseNets(payers, shares)));
    expect(edges).toEqual([
      { from: CHIRAG, to: AARAV, paise: 250 },
      { from: CHIRAG, to: BHAVNA, paise: 50 },
      { from: 4, to: AARAV, paise: 250 },
      { from: 4, to: BHAVNA, paise: 50 },
    ]);
  });

  it('never over-pays a creditor with odd paise (the independent-allocation trap)', () => {
    // Two creditors +1, two debtors −1: both paise must not go to the same creditor.
    const payers: Contribution[] = [
      { personId: 1, paise: 2 },
      { personId: 2, paise: 2 },
    ];
    const shares: Contribution[] = [
      { personId: 1, paise: 1 },
      { personId: 2, paise: 1 },
      { personId: 3, paise: 1 },
      { personId: 4, paise: 1 },
    ];
    const edges = expenseDebts(payers, shares);
    expect(sorted(netsFromEdges(edges))).toEqual(sorted(expenseNets(payers, shares)));
  });

  it('random multi-payer expenses: edges always reproduce the nets exactly', () => {
    const rand = lcg(2026);
    for (let round = 0; round < 3_000; round++) {
      const people = 2 + Math.floor(rand() * 8);
      const total = 1 + Math.floor(rand() * 2_00_000_00);
      const payerCount = 1 + Math.floor(rand() * people);
      const paid = splitWeights(total, payerCount, rand);
      const payers = paid.map((paise, i) => ({ personId: i + 1, paise }));
      const owed = splitWeights(total, people, rand);
      const shares = owed.map((paise, i) => ({ personId: people - i, paise }));

      const edges = expenseDebts(payers, shares);
      expect(sorted(netsFromEdges(edges))).toEqual(sorted(expenseNets(payers, shares)));
      for (const e of edges) {
        expect(e.paise).toBeGreaterThan(0);
        expect(e.from).not.toBe(e.to);
        expect(Number.isInteger(e.paise)).toBe(true);
      }
    }
  });
});

describe('pairwiseNet', () => {
  it('nets opposite directions and drops pairs that cancel', () => {
    expect(
      pairwiseNet([
        { from: 1, to: 2, paise: 500 },
        { from: 2, to: 1, paise: 200 },
        { from: 3, to: 1, paise: 100 },
        { from: 1, to: 3, paise: 100 },
      ]),
    ).toEqual([{ from: 1, to: 2, paise: 300 }]);
  });
});

describe('simplifyDebts', () => {
  it('pairs exactly opposite balances first, saving a payment greedy alone would spend', () => {
    // A +400, B +600, X −400, Y −300, Z −300.
    // Greedy alone: B←X 400 (B has 200 left) · A←Y 300 · B←Z 200 · A←Z 100 → 4 payments.
    // Pairing A↔X first leaves B +600 against Y and Z → 3 payments, the true minimum.
    const nets = new Map<PersonId, number>([
      [1, 400],
      [2, 600],
      [3, -400],
      [4, -300],
      [5, -300],
    ]);
    expect(simplifyDebts(nets)).toEqual([
      { from: 3, to: 1, paise: 400 },
      { from: 4, to: 2, paise: 300 },
      { from: 5, to: 2, paise: 300 },
    ]);
  });

  it('settles a settled-up group with no payments', () => {
    expect(
      simplifyDebts(
        new Map([
          [1, 0],
          [2, 0],
        ]),
      ),
    ).toEqual([]);
    expect(simplifyDebts(new Map())).toEqual([]);
  });

  it('refuses balances that do not sum to zero', () => {
    expect(() =>
      simplifyDebts(
        new Map([
          [1, 100],
          [2, -99],
        ]),
      ),
    ).toThrow(/sum to zero/);
    expect(() =>
      simplifyDebts(
        new Map([
          [1, 0.5],
          [2, -0.5],
        ]),
      ),
    ).toThrow(/whole paise/);
  });

  it('random groups: nets preserved, at most n − 1 payments, deterministic', () => {
    const rand = lcg(31337);
    for (let round = 0; round < 3_000; round++) {
      const n = 2 + Math.floor(rand() * 14);
      const nets = randomNets(n, rand);
      const nonZero = [...nets.values()].filter((v) => v !== 0).length;

      const transfers = simplifyDebts(nets);
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
      for (const t of transfers) {
        expect(t.paise).toBeGreaterThan(0);
        expect(t.from).not.toBe(t.to);
        // A debtor only ever pays; a creditor only ever receives.
        expect(nets.get(t.from)!).toBeLessThan(0);
        expect(nets.get(t.to)!).toBeGreaterThan(0);
      }
      const expected = new Map(nets);
      for (const [id, v] of expected) if (v === 0) expected.delete(id);
      expect(sorted(netsFromEdges(transfers))).toEqual(sorted(expected));
      expect(simplifyDebts(new Map([...nets.entries()].reverse()))).toEqual(transfers);
    }
  });

  it('random trips: simplified and pairwise views always settle the same balances', () => {
    const rand = lcg(8080);
    for (let round = 0; round < 500; round++) {
      const people = 3 + Math.floor(rand() * 6);
      const edges: Edge[] = [];
      for (let e = 0; e < 1 + Math.floor(rand() * 10); e++) {
        const payer = 1 + Math.floor(rand() * people);
        const among = Array.from({ length: people }, (_, i) => i + 1).filter(() => rand() < 0.7);
        if (among.length === 0) among.push(payer);
        const x = paidBy(payer, 1 + Math.floor(rand() * 50_000_00), among);
        edges.push(...expenseDebts(x.payers, x.shares));
      }
      const nets = netsFromEdges(edges);
      expect(sorted(netsFromEdges(pairwiseNet(edges)))).toEqual(sorted(nets));
      expect(sorted(netsFromEdges(simplifyDebts(nets)))).toEqual(sorted(nets));
    }
  });
});

/** `total` spread over `n` random positive-ish weights, exact. */
function splitWeights(total: number, n: number, rand: () => number): number[] {
  const w = Array.from({ length: n }, () => 1 + Math.floor(rand() * 9));
  const W = w.reduce((a, v) => a + v, 0);
  const parts = w.map((x) => Math.floor((total * x) / W));
  parts[0]! += total - parts.reduce((a, v) => a + v, 0);
  return parts;
}

/** Random integer nets for n people that sum to zero (some may be zero). */
function randomNets(n: number, rand: () => number): Map<PersonId, number> {
  const nets = new Map<PersonId, number>();
  let sum = 0;
  for (let id = 1; id < n; id++) {
    // Mix small and large, and repeat amounts so exact pairs occur.
    const v =
      rand() < 0.2
        ? 0
        : (rand() < 0.5 ? -1 : 1) * [500, 1_000, 2_50_00][Math.floor(rand() * 3)]! * (1 + Math.floor(rand() * 4)) +
          Math.floor(rand() * 3);
    nets.set(id, v);
    sum += v;
  }
  nets.set(n, -sum);
  return nets;
}
