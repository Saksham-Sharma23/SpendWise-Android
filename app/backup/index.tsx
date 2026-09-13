import { DatabaseBackup } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { EmptyState } from '../../components/ui/EmptyState';

export default function BackupScreen() {
  return (
    <Screen back title="Backup & restore" subtitle="Your data lives only on this phone">
      <View className="px-5">
        <EmptyState
          icon={DatabaseBackup}
          title="Keep a copy somewhere safe"
          description="Export everything to a file through the share sheet, and restore it on a new phone — checked before anything is overwritten."
          badge="Arrives in Phase 7"
        />
      </View>
    </Screen>
  );
}
