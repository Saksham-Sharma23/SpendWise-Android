import { useLocalSearchParams } from 'expo-router';

import { useCategories } from '@/data/categories';
import { ExpenseForm } from '@/features/groups';

const num = (v?: string) => (v ? Number(v) : null);

/** Categories are handed down: features may not import one another (CLAUDE.md #9). */
export default function SplitExpenseModal() {
  const { id, groupId, friendId } = useLocalSearchParams<{ id?: string; groupId?: string; friendId?: string }>();
  const { data: categories } = useCategories();
  return <ExpenseForm categories={categories} editingId={num(id)} groupId={num(groupId)} friendId={num(friendId)} />;
}
