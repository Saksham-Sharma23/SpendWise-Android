import { Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';

export default function BackupScreen() {
  return (
    <Screen title="Backup & restore" subtitle="Your data lives only on this phone">
      <View className="px-5">
        <View className="rounded-lg border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">
            Phase 7 builds this: export as .db or .json through the share sheet, validated restore, and a monthly reminder.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
