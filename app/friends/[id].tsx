import { FriendDetail } from '@/features/groups';
import { useLocalSearchParams } from 'expo-router';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FriendDetail personId={Number(id)} />;
}
