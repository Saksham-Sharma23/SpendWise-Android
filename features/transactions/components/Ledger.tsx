import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { CircleAlert, Receipt, Search, SearchX, Share2, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { useCategories } from '@/data/categories';
import { Screen, TAB_BAR_CLEARANCE } from '@/components/layout/Screen';
import { AnimatedAmount } from '@/components/ui/AnimatedAmount';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PressableScale } from '@/components/ui/PressableScale';
import { Segmented } from '@/components/ui/Segmented';
import { categoryColor } from '@/lib/categoryColor';
import { formatMonthYear } from '@/lib/dates';
import { formatCount } from '@/lib/money';
import { useColors } from '@/lib/theme';
import { rise } from '@/lib/motion';
import { exportTransactionsCsv } from '../data/export';
import { useFilterStore } from '../filterStore';
import { hasActiveFilters, type TransactionFilters } from '../data/filters';
import { restoreTransactions, softDeleteTransaction, softDeleteTransactions } from '../data/actions';
import { useTransactionSummary, useTransactionPages } from '../data/hooks';
import { type TransactionRow } from '../data/sql';
import { FilterChips } from './FilterChips';
import { TransactionRowItem } from './TransactionRow';
import { Text, font } from '@/components/ui/Text';
import { StatFigure } from '@/components/ui/StatFigure';

/**
 * The ledger.
 *
 * The list is a FlashList over keyset pages whose first page is LIVE. Because
 * the query re-runs on every write, adding a transaction anywhere — the
 * FAB, an import, the widget — updates this screen with no refresh, no cache
 * and no invalidation call. That is the whole reason this app needs no
 * server-state library.
 */

type ListItem = { kind: 'month'; key: string; label: string } | { kind: 'row'; row: TransactionRow };

/**
 * Insert a header before the first row of each month, note where each header
 * sits, and resolve each row's display colour ONCE per fetch — so rows never
 * build a fresh object during render.
 *
 * `categoryColor` may return null, for a row with no category at all. That
 * null is passed through rather than replaced here (B10): CategoryIcon draws
 * it with a neutral that reads in both themes, whereas resolving it at fetch
 * time baked in whichever theme happened to be active, and the row kept that
 * grey after a theme switch until the next query ran.
 */
function withMonthHeaders(rows: TransactionRow[]): { items: ListItem[]; headerIndices: number[] } {
  const items: ListItem[] = [];
  const headerIndices: number[] = [];
  let current = '';
  for (const raw of rows) {
    const row = raw.categoryColor ? raw : { ...raw, categoryColor: categoryColor(raw.categoryColor, raw.categoryName) };
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
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Filters live in a store because the filter sheet is a separate ROUTE and
  // cannot share component state with this screen. Search stays local: it
  // changes on every keystroke, and routing that through a shared store would
  // re-render the sheet on every character.
  const sheetFilters = useFilterStore((s) => s.filters);
  const patch = useFilterStore((s) => s.patch);
  // The box updates on every keystroke; the query only after a 150 ms pause,
  // so typing a word runs the LIKE scan once instead of once per letter.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 150);
    return () => clearTimeout(t);
  }, [searchInput]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filters: TransactionFilters = useMemo(() => ({ ...sheetFilters, search }), [sheetFilters, search]);

  // Keyset pages: page 1 live, older pages fetched as you scroll (queries.ts).
  const { rows, status: rowsStatus, loadMore, retry: retryPages } = useTransactionPages(filters);
  const { data: summaryRows = [] } = useTransactionSummary(filters);
  const { data: categoryList = [] } = useCategories();
  const summary = summaryRows[0];

  const { items, headerIndices } = useMemo(() => withMonthHeaders(rows as TransactionRow[]), [rows]);
  const selectionMode = selected.size > 0;

  // A filter change can hide selected rows; deleting rows you can no longer
  // see is never what was meant, so the selection resets with the filter.
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Set()));
  }, [filterKey]);
  const total = summary?.count ?? 0;

  // loadMore is a no-op while a page is loading or when nothing older exists,
  // so a bounce at the bottom of a short list costs nothing.
  const onEndReached = loadMore;

  /**
   * Pull-to-refresh, and the error state's "Try again".
   *
   * Page 1 is live, so on a healthy ledger the gesture's real job is to
   * collapse the scroll window back to the first page. It also RE-RUNS that
   * page, which is what makes it a genuine retry after a failed query —
   * collapsing alone changed nothing when no older pages were loaded, so the
   * button did nothing at all (B7).
   */
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    retryPages();
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setRefreshing(false), 450);
  }, [retryPages]);

  const deleteOne = useCallback((row: TransactionRow) => {
    // On failure safeWrite has already toasted why — no undo to offer.
    if (!softDeleteTransaction(row.id).ok) return;
    toast.success('Transaction deleted', {
      // Soft delete is what makes this honest: the row is still there, so
      // undo restores the original rather than re-creating a lookalike.
      action: { label: 'Undo', onClick: () => restoreTransactions([row.id]) },
    });
  }, []);

  const deleteSelected = useCallback(() => {
    const ids = [...selected];
    if (!softDeleteTransactions(ids).ok) return;
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

  // Hoisted so FlashList receives a stable function. It changes only when
  // selection does — which is exactly when cells must re-check `selected`
  // (there is no extraData); the row memo then skips every unchanged row.
  const renderItem = useCallback(
    ({ item }: { item: ListItem }) =>
      item.kind === 'month' ? (
        <View className="px-5 pb-1 pt-4" style={{ backgroundColor: colors.background }}>
          <Text weight="semibold" size={12} tone="muted" style={{ letterSpacing: 1, textTransform: 'uppercase' }}>
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
      ),
    // `colors` belongs here: the month header draws with it, so a theme
    // switch with the ledger mounted left the headers in the old palette (B9).
    [openRow, deleteOne, toggleSelect, selected, selectionMode, colors],
  );

  const clearFilters = () => {
    useFilterStore.getState().reset();
    setSearchInput('');
    setSearch('');
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
      else toast.success(`Exported ${formatCount(result.rows)} transactions`);
    } catch (e) {
      toast.error(e instanceof Error ? `Export failed: ${e.message}` : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const active = hasActiveFilters(filters);
  // Filters the sheet owns beyond type — shown as a count on the filter button.
  const sheetCount =
    (sheetFilters.categoryIds?.length ? 1 : 0) +
    (sheetFilters.datePreset || sheetFilters.dateFrom || sheetFilters.dateTo ? 1 : 0);
  const net = (summary?.incomePaise ?? 0) - (summary?.expensePaise ?? 0);

  return (
    <Screen
      eyebrow={selectionMode ? 'Selection' : undefined}
      title={selectionMode ? `${selected.size} selected` : 'Transactions'}
      subtitle={
        selectionMode
          ? 'Tap rows to add or remove them'
          : `${formatCount(total)} ${total === 1 ? 'entry' : 'entries'}${active ? ' · filtered' : ''}`
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
              <Text weight="semibold" size={13} tone="default">
                Cancel
              </Text>
            </PressableScale>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Delete selected"
              onPress={deleteSelected}
              className="rounded-full px-4 py-2.5"
              style={{ backgroundColor: colors.expense }}
            >
              <Text weight="semibold" size={13} tone="onAccent">
                Delete
              </Text>
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
                  <Text weight="bold" size={9} tone="onPrimary">
                    {sheetCount}
                  </Text>
                </View>
              ) : null}
            </RoundIconButton>
          </View>
        )
      }
    >
      <View className="gap-3 px-5 pb-2">
        <Animated.View entering={rise(40)}>
          <Card className="flex-row py-4">
            <SummaryFigure label="Income" paise={summary?.incomePaise ?? 0} color={colors.income} />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <SummaryFigure label="Expenses" paise={summary?.expensePaise ?? 0} color={colors.expense} />
            <View style={{ width: 1, backgroundColor: colors.border }} />
            <SummaryFigure label="Net" paise={net} color={net < 0 ? colors.expense : colors.primary} />
          </Card>
        </Animated.View>

        <Animated.View entering={rise(90)} className="gap-3">
          <View
            className="flex-row items-center rounded-full border px-4"
            style={{ backgroundColor: colors.card, borderColor: colors.border, height: 48 }}
          >
            <Search size={17} color={colors.muted} />
            <TextInput
              placeholder="Search notes and categories"
              placeholderTextColor={colors.subtle}
              value={searchInput}
              onChangeText={(t) => {
                setSearchInput(t);
              }}
              returnKeyType="search"
              className="ml-2.5 flex-1"
              style={{ color: colors.foreground, ...font('regular', 14) }}
            />
            {searchInput ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel="Clear search"
                onPress={() => setSearchInput('')}
                scaleTo={0.85}
                hitSlop={10}
              >
                <X size={17} color={colors.muted} />
              </PressableScale>
            ) : null}
          </View>

          <Segmented<TypeFilter>
            value={(sheetFilters.type ?? 'all') as TypeFilter}
            onChange={(t) => {
              patch({ type: t });
            }}
            options={[
              { value: 'all', label: 'All' },
              { value: 'income', label: 'Income', tint: colors.income, onTint: colors.onAccent },
              { value: 'expense', label: 'Expense', tint: colors.expense, onTint: colors.onAccent },
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
          }}
          onClearSearch={() => setSearchInput('')}
          onClearAll={clearFilters}
        />
      </View>

      {rowsStatus === 'error' ? (
        <View className="flex-1 px-5 pt-2">
          {/* Never let a failed query masquerade as an empty ledger. */}
          <EmptyState
            icon={CircleAlert}
            title="Couldn't load transactions"
            description="Your data is safe — this screen just couldn't read it. Pull down or reopen the tab to try again."
            action={{ label: 'Try again', onPress: onRefresh }}
          />
        </View>
      ) : rowsStatus === 'pending' ? (
        // First load has not answered yet: show nothing rather than "No transactions yet".
        <View className="flex-1" />
      ) : items.length === 0 ? (
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
              secondary={{ label: 'Import a sheet', onPress: () => router.push('/sheets') }}
            />
          )}
        </View>
      ) : (
        <FlashList
          data={items}
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
          renderItem={renderItem}
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
  const colors = useColors();
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
    <StatFigure label={label} align="center">
      <AnimatedAmount
        paise={paise}
        options={{ whole: true }}
        align="center"
        style={{ color, ...font('bold', 16), marginTop: 4 }}
      />
    </StatFigure>
  );
}
