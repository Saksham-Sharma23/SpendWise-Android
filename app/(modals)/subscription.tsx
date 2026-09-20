import { useLocalSearchParams } from 'expo-router';

import { SubscriptionForm } from '@/features/tracker';

export default function SubscriptionModal() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <SubscriptionForm editingId={id ? Number(id) : null} />;
}
