import { Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';

export default function TrackerScreen() {
  return (
    <Screen title="Tracker" subtitle="Subscriptions">
      <View className="px-5">
        <View className="rounded-lg border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">
            Phase 4 builds this: renewal countdowns computed on read, status filters, and the kebab actions.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
