import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Receipt, Search, SearchX, Share2, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { Screen, TAB_BAR_CLEARANCE } from '../../../components/layout/Screen';
import { AnimatedAmount } from '../../../components/ui/AnimatedAmount';
import { Card } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PressableScale } from '../../../components/ui/PressableScale';
import { Segmented } from '../../../components/ui/Segmented';
import { formatMonthYear } from '../../../lib/dates';
import { colors, fonts } from '../../../lib/theme';
import { exportTransactionsCsv } from '../export';
import { useFilterStore } from '../filterStore';
import {
  hasActiveFilters,
  restoreTransactions,
  softDeleteTransaction,
  softDeleteTransactions,
  useCategories,
  useTransactionSummary,
  useTransactions,
  type TransactionFilters,
  type TransactionRow,
} from '../queries';
import { FilterChips } from './FilterChips';
import { TransactionRowItem } from './TransactionRow';

/**
 * The ledger.
 *
 * The list is a FlashList over a LIVE query with a growing window. Because
 * `useLiveQuery` re-runs on every write, adding a transaction anywhere — the
 * FAB, an import, the widget — updates this screen with no refresh, no cache
 * and no invalidation call. That is the whole reason this app needs no
 * server-state library.
 */

const PAGE = 40;

type ListItem = { kind: 'month'; key: string; label: string } | { kind: 'row'; row: TransactionRow };

/** Insert a header before the first row of each month, and note where each header sits. */
function withMonthHeaders(rows: TransactionRow[]): { items: ListItem[]; headerIndices: number[] } {
  const items: ListItem[] = [];
  const headerIndices: number[] = [];
  let current = '';
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (key !== current) {
      current = key;
      headerIndices.push(items.length);
      items.push({ kind: 'month', key, label: formatMonthYear(key) });
    }
    items.push({ kind: 'row', row });
  }
  return { items, headerIndices };
}

type TypeFilter = 'all' | 'income' | 'expense';

export function Ledger() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Filters live in a store because the filter sheet is a separate ROUTE and
  // cannot share component state with this screen. Search stays local: it
  // changes on every keystroke, and routing that through a shared store would
  // re-render the sheet on every character.
  const sheetFilters = useFilterStore((s) => s.filters);
  const patch = useFilterStore((s) => s.patch);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters: TransactionFilters = useMemo(() => ({ ...sheetFilters, search }), [sheetFilters, search]);

  const { data: rows = [] } = useTransactions(filters, limit);
  const { data: summaryRows = [] } = useTransactionSummary(filters);
  const { data: categoryList = [] } = useCategories();
  const summary = summaryRows[0];

  const { items, headerIndices } = useMemo(() => withMonthHeaders(rows as TransactionRow[]), [rows]);
  const selectionMode = selected.size > 0;
  const total = summary?.count ?? 0;

  const onEndReached = useCallback(() => {
    // Only grow the window when the current one is full — otherwise every
    // bounce at the bottom of a short list would widen the query for nothing.
    if (rows.length >= limit) setLimit((l) => l + PAGE);
  }, [rows.length, limit]);

  /**
   * Pull-to-refresh. The data is already live, so there is nothing to fetch;
   * what the gesture does here is collapse the scroll window back to the
   * first page, which is what "take me back to fresh" means on a long ledger.
   */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setLimit(PAGE);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setRefreshing(false), 450);
  }, []);

  const deleteOne = useCallback((row: TransactionRow) => {
    softDeleteTransaction(row.id);
    toast.success('Transaction deleted', {
      // Soft delete is what makes this honest: the row is still there, so
      // undo restores the original rather than re-creating a lookalike.
      action: { label: 'Undo', onClick: () => restoreTransactions([row.id]) },
    });
  }, []);

  const deleteSelected = useCallback(() => {
    const ids = [...selected];
    softDeleteTransactions(ids);
    setSelected(new Set());
    toast.success(`${ids.length} deleted`, {
      action: { label: 'Undo', onClick: () => restoreTransactions(ids) },
    });
  }, [selected]);

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openRow = useCallback(
    (id: number) => {
      if (selectionMode) toggleSelect(id);
      else router.push({ pathname: '/(modals)/transaction', params: { id: String(id) } });
    },
    [router, selectionMode, toggleSelect],
  );

  const clearFilters = () => {
    useFilterStore.getState().reset();
    setSearch('');
    setLimit(PAGE);
  };

  const onExport = async () => {
    if (exporting) return;
    if (total === 0) {
      toast.error('Nothing to export');
      return;
    }
    setExporting(true);
    try {
      const result = await exportTransactionsCsv(filters);
      if (!result.shared) toast.error('Sharing is not available on this device');
      else toast.success(`Exported ${result.rows.toLocaleString('en-IN')} transactions`);
    } catch (e) {
      toast.error(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const active = hasActiveFilters(filters);
  // Filters the sheet owns beyond type — shown as a count on the filter button.
  const sheetCount =
    (sheetFilters.categoryIds?.length ? 1 : 0) + (sheetFilters.dateFrom || sheetFilters.dateTo ? 1 : 0);
  const net = (summary?.incomePaise ?? 0) - (summary?.expensePaise ?? 0);

  return (
    <Screen
      eyebrow={selectionMode ? 'Selection' : undefined}
      title={selectionMode ? `${selected.size} selected` : 'Transactions'}
      subtitle={
        selectionMode
          ? 'Tap rows to add or remove them'
          : `${total.toLocaleString('en-IN')} ${total === 1 ? 'entry' : 'entries'}${active ? ' · filtered' : ''}`
      }
      scroll={false}
      right={
        selectionMode ? (
          <View className="flex-row gap-2">
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
              onPress={() => setSelected(new Set())}
              className="rounded-full border px-4 py-2.5"
              style={{ borderColor: colors.border, backgroundColor: colors.card }}
            >
              <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 13 }}>Cancel</Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Delete selected"
              onPress={deleteSelected}
              className="rounded-full px-4 py-2.5"
              style={{ backgroundColor: colors.expense }}
            >
              <Text style={{ color: colors.background, fontFamily: fonts.semibold, fontSize: 13 }}>Delete</Text>
            </PressableScale>
          </View>
        ) : (
          <View className="flex-row gap-2">
            <RoundIconButton label="Export as CSV" onPress={onExport}>
              {exporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Share2 size={18} color={colors.foreground} />
              )}
            </RoundIconButton>
            <RoundIconButton label="Filters" onPress={() => router.push('/(modals)/filters')} active={sheetCount > 0}>
              <SlidersHorizontal size={18} color={sheetCount > 0 ? colors.primary : colors.foreground} />
              {sheetCount > 0 ? (
                <View
                  className="absolute -right-0.5 -top-0.5 h-4 w-4 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.primary }}
                >
                  <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 9 }}>{sheetCount}</Text>
                </View>
              ) : null}
            </RoundIconButton>
          </View>
        )
      }
    >
      <View className="gap-3 px-5 pb-2">
        <Animated.View entering={FadeInDown.delay(40).duration(400)}>
          <Card className="flex-row py-4">
            <SummaryFigure label="Income" paise={summary?.incomePaise ?? 0} color={colors.income} />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <SummaryFigure label="Expenses" paise={summary?.expensePaise ?? 0} color={colors.expense} />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <SummaryFigure label="Net" paise={net} color={net < 0 ? colors.expense : colors.primary} />
          </Card>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(90).duration(400)} className="gap-3">
          <View
            className="flex-row items-center rounded-full border px-4"
            style={{ backgroundColor: colors.card, borderColor: colors.border, height: 48 }}
          >
            <Search size={17} color={colors.muted} />
            <TextInput
              placeholder="Search notes and categories"
              placeholderTextColor={colors.subtle}
              value={search}
              onChangeText={(t) => {
                setSearch(t);
                setLimit(PAGE);
              }}
              returnKeyType="search"
              className="ml-2.5 flex-1"
              style={{ color: colors.foreground, fontFamily: fonts.regular, fontSize: 14 }}
            />
            {search ? (
              <PressableScale accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setSearch('')} scaleTo={0.85} hitSlop={10}>
                <X size={17} color={colors.muted} />
              </PressableScale>
            ) : null}
          </View>

          <Segmented<TypeFilter>
            value={(sheetFilters.type ?? 'all') as TypeFilter}
            onChange={(t) => {
              patch({ type: t });
              setLimit(PAGE);
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'Income', tint: colors.income, onTint: colors.background },
              { value: 'expense', label: 'Expense', tint: colors.expense, onTint: colors.background },
            ]}
          />
        </Animated.View>
      </View>

      <View className="pb-1">
        <FilterChips
          filters={filters}
          categories={categoryList}
          onChange={(p) => {
            patch(p);
            setLimit(PAGE);
          }}
          onClearSearch={() => setSearch('')}
          onClearAll={clearFilters}
        />
      </View>

      {items.length === 0 ? (
        <View className="flex-1 px-5 pt-2">
          {active ? (
            <EmptyState
              icon={SearchX}
              title="Nothing matches"
              description="Try widening the date range or clearing the filters."
              action={{ label: 'Clear filters', onPress: clearFilters }}
            />
          ) : (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              description="Add your first one, or import a spreadsheet you already keep."
              action={{ label: 'Add a transaction', onPress: () => router.push('/(modals)/transaction') }}
              secondary={{ label: 'Import a sheet', onPress: () => router.push('/import/pick') }}
            />
          )}
        </View>
      ) : (
        <FlashList
          data={items}
          extraData={selected}
          keyExtractor={(item) => (item.kind === 'month' ? `m${item.key}` : `t${item.row.id}`)}
          getItemType={(item) => item.kind}
          // The current month's label stays pinned while its rows scroll under it.
          stickyHeaderIndices={headerIndices}
          refreshing={refreshing}
          onRefresh={onRefresh}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }}
          renderItem={({ item }) =>
            item.kind === 'month' ? (
              <View className="px-5 pb-1 pt-4" style={{ backgroundColor: colors.background }}>
                <Text
                  style={{
                    color: colors.muted,
                    fontFamily: fonts.semibold,
                    fontSize: 12,
                    letterSpacing: 1,
                    textTransform: 'uppercase',
                  }}
                >
                  {item.label}
                </Text>
              </View>
            ) : (
              <TransactionRowItem
                row={item.row}
                onPress={openRow}
                onDelete={deleteOne}
                onLongPress={toggleSelect}
                selected={selected.has(item.row.id)}
                selectionMode={selectionMode}
              />
            )
          }
        />
      )}
    </Screen>
  );
}

function RoundIconButton({
  label,
  onPress,
  active = false,
  children,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.9}
      className="h-11 w-11 items-center justify-center rounded-full border"
      style={{
        backgroundColor: active ? colors.primarySoft : colors.card,
        borderColor: active ? colors.primaryBorder : colors.border,
      }}
    >
      {children}
    </PressableScale>
  );
}

function SummaryFigure({ label, paise, color }: { label: string; paise: number; color: string }) {
  return (
    <View className="flex-1 items-center px-1">
      <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 11 }}>{label}</Text>
      <AnimatedAmount
        paise={paise}
        options={{ whole: true }}
        style={{ color, fontFamily: fonts.bold, fontSize: 16, marginTop: 4 }}
      />
    </View>
  );
}
