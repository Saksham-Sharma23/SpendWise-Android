import { Repeat } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { EmptyState } from '../../components/ui/EmptyState';

export default function TrackerScreen() {
  return (
    <Screen back title="Tracker" subtitle="Subscriptions and renewals">
      <View className="px-5">
        <EmptyState
          icon={Repeat}
          title="Nothing to track yet"
          description="Add Netflix, rent or your gym and see every renewal counting down, with a reminder before it renews."
          badge="Arrives in Phase 4"
        />
      </View>
    </Screen>
  );
}
