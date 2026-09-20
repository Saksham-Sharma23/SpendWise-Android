import { useLocalSearchParams } from 'expo-router';

import { TransactionForm } from '@/features/transactions';

export default function TransactionModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <TransactionForm editingId={id ? Number(id) : null} />;
}
