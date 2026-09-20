import { useLocalSearchParams } from 'expo-router';

import { BudgetForm } from '@/features/budgets';

export default function BudgetModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <BudgetForm editingId={id ? Number(id) : null} />;
}
