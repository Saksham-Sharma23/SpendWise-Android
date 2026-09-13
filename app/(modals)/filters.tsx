import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colorForCategory } from '../../features/transactions/components/TransactionRow';
import { useFilterStore } from '../../features/transactions/filterStore';
import { hasActiveFilters, useCategories } from '../../features/transactions/queries';
import { addDays, todayISO } from '../../lib/dates';

/**
 * The filter sheet.
 *
 * Every control here compiles to a SQL predicate in `buildWhere` rather than
 * to a JS `.filter()` — which is what keeps filtering instant on a ledger of
 * any size, and why the date presets are stored as plain ISO bounds.
 */

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: 'Last 7 days', from: () => addDays(todayISO(), -6), to: todayISO },
  { label: 'Last 30 days', from: () => addDays(todayISO(), -29), to: todayISO },
  { label: 'This month', from: () => `${todayISO().slice(0, 7)}-01`, to: todayISO },
  { label: 'Last 12 months', from: () => addDays(todayISO(), -364), to: todayISO },
];

export default function FiltersModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { filters, patch, reset } = useFilterStore();
  const { data: categories = [] } = useCategories();

  const selectedCats = filters.categoryIds ?? [];
  const active = hasActiveFilters(filters);

  const toggleCat = (id: number) => {
    const next = selectedCats.includes(id)
      ? selectedCats.filter((c) => c !== id)
      : [...selectedCats, id];
    patch({ categoryIds: next });
  };

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable accessibilityRole="button" onPress={() => reset()} className="py-1">
          <Text className={`text-base ${active ? 'text-destructive' : 'text-muted-foreground'}`}>
            Reset
          </Text>
        </Pressable>
        <Text
          className="text-base text-foreground"
          style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
        >
          Filters
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()} className="py-1">
          <Text
            className="text-base text-primary"
            style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
          >
            Done
          </Text>
        </Pressable>
      </View>

      <ScrollView className="px-5" contentContainerStyle={{ paddingBottom: 40 }}>
        <Section label="Type">
          <View className="flex-row rounded-lg bg-muted p-1">
            {(['all', 'expense', 'income'] as const).map((t) => {
              const on = (filters.type ?? 'all') === t;
              return (
                <Pressable
                  key={t}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => patch({ type: t })}
                  className={`flex-1 items-center rounded-md py-2 ${on ? 'bg-card' : ''}`}
                >
                  <Text
                    className={on ? 'text-foreground' : 'text-muted-foreground'}
                    style={{ fontFamily: on ? 'PlusJakartaSans_600SemiBold' : undefined }}
                  >
                    {t === 'all' ? 'All' : t === 'expense' ? 'Expense' : 'Income'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Section>

        <Section label="Date range">
          <View className="flex-row flex-wrap gap-2">
            {PRESETS.map((p) => {
              const on = filters.dateFrom === p.from() && filters.dateTo === p.to();
              return (
                <Pressable
                  key={p.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() =>
                    on
                      ? patch({ dateFrom: undefined, dateTo: undefined })
                      : patch({ dateFrom: p.from(), dateTo: p.to() })
                  }
                  className={`rounded-full border px-3 py-1.5 ${
                    on ? 'border-primary bg-accent' : 'border-border'
                  }`}
                >
                  <Text className={on ? 'text-sm text-primary' : 'text-sm text-muted-foreground'}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {filters.dateFrom ? (
            <Text className="mt-2 text-xs text-muted-foreground">
              {filters.dateFrom} to {filters.dateTo}
            </Text>
          ) : (
            <Text className="mt-2 text-xs text-muted-foreground">All time</Text>
          )}
        </Section>

        <Section label={`Categories${selectedCats.length ? ` · ${selectedCats.length}` : ''}`}>
          <View className="flex-row flex-wrap gap-2">
            {categories.map((c) => {
              const on = selectedCats.includes(c.id);
              const color = colorForCategory(c.name);
              return (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => toggleCat(c.id)}
                  className="rounded-full border px-3 py-1.5"
                  style={{
                    borderColor: on ? color : '#D3DAD5',
                    backgroundColor: on ? `${color}1A` : 'transparent',
                  }}
                >
                  <Text className="text-sm" style={{ color: on ? color : '#6B7280' }}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {categories.length === 0 ? (
            <Text className="text-sm text-muted-foreground">No categories yet.</Text>
          ) : null}
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="mt-5">
      <Text className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">{label}</Text>
      {children}
    </View>
  );
}
