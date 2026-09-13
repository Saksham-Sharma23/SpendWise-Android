import { Settings } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { EmptyState } from '../../components/ui/EmptyState';

export default function SettingsScreen() {
  return (
    <Screen back title="Settings" subtitle="Notifications, security, data">
      <View className="px-5">
        <EmptyState
          icon={Settings}
          title="Settings are on the way"
          description="Notification preferences, an optional fingerprint lock and data management will live here."
          badge="Arrives in Phase 9"
        />
      </View>
    </Screen>
  );
}
