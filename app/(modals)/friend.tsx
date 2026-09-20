import { useLocalSearchParams } from 'expo-router';

import { FriendForm } from '@/features/groups';

export default function FriendModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <FriendForm editingId={id ? Number(id) : null} />;
}
