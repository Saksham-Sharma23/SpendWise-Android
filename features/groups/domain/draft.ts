import type { SplitMethod } from '@/db/schema';
import { parseAmountToPaise } from '@/lib/money';
import type { Contribution, PersonId } from './debts';
import { FULL_PERCENT_BP, parsePercent, splitEqual, splitExact, splitPercent, splitShares } from './split';
import type { ShareInput } from '../data/writes';

/**
 * The expense form's state as the user typed it, and what it adds up to.
 *
 * Every input stays the STRING that was typed until this file turns it into
 * integer paise (lib/money) or basis points (./split) — no float anywhere.
 * `evaluate` is what drives the live "₹120 left" footers and the Save
 * button, and what the form finally saves, so the screen can never save
 * something it did not show. Pure; tested in `__tests__/draft.test.ts`.
 */

export interface Draft {
  amount: string;
  /** One payer, or several with an amount each. */
  paidMode: 'single' | 'multiple';
  payerId: PersonId;
  paid: Record<PersonId, string>;
  method: SplitMethod;
  /** Equal split: who is in. */
  included: Record<PersonId, boolean>;
  exact: Record<PersonId, string>;
  percent: Record<PersonId, string>;
  shares: Record<PersonId, string>;
}

export function emptyDraft(memberIds: readonly PersonId[], selfId: PersonId): Draft {
  return {
    amount: '',
    paidMode: 'single',
    payerId: selfId,
    paid: {},
    method: 'equal',
    included: Object.fromEntries(memberIds.map((id) => [id, true])),
    exact: {},
    percent: {},
    shares: Object.fromEntries(memberIds.map((id) => [id, '1'])),
  };
}

export interface Evaluation {
  /** Null while the amount is empty or not a number. */
  amountPaise: number | null;
  payers: Contribution[] | null;
  /** Paise still to assign across payers (multiple mode); 0 when it balances. */
  paidRemaining: number;
  shares: ShareInput[] | null;
  /** Paise (exact) or basis points (percent) still to assign; 0 when it balances. */
  splitRemaining: number;
  /** Equal split: what each included person pays. */
  perPersonPaise: number | null;
  /** The first thing stopping Save, in words — null when the expense can be saved. */
  problem: string | null;
}

const orZero = (v: string | undefined) => (v == null || v.trim() === '' ? 0 : parseAmountToPaise(v));

/** Turn the draft into exact payers and shares for `memberIds`, or say what is wrong. */
export function evaluate(draft: Draft, memberIds: readonly PersonId[]): Evaluation {
  const amount = draft.amount.trim() === '' ? null : parseAmountToPaise(draft.amount);
  const base: Evaluation = {
    amountPaise: amount != null && amount > 0 ? amount : null,
    payers: null,
    paidRemaining: 0,
    shares: null,
    splitRemaining: 0,
    perPersonPaise: null,
    problem: null,
  };
  if (amount == null || amount <= 0) return { ...base, problem: 'Enter an amount' };

  // --- paid by -------------------------------------------------------------
  let payers: Contribution[] | null = null;
  let paidRemaining = 0;
  let problem: string | null = null;
  if (draft.paidMode === 'single') {
    payers = [{ personId: draft.payerId, paise: amount }];
  } else {
    const parts = memberIds.map((id) => ({ personId: id, paise: orZero(draft.paid[id]) }));
    if (parts.some((p) => p.paise == null)) {
      problem = 'One of the paid amounts is not a number';
    } else {
      const list = parts as Contribution[];
      paidRemaining = amount - list.reduce((a, p) => a + p.paise, 0);
      if (paidRemaining !== 0)
        problem = paidRemaining > 0 ? 'Paid amounts are short of the total' : 'Paid amounts are more than the total';
      else payers = list.filter((p) => p.paise > 0);
    }
  }

  // --- split ---------------------------------------------------------------
  let shares: ShareInput[] | null = null;
  let splitRemaining = 0;
  let perPersonPaise: number | null = null;

  if (draft.method === 'equal') {
    const inIds = memberIds.filter((id) => draft.included[id]);
    if (inIds.length === 0) {
      problem ??= 'Pick at least one person to split with';
    } else {
      const parts = splitEqual(amount, inIds.length);
      shares = inIds.map((personId, i) => ({ personId, paise: parts[i]!, input: null }));
      perPersonPaise = parts[parts.length - 1]!;
    }
  } else if (draft.method === 'exact') {
    const values = memberIds.map((id) => orZero(draft.exact[id]));
    if (values.some((v) => v == null)) {
      problem ??= 'One of the amounts is not a number';
    } else {
      const check = splitExact(amount, values as number[]);
      if (check.ok)
        shares = memberIds.map((personId, i) => ({ personId, paise: check.shares[i]!, input: check.shares[i]! }));
      else {
        splitRemaining = check.reason === 'mismatch' ? check.remaining : 0;
        problem ??= splitRemaining > 0 ? 'The split is short of the total' : 'The split is more than the total';
      }
    }
  } else if (draft.method === 'percent') {
    const values = memberIds.map((id) => {
      const raw = draft.percent[id];
      return raw == null || raw.trim() === '' ? 0 : parsePercent(raw);
    });
    if (values.some((v) => v == null)) {
      problem ??= 'Percentages can have up to two decimals';
    } else {
      const bp = values as number[];
      const check = splitPercent(amount, bp);
      if (check.ok) shares = memberIds.map((personId, i) => ({ personId, paise: check.shares[i]!, input: bp[i]! }));
      else {
        splitRemaining = check.reason === 'mismatch' ? check.remaining : FULL_PERCENT_BP;
        problem ??= 'Percentages must add up to 100%';
      }
    }
  } else {
    const values = memberIds.map((id) => {
      const raw = (draft.shares[id] ?? '').trim();
      if (raw === '') return 0;
      return /^\d{1,4}$/.test(raw) ? Number(raw) : null;
    });
    if (values.some((v) => v == null)) {
      problem ??= 'Shares must be whole numbers';
    } else {
      const units = values as number[];
      const check = splitShares(amount, units);
      if (check.ok) shares = memberIds.map((personId, i) => ({ personId, paise: check.shares[i]!, input: units[i]! }));
      else problem ??= 'Give at least one person a share';
    }
  }

  const liveShares = shares?.filter((s) => s.paise > 0) ?? null;
  if (liveShares && liveShares.length === 0) problem ??= 'Pick at least one person to split with';

  return {
    amountPaise: amount,
    payers,
    paidRemaining,
    shares: liveShares,
    splitRemaining,
    perPersonPaise,
    problem,
  };
}

/** Rebuild a draft from a saved expense, so editing shows exactly what was typed. */
export function draftFromExpense(
  expense: {
    amountPaise: number;
    splitMethod: SplitMethod;
    payers: Contribution[];
    shares: { personId: PersonId; paise: number; input: number | null }[];
  },
  memberIds: readonly PersonId[],
  selfId: PersonId,
  toAmountString: (paise: number) => string,
  toPercentString: (bp: number) => string,
): Draft {
  const d = emptyDraft(memberIds, selfId);
  d.amount = toAmountString(expense.amountPaise);
  if (expense.payers.length === 1) {
    d.paidMode = 'single';
    d.payerId = expense.payers[0]!.personId;
  } else {
    d.paidMode = 'multiple';
    d.paid = Object.fromEntries(expense.payers.map((p) => [p.personId, toAmountString(p.paise)]));
  }
  d.method = expense.splitMethod;
  const byPerson = new Map(expense.shares.map((s) => [s.personId, s]));
  d.included = Object.fromEntries(memberIds.map((id) => [id, byPerson.has(id)]));
  if (expense.splitMethod === 'exact') {
    d.exact = Object.fromEntries(expense.shares.map((s) => [s.personId, toAmountString(s.input ?? s.paise)]));
  } else if (expense.splitMethod === 'percent') {
    d.percent = Object.fromEntries(expense.shares.map((s) => [s.personId, toPercentString(s.input ?? 0)]));
  } else if (expense.splitMethod === 'shares') {
    d.shares = Object.fromEntries(memberIds.map((id) => [id, String(byPerson.get(id)?.input ?? 0)]));
  }
  return d;
}
