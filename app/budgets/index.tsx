import { Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';

export default function BudgetsScreen() {
  return (
    <Screen title="Budgets" subtitle="Per-category limits">
      <View className="px-5">
        <View className="rounded-lg border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">
            Phase 4 builds this: MiniDonut progress, days left in cycle, a 75% amber warning and an over-budget banner.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
