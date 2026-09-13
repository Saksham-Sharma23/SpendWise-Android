import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import {
  createTransaction,
  getTransaction,
  softDeleteTransaction,
  updateTransaction,
  useCategories,
} from '../../features/transactions/queries';
import {
  emptyTransactionForm,
  toTransactionInput,
  transactionFormSchema,
  type TransactionFormValues,
} from '../../features/transactions/schema';
import { colorForCategory } from '../../features/transactions/components/TransactionRow';
import { addDays, todayISO } from '../../lib/dates';
import { paiseToDecimalString } from '../../lib/money';

/**
 * Add / edit a transaction.
 *
 * The Expense/Income segmented control sits at the very top, matching the web
 * app: type is the first decision, and it changes what the amount means, so
 * it belongs where the thumb lands before anything is typed.
 *
 * The amount stays a STRING all the way to `toTransactionInput`, which parses
 * it directly to integer paise. Nothing here ever builds a float.
 */

export default function TransactionModal() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;

  const { data: categories = [] } = useCategories();

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionFormSchema),
    defaultValues: emptyTransactionForm(todayISO()),
    mode: 'onTouched',
  });

  // Load the existing row when editing. Amount is rendered back through
  // paiseToDecimalString rather than a float division, so a value never
  // changes just by being opened and saved again.
  useEffect(() => {
    if (editingId == null) return;
    const row = getTransaction(editingId);
    if (!row) {
      toast.error('That transaction no longer exists');
      router.back();
      return;
    }
    reset({
      type: row.type,
      amount: paiseToDecimalString(row.amountPaise),
      date: row.date,
      categoryId: row.categoryId,
      note: row.note ?? '',
      isRecurring: row.isRecurring,
    });
  }, [editingId, reset, router]);

  const type = watch('type');
  const date = watch('date');
  const isIncome = type === 'income';

  const onSubmit = (values: TransactionFormValues) => {
    const input = toTransactionInput(values);
    if (editingId != null) {
      updateTransaction(editingId, input);
      toast.success('Transaction updated');
    } else {
      createTransaction(input);
      toast.success('Transaction added');
    }
    // No cache to invalidate: useLiveQuery re-runs every subscribed query on
    // write, so the ledger and dashboard are already correct by now.
    router.back();
  };

  const onDelete = () => {
    if (editingId == null) return;
    softDeleteTransaction(editingId);
    toast.success('Transaction deleted');
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-background"
      style={{ paddingTop: insets.top }}
    >
      <View className="flex-row items-center justify-between px-5 py-3">
        <Pressable accessibilityRole="button" onPress={() => router.back()} className="py-1">
          <Text className="text-base text-muted-foreground">Cancel</Text>
        </Pressable>
        <Text className="text-base text-foreground" style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>
          {editingId != null ? 'Edit' : 'New'} transaction
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={handleSubmit(onSubmit)}
          className="py-1"
        >
          <Text className="text-base text-primary" style={{ fontFamily: 'PlusJakartaSans_600SemiBold' }}>
            Save
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        className="px-5"
      >
        {/* Type — first, because it changes what everything below means. */}
        <Controller
          control={control}
          name="type"
          render={({ field }) => (
            <View className="mt-1 flex-row rounded-lg bg-muted p-1">
              {(['expense', 'income'] as const).map((t) => {
                const on = field.value === t;
                return (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => field.onChange(t)}
                    className={`flex-1 items-center rounded-md py-2.5 ${on ? 'bg-card' : ''}`}
                  >
                    <Text
                      style={{
                        fontFamily: on ? 'PlusJakartaSans_600SemiBold' : 'PlusJakartaSans_400Regular',
                        color: on ? (t === 'income' ? '#15803D' : '#8E2436') : '#6B7280',
                      }}
                    >
                      {t === 'expense' ? 'Expense' : 'Income'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        />

        <Field label="Amount" error={errors.amount?.message}>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <View className="flex-row items-center rounded-lg border border-border bg-card px-3">
                <Text
                  className="pr-1 text-2xl"
                  style={{ color: isIncome ? '#15803D' : '#8E2436', fontFamily: 'PlusJakartaSans_500Medium' }}
                >
                  ₹
                </Text>
                <TextInput
                  autoFocus={editingId == null}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor="#9CA3AF"
                  className="flex-1 py-3 text-2xl text-foreground"
                  style={{ fontVariant: ['tabular-nums'], fontFamily: 'PlusJakartaSans_600SemiBold' }}
                />
              </View>
            )}
          />
        </Field>

        <Field label="Date" error={errors.date?.message}>
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              onPress={() => setValue('date', addDays(date, -1), { shouldValidate: true })}
              className="h-11 w-11 items-center justify-center rounded-lg border border-border bg-card"
            >
              <ChevronLeft size={18} color="#6B7280" />
            </Pressable>
            <View className="flex-1 items-center rounded-lg border border-border bg-card py-3">
              <Text className="text-foreground" style={{ fontFamily: 'PlusJakartaSans_500Medium' }}>
                {new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next day"
              onPress={() => setValue('date', addDays(date, 1), { shouldValidate: true })}
              className="h-11 w-11 items-center justify-center rounded-lg border border-border bg-card"
            >
              <ChevronRight size={18} color="#6B7280" />
            </Pressable>
          </View>
          {date !== todayISO() ? (
            <Pressable onPress={() => setValue('date', todayISO(), { shouldValidate: true })} className="mt-2 self-start">
              <Text className="text-sm text-primary">Jump to today</Text>
            </Pressable>
          ) : null}
        </Field>

        <Field label="Category" error={errors.categoryId?.message}>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <View className="flex-row flex-wrap gap-2">
                {categories.map((c) => {
                  const on = field.value === c.id;
                  const color = colorForCategory(c.name);
                  return (
                    <Pressable
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => field.onChange(on ? null : c.id)}
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
            )}
          />
        </Field>

        <Field label="Note" error={errors.note?.message}>
          <Controller
            control={control}
            name="note"
            render={({ field }) => (
              <TextInput
                value={field.value ?? ''}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="What was it for?"
                placeholderTextColor="#9CA3AF"
                className="rounded-lg border border-border bg-card px-3 py-3 text-foreground"
              />
            )}
          />
        </Field>

        <Controller
          control={control}
          name="isRecurring"
          render={({ field }) => (
            <View className="mt-5 flex-row items-center justify-between rounded-lg border border-border bg-card px-3 py-3">
              <View className="flex-1 pr-3">
                <Text className="text-foreground">Recurring</Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  Marks the entry only — it does not create future transactions.
                </Text>
              </View>
              <Switch value={field.value} onValueChange={field.onChange} />
            </View>
          )}
        />

        {editingId != null ? (
          <Pressable accessibilityRole="button" onPress={onDelete} className="mt-6 items-center py-3">
            <Text className="text-destructive">Delete transaction</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <View className="mt-5">
      <Text className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">{label}</Text>
      {children}
      {error ? <Text className="mt-1 text-xs text-destructive">{error}</Text> : null}
    </View>
  );
}
