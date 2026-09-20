import { useLocalSearchParams } from 'expo-router';

import { CategoryEditor } from '@/features/categories';

export default function CategoryModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <CategoryEditor editingId={id ? Number(id) : null} />;
}
