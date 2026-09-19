import { useLocalSearchParams } from 'expo-router';

import { FriendDetail } from '@/features/groups/components/FriendDetail';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FriendDetail personId={Number(id)} />;
}
