import { PiggyBank } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { EmptyState } from '../../components/ui/EmptyState';
import { MONTHS_LONG } from '../../lib/dates';

export default function BudgetsScreen() {
  const now = new Date();
  return (
    <Screen back title="Budgets" subtitle={`${MONTHS_LONG[now.getMonth()]} ${now.getFullYear()}`}>
      <View className="px-5">
        <EmptyState
          icon={PiggyBank}
          title="No budgets yet"
          description="Set a monthly limit per category and watch progress fill up as you spend, with a warning at 75%."
          badge="Arrives in Phase 4"
        />
      </View>
    </Screen>
  );
}
