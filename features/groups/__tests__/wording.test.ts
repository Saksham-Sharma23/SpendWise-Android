import {
  expenseEffect,
  friendStatus,
  paidLine,
  settlementLine,
  simplifiedNote,
  transferLine,
  yourStatus,
} from '../wording';

describe('Groups wording', () => {
  it('your status', () => {
    expect(yourStatus(2_250_00)).toEqual({ text: 'you are owed ₹2,250', tone: 'good' });
    expect(yourStatus(-300_50)).toEqual({ text: 'you owe ₹300.50', tone: 'bad' });
    expect(yourStatus(0)).toEqual({ text: 'settled up', tone: 'none' });
  });

  it('a friend’s status, positive meaning they owe you', () => {
    expect(friendStatus('Rahul', 850_00).text).toBe('Rahul owes you ₹850');
    expect(friendStatus('Rahul', -850_00).text).toBe('you owe Rahul ₹850');
  });

  it('who owes whom, from your point of view', () => {
    expect(transferLine('You', 'Aarav', 500_00, true, false)).toEqual({ text: 'You owe Aarav ₹500', tone: 'bad' });
    expect(transferLine('Chirag', 'You', 500_00, false, true)).toEqual({ text: 'Chirag owes you ₹500', tone: 'good' });
    expect(transferLine('Chirag', 'Aarav', 500_00, false, false)).toEqual({
      text: 'Chirag owes Aarav ₹500',
      tone: 'none',
    });
  });

  it('what an expense did to your balance', () => {
    expect(expenseEffect(6_000_00, 2_000_00)).toEqual({ text: 'you lent', tone: 'good', amount: '₹4,000' });
    expect(expenseEffect(0, 1_000_00)).toEqual({ text: 'you borrowed', tone: 'bad', amount: '₹1,000' });
    expect(expenseEffect(0, 0)).toEqual({ text: 'not involved', tone: 'none', amount: null });
    expect(expenseEffect(500_00, 500_00).text).toBe('you paid your share');
  });

  it('who paid, and settlements', () => {
    expect(paidLine('Aarav', false, 1, 6_000_00)).toBe('Aarav paid ₹6,000');
    expect(paidLine('You', true, 1, 6_000_00)).toBe('You paid ₹6,000');
    expect(paidLine('Aarav', false, 2, 1_200_00)).toBe('2 people paid ₹1,200');
    expect(settlementLine('Chirag', 'You', 1_000_00, false, true)).toBe('Chirag paid you ₹1,000');
    expect(settlementLine('You', 'Rahul', 250_00, true, false)).toBe('You paid Rahul ₹250');
  });

  it('only mentions simplification when it saved a payment', () => {
    expect(simplifiedNote(1, 3)).toBe('1 payment instead of 3');
    expect(simplifiedNote(2, 2)).toBeNull();
  });
});
