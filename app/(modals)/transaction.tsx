import { Text, View } from 'react-native';

export default function TransactionModal() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-6">
      <Text
        className="mb-2 text-lg text-foreground"
        style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
      >
        Add transaction
      </Text>
      <Text className="text-center text-sm text-muted-foreground">
        Phase 2 builds this form: a segmented Expense/Income toggle at the
        top, amount, date, category and note — validated with Zod and stored
        as integer paise.
      </Text>
    </View>
  );
}
