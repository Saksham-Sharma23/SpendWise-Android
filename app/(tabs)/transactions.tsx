import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Search, SlidersHorizontal, X } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { toast } from 'sonner-native';

import { Screen } from '../../components/layout/Screen';
import { TransactionRowItem } from '../../features/transactions/components/TransactionRow';
import { useFilterStore } from '../../features/transactions/filterStore';
import {
  hasActiveFilters,
  restoreTransactions,
  softDeleteTransaction,
  softDeleteTransactions,
  useTransactionSummary,
  useTransactions,
  type TransactionFilters,
  type TransactionRow,
} from '../../features/transactions/queries';
import { formatINR } from '../../lib/money';

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

/** Insert a header before the first row of each month. */
function withMonthHeaders(rows: TransactionRow[]): ListItem[] {
  const out: ListItem[] = [];
  let current = '';
  for (const row of rows) {
    const key = row.date.slice(0, 7);
    if (key !== current) {
      current = key;
      const d = new Date(`${key}-01T00:00:00`);
      out.push({
        kind: 'month',
        key,
        label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      });
    }
    out.push({ kind: 'row', row });
  }
  return out;
}

export default function TransactionsScreen() {
  const router = useRouter();
  // Filters live in a store because the filter sheet is a separate ROUTE and
  // cannot share component state with this screen. Search stays local: it
  // changes on every keystroke, and routing that through a shared store would
  // re-render the sheet on every character.
  const sheetFilters = useFilterStore((s) => s.filters);
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const filters: TransactionFilters = useMemo(
    () => ({ ...sheetFilters, search }),
    [sheetFilters, search],
  );

  const { data: rows = [] } = useTransactions(filters, limit);
  const { data: summaryRows = [] } = useTransactionSummary(filters);
  const summary = summaryRows[0];

  const items = useMemo(() => withMonthHeaders(rows as TransactionRow[]), [rows]);
  const selectionMode = selected.size > 0;
  const total = summary?.count ?? 0;

  const onEndReached = useCallback(() => {
    // Only grow the window when the current one is full — otherwise every
    // bounce at the bottom of a short list would widen the query for nothing.
    if (rows.length >= limit) setLimit((l) => l + PAGE);
  }, [rows.length, limit]);

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
    setSearchOpen(false);
  };

  const active = hasActiveFilters(filters);

  return (
    <Screen
      title={selectionMode ? `${selected.size} selected` : 'Transactions'}
      subtitle={
        selectionMode
          ? undefined
          : total > 0
            ? `${total.toLocaleString('en-IN')} ${total === 1 ? 'entry' : 'entries'}`
            : undefined
      }
      scroll={false}
      right={
        selectionMode ? (
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear selection"
              onPress={() => setSelected(new Set())}
              className="rounded-lg bg-muted px-3 py-2"
            >
              <Text className="text-sm text-foreground">Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete selected"
              onPress={deleteSelected}
              className="rounded-lg bg-destructive px-3 py-2"
            >
              <Text className="text-sm text-destructive-foreground">Delete</Text>
            </Pressable>
          </View>
        ) : (
          <View className="flex-row gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Search"
              onPress={() => setSearchOpen((s) => !s)}
              className="h-10 w-10 items-center justify-center rounded-lg bg-muted"
            >
              <Search size={18} color="#6B7280" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Filters"
              onPress={() => router.push('/(modals)/filters')}
              className="h-10 w-10 items-center justify-center rounded-lg bg-muted"
            >
              <SlidersHorizontal size={18} color={active ? '#0B5C4B' : '#6B7280'} />
            </Pressable>
          </View>
        )
      }
    >
      {searchOpen ? (
        <View className="px-5 pb-2">
          <TextInput
            autoFocus
            placeholder="Search notes and categories"
            placeholderTextColor="#9CA3AF"
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              setLimit(PAGE);
            }}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-foreground"
          />
        </View>
      ) : null}

      {active ? (
        <View className="flex-row items-center gap-2 px-5 pb-2">
          <Text className="flex-1 text-xs text-muted-foreground">
            Showing {total.toLocaleString('en-IN')} filtered
            {summary
              ? ` · ${formatINR(summary.expensePaise, { whole: true })} out`
              : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={clearFilters}
            className="flex-row items-center gap-1 rounded-full bg-muted px-2.5 py-1"
          >
            <X size={12} color="#6B7280" />
            <Text className="text-xs text-muted-foreground">Clear</Text>
          </Pressable>
        </View>
      ) : null}

      {items.length === 0 ? (
        <EmptyState filtered={active} onClear={clearFilters} />
      ) : (
        <FlashList
          data={items}
          extraData={selected}
          keyExtractor={(item) => (item.kind === 'month' ? `m${item.key}` : `t${item.row.id}`)}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) =>
            item.kind === 'month' ? (
              <View className="bg-background px-5 pb-1 pt-4">
                <Text className="text-xs uppercase tracking-wider text-muted-foreground">
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

/**
 * Two genuinely different empty states. A brand-new install has never had a
 * transaction; a filtered view has hidden them. Offering "clear filters" to
 * someone with an empty ledger would be nonsense, and offering "add one" to
 * someone who just over-filtered is equally unhelpful.
 */
function EmptyState({ filtered, onClear }: { filtered: boolean; onClear: () => void }) {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Text
        className="text-center text-base text-foreground"
        style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
      >
        {filtered ? 'Nothing matches' : 'No transactions yet'}
      </Text>
      <Text className="mt-1 text-center text-sm text-muted-foreground">
        {filtered
          ? 'Try widening the date range or clearing the filters.'
          : 'Add your first one, or import a spreadsheet you already keep.'}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={filtered ? onClear : () => router.push('/(modals)/transaction')}
        className="mt-4 rounded-lg bg-primary px-4 py-2.5"
      >
        <Text
          className="text-primary-foreground"
          style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}
        >
          {filtered ? 'Clear filters' : 'Add a transaction'}
        </Text>
      </Pressable>
      {filtered ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/import/pick')}
          className="mt-2 px-4 py-2"
        >
          <Text className="text-sm text-primary">Import a sheet</Text>
        </Pressable>
      )}
    </View>
  );
}
