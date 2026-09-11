import { Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';

export default function SettingsScreen() {
  return (
    <Screen title="Settings" subtitle="Theme, notifications, data">
      <View className="px-5">
        <View className="rounded-lg border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">
            Phase 9 builds this: theme, currency display, notification preferences and data management.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
