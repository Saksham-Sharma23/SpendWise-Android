import { GroupDetail } from '@/features/groups';
import { useLocalSearchParams } from 'expo-router';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <GroupDetail groupId={Number(id)} />;
}
