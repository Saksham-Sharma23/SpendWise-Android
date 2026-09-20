import { useLocalSearchParams } from 'expo-router';

import { BalancesSheet } from '@/features/groups';

export default function BalancesModal() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <BalancesSheet groupId={Number(groupId)} />;
}
