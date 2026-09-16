import { freshDb } from '../../../db/__tests__/support';
import { UserFacingError } from '../../../lib/db/errors';
import {
  buildGroupBalances,
  friendBalances,
  planFriendSettlement,
  yourView,
  type GroupRef,
} from '../balances';
import { expenseNets, netsFromEdges, type Contribution } from '../debts';
import { splitEqual } from '../split';
import {
  activityQuery,
  groupCategoryQuery,
  groupTotalsQuery,
  groupsQuery,
  memberShareQuery,
  membersQuery,
  netsQuery,
  pairwiseQuery,
  type GroupsDb,
} from '../sql';
import {
  createGroup,
  createPerson,
  deleteExpense,
  deletePerson,
  getOrCreateDirectGroup,
  recordSettlement,
  recordSettlements,
  restoreExpense,
  saveExpense,
  selfId,
  updateGroup,
  type ExpenseInput,
  type GroupsWriteDb,
} from '../writes';

/**
 * Groups end to end on the REAL migrated schema: the write core, the shipped
 * SQL builders and the pure balance logic together. The Goa trip is the
 * worked example from the plan.
 */

async function setup() {
  const fresh = await freshDb();
  const w = fresh.db as unknown as GroupsWriteDb;
  const r = fresh.db as unknown as GroupsDb;
  const me = selfId(w);
  return { ...fresh, w, r, me };
}

function equalExpense(groupId: number, payer: number, paise: number, among: number[], description = 'Expense'): ExpenseInput {
  const parts = splitEqual(paise, among.length);
  return {
    groupId,
    description,
    amountPaise: paise,
    date: '2026-09-10',
    categoryId: null,
    splitMethod: 'equal',
    note: null,
    payers: [{ personId: payer, paise }],
    shares: among.map((personId, i) => ({ personId, paise: parts[i]!, input: null })),
  };
}

async function balancesOf(r: GroupsDb, groupId: number, simplify: boolean) {
  const groups: GroupRef[] = [{ id: groupId, simplifyDebts: simplify, lastActivity: null, directPersonId: null }];
  const nets = await netsQuery(r, groupId);
  const pairs = await pairwiseQuery(r, groupId);
  return buildGroupBalances(groups, nets, pairs).get(groupId)!;
}

describe('the Goa trip, written and read back', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let goa: number;
  let bhavna: number;
  let chirag: number;

  beforeAll(async () => {
    ctx = await setup();
    const { w, me } = ctx;
    bhavna = createPerson(w, 'Bhavna');
    chirag = createPerson(w, '  Chirag ');
    goa = createGroup(w, { name: 'Goa trip', icon: 'plane', simplifyDebts: true, memberIds: [bhavna, chirag] });

    saveExpense(w, equalExpense(goa, me, 6_000_00, [me, bhavna, chirag], 'Hotel'));
    saveExpense(w, equalExpense(goa, bhavna, 3_000_00, [me, bhavna, chirag], 'Cab'));
    saveExpense(w, equalExpense(goa, chirag, 1_500_00, [me, chirag], 'Dinner'));
  });
  afterAll(() => ctx.sqlite.close());

  it('adds you to the group automatically, you first', async () => {
    const members = await membersQuery(ctx.r, goa);
    expect(members.map((m) => m.name)).toEqual(['You', 'Bhavna', 'Chirag']);
  });

  it('nets from SQL: you +2,250 · Chirag −2,250, and they sum to zero', async () => {
    const nets = await netsQuery(ctx.r, goa);
    expect(nets).toEqual([
      { groupId: goa, personId: ctx.me, netPaise: 2_250_00 },
      { groupId: goa, personId: chirag, netPaise: -2_250_00 },
    ]);
  });

  it('simplify on: one payment; the explainer knows pairwise would take three', async () => {
    const b = await balancesOf(ctx.r, goa, true);
    expect(b.edges).toEqual([{ from: chirag, to: ctx.me, paise: 2_250_00 }]);
    expect(b.pairwiseCount).toBe(3);
  });

  it('simplify off: the three pairwise paybacks', async () => {
    const b = await balancesOf(ctx.r, goa, false);
    expect(b.edges).toEqual([
      { from: bhavna, to: ctx.me, paise: 1_000_00 },
      { from: chirag, to: ctx.me, paise: 1_250_00 },
      { from: chirag, to: bhavna, paise: 1_000_00 },
    ]);
  });

  it('your view of the group', async () => {
    const view = yourView(await balancesOf(ctx.r, goa, true), ctx.me);
    expect(view).toEqual({ netPaise: 2_250_00, owedToYou: [{ personId: chirag, paise: 2_250_00 }], youOwe: [] });
  });

  it('activity: newest first, with what you lent or borrowed and who paid', async () => {
    const rows = await activityQuery(ctx.r, goa, ctx.me, 50);
    expect(rows).toHaveLength(3);
    const hotel = rows.find((x) => x.title === 'Hotel')!;
    expect(hotel).toMatchObject({ kind: 'expense', youPaidPaise: 6_000_00, youOwePaise: 2_000_00, leadPayerId: ctx.me, payerCount: 1 });
    const cab = rows.find((x) => x.title === 'Cab')!;
    expect(cab).toMatchObject({ youPaidPaise: 0, youOwePaise: 1_000_00, leadPayerId: bhavna });
  });

  it('totals: group spend, your share and what you paid', async () => {
    const [t] = await groupTotalsQuery(ctx.r, goa, ctx.me);
    expect(t).toEqual({ totalPaise: 10_500_00, count: 3, yourSharePaise: 3_750_00, youPaidPaise: 6_000_00 });
    const shares = await memberShareQuery(ctx.r, goa);
    expect(shares.reduce((a, s) => a + s.owedPaise, 0)).toBe(10_500_00);
    const cats = await groupCategoryQuery(ctx.r, goa);
    expect(cats).toEqual([{ id: null, name: null, icon: null, color: null, totalPaise: 10_500_00 }]);
  });

  it('a partial settlement moves the nets and the suggestion', async () => {
    recordSettlement(ctx.w, { groupId: goa, from: chirag, to: ctx.me, amountPaise: 1_000_00, date: '2026-09-12', note: null });
    const b = await balancesOf(ctx.r, goa, true);
    expect(b.edges).toEqual([{ from: chirag, to: ctx.me, paise: 1_250_00 }]);
    const activity = await activityQuery(ctx.r, goa, ctx.me, 50);
    expect(activity[0]).toMatchObject({ kind: 'settlement', fromId: chirag, toId: ctx.me, amountPaise: 1_000_00 });
  });

  it('refuses to remove a member who still has a balance, naming the amount', () => {
    expect(() =>
      updateGroup(ctx.w, goa, { name: 'Goa trip', icon: 'plane', simplifyDebts: true, memberIds: [bhavna] }),
    ).toThrow(/Chirag still owes ₹1,250\.00/);
    // …and the refused write changed nothing, including the name/toggle.
    return membersQuery(ctx.r, goa).then((m) => expect(m).toHaveLength(3));
  });

  it('removes a settled-up member', async () => {
    updateGroup(ctx.w, goa, { name: 'Goa 2026', icon: 'plane', simplifyDebts: true, memberIds: [chirag] });
    const members = await membersQuery(ctx.r, goa);
    expect(members.map((m) => m.name)).toEqual(['You', 'Chirag']);
    const groups = await groupsQuery(ctx.r);
    expect(groups.find((g) => g.id === goa)).toMatchObject({ name: 'Goa 2026', memberCount: 2, lastActivity: '2026-09-12' });
  });

  it('delete and undo an expense', async () => {
    const before = await netsQuery(ctx.r, goa);
    const [dinner] = (await activityQuery(ctx.r, goa, ctx.me, 50)).filter((x) => x.title === 'Dinner');
    deleteExpense(ctx.w, dinner!.id);
    expect(await netsQuery(ctx.r, goa)).not.toEqual(before);
    restoreExpense(ctx.w, dinner!.id);
    expect(await netsQuery(ctx.r, goa)).toEqual(before);
  });
});

describe('expense validation', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let group: number;
  let rahul: number;
  let outsider: number;

  beforeAll(async () => {
    ctx = await setup();
    rahul = createPerson(ctx.w, 'Rahul');
    outsider = createPerson(ctx.w, 'Outsider');
    group = createGroup(ctx.w, { name: 'Flat', icon: null, simplifyDebts: true, memberIds: [rahul] });
  });
  afterAll(() => ctx.sqlite.close());

  it('rejects payers that do not add up, with a readable message', () => {
    const e = equalExpense(group, ctx.me, 1_000, [ctx.me, rahul]);
    e.payers = [{ personId: ctx.me, paise: 900 }];
    expect(() => saveExpense(ctx.w, e)).toThrow(UserFacingError);
    expect(() => saveExpense(ctx.w, e)).toThrow(/payers add up to ₹9\.00, not ₹10\.00/);
  });

  it('rejects a split that does not add up', () => {
    const e = equalExpense(group, ctx.me, 1_000, [ctx.me, rahul]);
    e.shares[0]!.paise = 1;
    expect(() => saveExpense(ctx.w, e)).toThrow(/split adds up/);
  });

  it('rejects someone who is not in the group', () => {
    expect(() => saveExpense(ctx.w, equalExpense(group, ctx.me, 1_000, [ctx.me, outsider]))).toThrow(/must be in the group/);
  });

  it('rejects zero, fractional and missing values', () => {
    expect(() => saveExpense(ctx.w, equalExpense(group, ctx.me, 0, [ctx.me]))).toThrow(/more than zero/);
    const noName = equalExpense(group, ctx.me, 1_000, [ctx.me, rahul]);
    noName.description = '   ';
    expect(() => saveExpense(ctx.w, noName)).toThrow(/description/);
  });

  it('writes nothing when a write is refused', async () => {
    const e = equalExpense(group, ctx.me, 1_000, [ctx.me, rahul]);
    e.payers = [{ personId: ctx.me, paise: 1 }];
    expect(() => saveExpense(ctx.w, e)).toThrow();
    expect(await activityQuery(ctx.r, group, ctx.me, 10)).toEqual([]);
  });

  it('editing replaces payers, shares and derived debts completely', async () => {
    const id = saveExpense(ctx.w, equalExpense(group, ctx.me, 1_000, [ctx.me, rahul]));
    // Now Rahul paid it all and it was only for you.
    saveExpense(
      ctx.w,
      { ...equalExpense(group, rahul, 1_000, [ctx.me]), splitMethod: 'exact', shares: [{ personId: ctx.me, paise: 1_000, input: 1_000 }] },
      id,
    );
    const nets = await netsQuery(ctx.r, group);
    expect(nets).toEqual([
      { groupId: group, personId: ctx.me, netPaise: -1_000 },
      { groupId: group, personId: rahul, netPaise: 1_000 },
    ]);
    const pairs = await pairwiseQuery(ctx.r, group);
    expect(pairs).toEqual([{ groupId: group, from: ctx.me, to: rahul, paise: 1_000 }]);
  });
});

describe('friends across groups', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let rahul: number;
  let priya: number;
  let flat: number;
  let trip: number;
  let direct: number;

  beforeAll(async () => {
    ctx = await setup();
    const { w, me } = ctx;
    rahul = createPerson(w, 'Rahul');
    priya = createPerson(w, 'Priya');
    flat = createGroup(w, { name: 'Flat', icon: null, simplifyDebts: false, memberIds: [rahul, priya] });
    trip = createGroup(w, { name: 'Trip', icon: null, simplifyDebts: true, memberIds: [rahul] });

    // Flat (older): Rahul owes you 700.
    saveExpense(w, { ...equalExpense(flat, me, 1_400_00, [me, rahul]), date: '2026-08-01' });
    // Trip (newer): you owe Rahul 200.
    saveExpense(w, { ...equalExpense(trip, rahul, 400_00, [me, rahul]), date: '2026-09-01' });
    // 1:1: Rahul owes you 300.
    direct = getOrCreateDirectGroup(w, rahul);
    saveExpense(w, { ...equalExpense(direct, me, 600_00, [me, rahul]), date: '2026-09-05' });
  });
  afterAll(() => ctx.sqlite.close());

  async function snapshot() {
    const groups = (await groupsQuery(ctx.r)).map((g) => ({ ...g, lastActivity: g.lastActivity || null }));
    const balances = buildGroupBalances(groups, await netsQuery(ctx.r, null), await pairwiseQuery(ctx.r, null));
    return { groups, balances, friends: friendBalances(groups, balances, ctx.me) };
  }

  it('reuses one hidden 1:1 group per friend', () => {
    expect(getOrCreateDirectGroup(ctx.w, rahul)).toBe(direct);
  });

  it('sums a friend across every shared group, including the 1:1 group', async () => {
    const { friends } = await snapshot();
    const r = friends.get(rahul)!;
    expect(r.netPaise).toBe(700_00 - 200_00 + 300_00);
    expect(r.perGroup.map((g) => [g.groupId, g.paise])).toEqual(
      expect.arrayContaining([
        [flat, 700_00],
        [trip, -200_00],
        [direct, 300_00],
      ]),
    );
    expect(friends.get(priya)).toBeUndefined();
  });

  it('a partial settle-up goes to the oldest group first, in the overall direction', async () => {
    const { friends } = await snapshot();
    const plan = planFriendSettlement(friends.get(rahul)!, ctx.me, 800_00, false);
    expect(plan).toEqual([
      { groupId: flat, from: rahul, to: ctx.me, paise: 700_00 },
      { groupId: direct, from: rahul, to: ctx.me, paise: 100_00 },
    ]);
  });

  it('a full settle-up clears every shared group in one transaction', async () => {
    const { friends } = await snapshot();
    const plan = planFriendSettlement(friends.get(rahul)!, ctx.me, 800_00, true);
    const handed = plan.reduce((a, p) => a + (p.to === ctx.me ? p.paise : -p.paise), 0);
    expect(handed).toBe(800_00);
    recordSettlements(ctx.w, plan, '2026-09-15');
    const after = await snapshot();
    expect(after.friends.get(rahul)).toBeUndefined();
  });

  it('will not remove a friend who is still in a group', () => {
    expect(() => deletePerson(ctx.w, rahul)).toThrow(/still in Flat/);
  });

  it('removes a friend with no groups and no balance, taking their 1:1 group with them', async () => {
    const solo = createPerson(ctx.w, 'Solo');
    const soloDirect = getOrCreateDirectGroup(ctx.w, solo);
    saveExpense(ctx.w, equalExpense(soloDirect, ctx.me, 200, [ctx.me, solo]));
    expect(() => deletePerson(ctx.w, solo)).toThrow(/Settle up with Solo/);
    recordSettlement(ctx.w, { groupId: soloDirect, from: solo, to: ctx.me, amountPaise: 100, date: '2026-09-15', note: null });
    deletePerson(ctx.w, solo);
    expect((await groupsQuery(ctx.r)).some((g) => g.id === soloDirect)).toBe(false);
  });
});

describe('random groups: SQL balances always match the expenses behind them', () => {
  it('nets sum to zero per group and equal a direct recomputation', async () => {
    const ctx = await setup();
    let s = 99;
    const rand = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
    const friendIds = Array.from({ length: 6 }, (_, i) => createPerson(ctx.w, `F${i}`));
    const group = createGroup(ctx.w, { name: 'Random', icon: null, simplifyDebts: true, memberIds: friendIds });
    const everyone = [ctx.me, ...friendIds];
    const expected = new Map<number, number>();

    for (let i = 0; i < 300; i++) {
      const amount = 1 + Math.floor(rand() * 20_000_00);
      const payerCount = 1 + Math.floor(rand() * 3);
      const payerIds = everyone.filter(() => rand() < 0.5).slice(0, payerCount);
      if (payerIds.length === 0) payerIds.push(everyone[0]!);
      const paid = splitEqual(amount, payerIds.length);
      const payers: Contribution[] = payerIds.map((personId, j) => ({ personId, paise: paid[j]! }));
      const among = everyone.filter(() => rand() < 0.6);
      if (among.length === 0) among.push(everyone[1]!);
      const owed = splitEqual(amount, among.length);
      const shares = among.map((personId, j) => ({ personId, paise: owed[j]!, input: null }));

      saveExpense(ctx.w, {
        groupId: group,
        description: `E${i}`,
        amountPaise: amount,
        date: '2026-09-01',
        categoryId: null,
        splitMethod: 'equal',
        note: null,
        payers,
        shares,
      });
      for (const [id, v] of expenseNets(payers, shares)) expected.set(id, (expected.get(id) ?? 0) + v);
    }

    const rows = await netsQuery(ctx.r, group);
    expect(rows.reduce((a, row) => a + row.netPaise, 0)).toBe(0);
    for (const row of rows) expect(row.netPaise).toBe(expected.get(row.personId));

    const b = await balancesOf(ctx.r, group, true);
    const fromTransfers = netsFromEdges(b.edges);
    for (const row of rows) expect(fromTransfers.get(row.personId)).toBe(row.netPaise);
    expect(b.edges.length).toBeLessThanOrEqual(everyone.length - 1);

    const pairwise = await balancesOf(ctx.r, group, false);
    const fromPairs = netsFromEdges(pairwise.edges);
    for (const row of rows) expect(fromPairs.get(row.personId)).toBe(row.netPaise);
    ctx.sqlite.close();
  }, 120_000);
});
