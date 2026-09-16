import { useLocalSearchParams } from 'expo-router';

import { GroupTotals } from '../../../features/groups/components/GroupTotals';

export default function GroupTotalsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupTotals groupId={Number(id)} />;
}
