import { useLocalSearchParams } from 'expo-router';

import { GroupDetail } from '../../../features/groups/components/GroupDetail';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetail groupId={Number(id)} />;
}
