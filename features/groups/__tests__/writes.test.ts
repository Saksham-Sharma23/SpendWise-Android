import { freshDb } from '@/db/__tests__/support';
import { UserFacingError } from '@/lib/db/errors';
import { buildGroupBalances, friendBalances, planFriendSettlement, yourView, type GroupRef } from '../domain/balances';
import { expenseNets, netsFromEdges, type Contribution } from '../domain/debts';
import { splitEqual } from '../domain/split';
import {
  activityQuery,
  groupCategoryQuery,
  groupPeopleQuery,
  groupQuery,
  groupTotalsQuery,
  groupsQuery,
  memberShareQuery,
  membersQuery,
  netsQuery,
  pairwiseQuery,
} from '../data/sql';
import {
  createGroup,
  createPerson,
  deleteExpense,
  deleteGroup,
  deletePerson,
  deleteSettlements,
  getOrCreateDirectGroup,
  recordSettlement,
  recordSettlements,
  restoreExpense,
  restoreGroup,
  saveExpense,
  selfId,
  updateGroup,
  type ExpenseInput,
} from '../data/writes';
import type { AnyDb } from '@/db/types';

/**
 * Groups end to end on the REAL migrated schema: the write core, the shipped
 * SQL builders and the pure balance logic together. The Goa trip is the
 * worked example from the plan.
 */

async function setup() {
  const fresh = await freshDb();
  const w = fresh.db;
  const r = fresh.db;
  const me = selfId(w);
  return { ...fresh, w, r, me };
}

function equalExpense(
  groupId: number,
  payer: number,
  paise: number,
  among: number[],
  description = 'Expense',
): ExpenseInput {
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

async function balancesOf(r: AnyDb, groupId: number, simplify: boolean) {
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
    expect(hotel).toMatchObject({
      kind: 'expense',
      youPaidPaise: 6_000_00,
      youOwePaise: 2_000_00,
      leadPayerId: ctx.me,
      payerCount: 1,
    });
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
    recordSettlement(ctx.w, {
      groupId: goa,
      from: chirag,
      to: ctx.me,
      amountPaise: 1_000_00,
      date: '2026-09-12',
      note: null,
    });
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
    expect(groups.find((g) => g.id === goa)).toMatchObject({
      name: 'Goa 2026',
      memberCount: 2,
      lastActivity: '2026-09-12',
    });
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
    expect(() => saveExpense(ctx.w, equalExpense(group, ctx.me, 1_000, [ctx.me, outsider]))).toThrow(
      /must be in the group/,
    );
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
      {
        ...equalExpense(group, rahul, 1_000, [ctx.me]),
        splitMethod: 'exact',
        shares: [{ personId: ctx.me, paise: 1_000, input: 1_000 }],
      },
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
    recordSettlement(ctx.w, {
      groupId: soloDirect,
      from: solo,
      to: ctx.me,
      amountPaise: 100,
      date: '2026-09-15',
      note: null,
    });
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

/**
 * B14 — no action other than an expense or a settlement may move a balance.
 *
 * `deleteGroup` soft-deleted a group whatever its balances, so unsettled debts
 * vanished from the hub and every member's friend total changed with nothing
 * to explain it. `restoreExpense` and `restoreSettlements` could likewise put
 * a balance back onto somebody who had since left the group — a member may be
 * removed once their balance is zero, and a DELETED expense does not count
 * towards that zero.
 */
describe('balances cannot vanish (B14)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let group: number;
  let rahul: number;

  beforeEach(async () => {
    ctx = await setup();
    rahul = createPerson(ctx.w, 'Rahul');
    group = createGroup(ctx.w, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [rahul] });
  });
  afterEach(() => ctx.sqlite.close());

  it('refuses to delete a group with an unsettled balance, and changes nothing', async () => {
    saveExpense(ctx.w, equalExpense(group, ctx.me, 1_000_00, [ctx.me, rahul], 'Wifi'));

    expect(() => deleteGroup(ctx.w, group)).toThrow(UserFacingError);
    expect(() => deleteGroup(ctx.w, group)).toThrow(/Settle up before deleting this group/);

    const groups = await groupsQuery(ctx.r);
    expect(groups.find((g) => g.id === group)).toBeDefined();
  });

  it('allows deleting a group once everyone is square', async () => {
    saveExpense(ctx.w, equalExpense(group, ctx.me, 1_000_00, [ctx.me, rahul], 'Wifi'));
    recordSettlement(ctx.w, {
      groupId: group,
      from: rahul,
      to: ctx.me,
      amountPaise: 500_00,
      date: '2026-09-11',
      note: null,
    });

    deleteGroup(ctx.w, group);

    const groups = await groupsQuery(ctx.r);
    expect(groups.find((g) => g.id === group)).toBeUndefined();
  });

  it('deletes an empty group without complaint', async () => {
    deleteGroup(ctx.w, group);
    expect((await groupsQuery(ctx.r)).find((g) => g.id === group)).toBeUndefined();
  });

  it('refuses to restore an expense naming someone who has left', async () => {
    saveExpense(ctx.w, equalExpense(group, ctx.me, 1_000_00, [ctx.me, rahul], 'Wifi'));
    const [wifi] = (await activityQuery(ctx.r, group, ctx.me, 50)).filter((x) => x.title === 'Wifi');

    // Deleting the expense returns everyone to zero, which is what lets Rahul
    // be removed at all.
    deleteExpense(ctx.w, wifi!.id);
    updateGroup(ctx.w, group, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [] });

    expect(() => restoreExpense(ctx.w, wifi!.id)).toThrow(/Rahul is no longer in this group/);

    // The group still sums to zero, because the restore changed nothing.
    const nets = await netsQuery(ctx.r, group);
    expect(nets.reduce((a, n) => a + n.netPaise, 0)).toBe(0);
  });

  it('still restores an expense while everyone is present', async () => {
    saveExpense(ctx.w, equalExpense(group, ctx.me, 1_000_00, [ctx.me, rahul], 'Wifi'));
    const [wifi] = (await activityQuery(ctx.r, group, ctx.me, 50)).filter((x) => x.title === 'Wifi');
    const before = await netsQuery(ctx.r, group);

    deleteExpense(ctx.w, wifi!.id);
    restoreExpense(ctx.w, wifi!.id);

    expect(await netsQuery(ctx.r, group)).toEqual(before);
  });
});

/**
 * B21 — the mirror image of B14: deleting or editing an expense, or deleting
 * a settlement, must not move a balance onto someone who has left.
 *
 * Rahul owes you ₹1,000, pays it back, and at zero is removed from the group.
 * Deleting the old expense used to leave him owed ₹1,000 — and nothing could
 * clear it: a settlement needs both people to be members, and he can't be
 * removed as a friend while he has a balance.
 */
describe('balances cannot land on someone who has left (B21)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let group: number;
  let rahul: number;
  let expense: number;
  let payback: number;

  beforeEach(async () => {
    ctx = await setup();
    rahul = createPerson(ctx.w, 'Rahul');
    group = createGroup(ctx.w, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [rahul] });
    expense = saveExpense(ctx.w, {
      ...equalExpense(group, ctx.me, 1_000_00, [rahul], 'Wifi'),
      splitMethod: 'exact',
      shares: [{ personId: rahul, paise: 1_000_00, input: 1_000_00 }],
    });
    payback = recordSettlement(ctx.w, {
      groupId: group,
      from: rahul,
      to: ctx.me,
      amountPaise: 1_000_00,
      date: '2026-09-11',
      note: null,
    });
    updateGroup(ctx.w, group, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [] });
  });
  afterEach(() => ctx.sqlite.close());

  it('starts square, with Rahul gone', async () => {
    expect(await netsQuery(ctx.r, group)).toEqual([]);
    expect((await membersQuery(ctx.r, group)).map((m) => m.id)).toEqual([ctx.me]);
  });

  it('refuses to delete the expense, and changes nothing', async () => {
    expect(() => deleteExpense(ctx.w, expense)).toThrow(UserFacingError);
    expect(() => deleteExpense(ctx.w, expense)).toThrow(
      /Rahul is no longer in this group, so that expense can’t be deleted/,
    );
    expect(await netsQuery(ctx.r, group)).toEqual([]);
  });

  it('refuses to delete the settlement, and changes nothing', async () => {
    expect(() => deleteSettlements(ctx.w, [payback])).toThrow(
      /Rahul is no longer in this group, so that settlement can’t be deleted/,
    );
    expect(await netsQuery(ctx.r, group)).toEqual([]);
  });

  it('refuses to edit the expense, and keeps its payers and shares', async () => {
    const edit: ExpenseInput = { ...equalExpense(group, ctx.me, 1_000_00, [ctx.me], 'Wifi') };
    expect(() => saveExpense(ctx.w, edit, expense)).toThrow(/so that expense can’t be changed/);

    const stored = ctx.sqlite.prepare('SELECT person_id, owed_paise FROM split_expense_shares WHERE expense_id = ?');
    expect(stored.all(expense)).toEqual([{ person_id: rahul, owed_paise: 1_000_00 }]);
    expect(await netsQuery(ctx.r, group)).toEqual([]);
  });

  it('still deletes and edits while everyone is present', async () => {
    updateGroup(ctx.w, group, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [rahul] });

    saveExpense(ctx.w, { ...equalExpense(group, ctx.me, 1_000_00, [ctx.me, rahul], 'Wifi') }, expense);
    deleteSettlements(ctx.w, [payback]);
    deleteExpense(ctx.w, expense);

    expect(await netsQuery(ctx.r, group)).toEqual([]);
  });

  it('refuses to delete an expense twice', () => {
    updateGroup(ctx.w, group, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [rahul] });
    deleteExpense(ctx.w, expense);
    expect(() => deleteExpense(ctx.w, expense)).toThrow(/no longer exists/);
  });
});

describe('restoring a group whose member was removed as a friend', () => {
  it('refuses, naming them, and leaves the group deleted', async () => {
    const ctx = await setup();
    const rahul = createPerson(ctx.w, 'Rahul');
    const group = createGroup(ctx.w, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [rahul] });

    // A square group can be deleted, and then Rahul is in no LIVE group, so he can be removed.
    deleteGroup(ctx.w, group);
    deletePerson(ctx.w, rahul);

    expect(() => restoreGroup(ctx.w, group)).toThrow(/Rahul is no longer one of your friends/);
    expect((await groupsQuery(ctx.r)).find((g) => g.id === group)).toBeUndefined();
    ctx.sqlite.close();
  });

  it('restores a group whose members are all still friends', async () => {
    const ctx = await setup();
    const rahul = createPerson(ctx.w, 'Rahul');
    const group = createGroup(ctx.w, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [rahul] });

    deleteGroup(ctx.w, group);
    restoreGroup(ctx.w, group);

    expect((await groupsQuery(ctx.r)).find((g) => g.id === group)).toBeDefined();
    ctx.sqlite.close();
  });
});

describe('one group, one query (B28)', () => {
  it('groupQuery returns the same row groupsQuery lists, and nothing once deleted', async () => {
    const ctx = await setup();
    const rahul = createPerson(ctx.w, 'Rahul');
    const group = createGroup(ctx.w, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [rahul] });
    saveExpense(ctx.w, equalExpense(group, ctx.me, 1_000_00, [ctx.me, rahul], 'Wifi'));

    const fromList = (await groupsQuery(ctx.r)).find((g) => g.id === group);
    expect(await groupQuery(ctx.r, group)).toEqual([fromList]);

    recordSettlement(ctx.w, {
      groupId: group,
      from: rahul,
      to: ctx.me,
      amountPaise: 500_00,
      date: '2026-09-11',
      note: null,
    });
    deleteGroup(ctx.w, group);
    expect(await groupQuery(ctx.r, group)).toEqual([]);
    ctx.sqlite.close();
  });

  it("groupPeopleQuery names everyone the group's history can mention, removed members included", async () => {
    const ctx = await setup();
    const rahul = createPerson(ctx.w, 'Rahul');
    const priya = createPerson(ctx.w, 'Priya');
    createPerson(ctx.w, 'Stranger');
    const group = createGroup(ctx.w, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [rahul, priya] });
    updateGroup(ctx.w, group, { name: 'Flat', icon: 'house', simplifyDebts: true, memberIds: [priya] });

    const names = (await groupPeopleQuery(ctx.r, group)).map((p) => p.name).sort();
    expect(names).toEqual(['Priya', 'Rahul', 'You'].sort());
    ctx.sqlite.close();
  });
});
