import { GroupTotals } from '@/features/groups';
import { useLocalSearchParams } from 'expo-router';

export default function GroupTotalsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupTotals groupId={Number(id)} />;
}
