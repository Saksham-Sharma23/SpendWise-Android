import { useLocalSearchParams } from 'expo-router';

import { GroupForm } from '@/features/groups';

export default function GroupModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <GroupForm editingId={id ? Number(id) : null} />;
}
