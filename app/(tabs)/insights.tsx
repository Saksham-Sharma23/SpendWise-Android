import { ChartColumn } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { EmptyState } from '../../components/ui/EmptyState';

export default function InsightsScreen() {
  return (
    <Screen title="Insights" subtitle="Where your money goes, over time">
      <View className="px-5">
        <EmptyState
          icon={ChartColumn}
          title="Deeper analytics are coming"
          description="A 24-month trend you can scrub with your finger, a category donut and stat cards like average spend per day."
          badge="Arrives in Phase 5"
        />
      </View>
    </Screen>
  );
}
