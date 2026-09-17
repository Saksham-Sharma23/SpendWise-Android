import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ChevronRight, Plus, Tags } from 'lucide-react-native';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '../../../components/layout/Screen';
import { CategoryIcon } from '../../../components/ui/CategoryIcon';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PressableScale } from '../../../components/ui/PressableScale';
import { formatCount } from '../../../lib/money';
import { fonts, useColors } from '../../../lib/theme';
import { useCategoriesWithUsageResult, type CategoryWithUsage } from '../queries';

/**
 * Category management. The server used to own categories; here the user
 * does — create, rename, recolour, merge and delete, all from the editor
 * this list opens.
 */
export function CategoryList() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: rows, status } = useCategoriesWithUsageResult();

  const open = (id?: number) =>
    router.push(id != null ? { pathname: '/(modals)/category', params: { id: String(id) } } : '/(modals)/category');

  return (
    <Screen
      back
      title="Categories"
      subtitle={`${rows.length} ${rows.length === 1 ? 'category' : 'categories'} · tap one to edit, merge or delete`}
      scroll={false}
      right={
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="New category"
          onPress={() => open()}
          scaleTo={0.9}
          className="h-11 w-11 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.primary }}
        >
          <Plus size={20} color={colors.onPrimary} strokeWidth={2.6} />
        </PressableScale>
      }
    >
      {status === 'pending' ? (
        <View className="flex-1" />
      ) : rows.length === 0 ? (
        <View className="px-5">
          <EmptyState
            icon={Tags}
            title="No categories"
            description="Create one to start sorting your spending."
            action={{ label: 'New category', onPress: () => open() }}
          />
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => <Row item={item} index={index} onPress={() => open(item.id)} />}
        />
      )}
    </Screen>
  );
}

function Row({ item, index, onPress }: { item: CategoryWithUsage; index: number; onPress: () => void }) {
  const colors = useColors();
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 12) * 30).duration(320)}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={`Edit ${item.name}`}
        onPress={onPress}
        scaleTo={0.98}
        className="mx-3 flex-row items-center gap-3 rounded-2xl px-3 py-3"
      >
        <CategoryIcon icon={item.icon} color={item.color} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              numberOfLines={1}
              style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15, flexShrink: 1 }}
            >
              {item.name}
            </Text>
            {item.isSystem ? (
              <View className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.elevated }}>
                <Text style={{ color: colors.muted, fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 0.5 }}>
                  BUILT-IN
                </Text>
              </View>
            ) : null}
          </View>
          <Text style={{ color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 }}>
            {item.transactionCount === 0
              ? 'Not used yet'
              : `${formatCount(item.transactionCount)} ${item.transactionCount === 1 ? 'transaction' : 'transactions'}`}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.subtle} />
      </PressableScale>
    </Animated.View>
  );
}
