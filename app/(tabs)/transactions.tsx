import { Text, View } from 'react-native';
import { Screen } from '../../components/layout/Screen';

export default function TransactionsScreen() {
  return (
    <Screen title="Transactions" subtitle="The ledger">
      <View className="px-5">
        <View className="rounded-lg border border-dashed border-border p-6">
          <Text className="text-center text-sm text-muted-foreground">
            Phase 2 builds the ledger here: FlashList over a windowed live
            query, swipe-to-delete with undo, filters compiled to SQL, and
            long-press multi-select.
          </Text>
        </View>
      </View>
    </Screen>
  );
}
