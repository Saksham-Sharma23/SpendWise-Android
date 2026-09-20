import { useLocalSearchParams } from 'expo-router';

import { SettleUpForm } from '@/features/groups';

const num = (v?: string) => (v ? Number(v) : null);

type Params = { groupId?: string; friendId?: string; from?: string; to?: string; amount?: string };

export default function SettleUpModal() {
  const { groupId, friendId, from, to, amount } = useLocalSearchParams<Params>();
  // A payment picked on the balances sheet arrives as from/to/amount.
  const suggestion = from && to ? { from: Number(from), to: Number(to), paise: Number(amount ?? 0) } : null;
  return <SettleUpForm groupId={num(groupId)} friendId={num(friendId)} suggestion={suggestion} />;
}
