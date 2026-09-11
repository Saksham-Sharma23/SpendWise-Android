import { Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';

export default function ImportPickScreen() {
  return (
    <Screen title="Import a sheet" subtitle="Step 1 of 4">
      <View className="px-5">
        <View className="rounded-lg border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">
            Phase 6 builds the wizard: pick, map columns, review, then commit in a single database transaction.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
