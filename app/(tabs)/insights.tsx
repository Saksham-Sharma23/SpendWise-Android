import { Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';

export default function InsightsScreen() {
  return (
    <Screen title="Insights" subtitle="Analytics">
      <View className="px-5">
        <View className="rounded-lg border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">
            Phase 5 builds the charts here: a trend area chart with a
            3/6/12/24-month selector and a touch scrubber, a category donut,
            and stat cards — all aggregated in SQL, never in JavaScript.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
