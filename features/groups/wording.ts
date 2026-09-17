import { formatINR } from '../../lib/money';

/**
 * How Groups talks about money — one place, so every screen says the same
 * thing the same way, the way Splitwise does. Pure and tested
 * (`__tests__/wording.test.ts`).
 *
 * Tone tells the screen which colour to use: 'good' (you are owed),
 * 'bad' (you owe), 'none' (settled or not involved).
 */

export type Tone = 'good' | 'bad' | 'none';

export interface Phrase {
  text: string;
  tone: Tone;
}

const money = (paise: number) => formatINR(Math.abs(paise), { whole: Math.abs(paise) % 100 === 0 });

/** Your overall position in a group or across everything. */
export function yourStatus(netPaise: number): Phrase {
  if (netPaise > 0) return { text: `you are owed ${money(netPaise)}`, tone: 'good' };
  if (netPaise < 0) return { text: `you owe ${money(netPaise)}`, tone: 'bad' };
  return { text: 'settled up', tone: 'none' };
}

/** A friend's position with you. Positive = they owe you. */
export function friendStatus(name: string, netPaise: number): Phrase {
  if (netPaise > 0) return { text: `${name} owes you ${money(netPaise)}`, tone: 'good' };
  if (netPaise < 0) return { text: `you owe ${name} ${money(netPaise)}`, tone: 'bad' };
  return { text: 'settled up', tone: 'none' };
}

/** Any member's overall position in a group, for a row showing their name: "gets back ₹2,250". */
export function memberStatus(netPaise: number, isSelf: boolean): Phrase {
  if (netPaise > 0) return { text: `${isSelf ? 'get' : 'gets'} back ${money(netPaise)}`, tone: 'good' };
  if (netPaise < 0) return { text: `${isSelf ? 'owe' : 'owes'} ${money(netPaise)}`, tone: 'bad' };
  return { text: 'settled up', tone: 'none' };
}

/** The same, without the name — for a row that already shows it: "owes you ₹850". */
export function friendShort(netPaise: number): Phrase {
  if (netPaise > 0) return { text: `owes you ${money(netPaise)}`, tone: 'good' };
  if (netPaise < 0) return { text: `you owe ${money(netPaise)}`, tone: 'bad' };
  return { text: 'settled up', tone: 'none' };
}

/** A who-owes-whom line between any two members, from your point of view where you are one of them. */
export function transferLine(
  fromName: string,
  toName: string,
  paise: number,
  fromIsYou: boolean,
  toIsYou: boolean,
): Phrase {
  if (fromIsYou) return { text: `You owe ${toName} ${money(paise)}`, tone: 'bad' };
  if (toIsYou) return { text: `${fromName} owes you ${money(paise)}`, tone: 'good' };
  return { text: `${fromName} owes ${toName} ${money(paise)}`, tone: 'none' };
}

/** The right-hand side of an expense row: what it did to YOUR balance. */
export function expenseEffect(youPaidPaise: number, youOwePaise: number): Phrase & { amount: string | null } {
  const net = youPaidPaise - youOwePaise;
  if (youPaidPaise === 0 && youOwePaise === 0) return { text: 'not involved', tone: 'none', amount: null };
  if (net > 0) return { text: 'you lent', tone: 'good', amount: money(net) };
  if (net < 0) return { text: 'you borrowed', tone: 'bad', amount: money(net) };
  return { text: 'you paid your share', tone: 'none', amount: null };
}

/** "Aarav paid ₹6,000", "You paid ₹6,000", or "2 people paid ₹6,000". */
export function paidLine(leadName: string | null, leadIsYou: boolean, payerCount: number, amountPaise: number): string {
  if (payerCount > 1) return `${payerCount} people paid ${money(amountPaise)}`;
  if (leadIsYou) return `You paid ${money(amountPaise)}`;
  return `${leadName ?? 'Someone'} paid ${money(amountPaise)}`;
}

/** A settlement row: "Chirag paid you ₹1,000". */
export function settlementLine(
  fromName: string,
  toName: string,
  paise: number,
  fromIsYou: boolean,
  toIsYou: boolean,
): string {
  const from = fromIsYou ? 'You' : fromName;
  const to = toIsYou ? 'you' : toName;
  return `${from} paid ${to} ${money(paise)}`;
}

/** "1 payment instead of 3" — only when simplification actually saved something. */
export function simplifiedNote(simplified: number, pairwise: number): string | null {
  if (pairwise <= simplified) return null;
  return `${simplified} ${simplified === 1 ? 'payment' : 'payments'} instead of ${pairwise}`;
}
