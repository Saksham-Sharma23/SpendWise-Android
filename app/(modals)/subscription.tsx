import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, Trash2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toast } from 'sonner-native';

import { CategoryIcon } from '../../components/ui/CategoryIcon';
import { PressableScale } from '../../components/ui/PressableScale';
import { Segmented } from '../../components/ui/Segmented';
import { useCategories } from '../../features/transactions/queries';
import {
  createSubscription,
  getSubscription,
  restoreSubscription,
  softDeleteSubscription,
  updateSubscription,
} from '../../features/tracker/queries';
import { deterministicColor, deterministicIcon } from '../../lib/identity';
import {
  emptySubscriptionForm,
  subscriptionFormSchema,
  toSubscriptionInput,
  type SubscriptionFormValues,
} from '../../features/tracker/schema';
import { colorForCategory } from '../../lib/categoryColor';
import { addDays, addMonthsClamped, formatDayMonth, getNextRenewal } from '../../lib/dates';
import { formatINR, paiseToDecimalString, parseAmountToPaise } from '../../lib/money';
import { toMonthlyPaise } from '../../lib/dates';
import { useToday } from '../../lib/today';
import { colors, fonts, useColors, withAlpha } from '../../lib/theme';

/**
 * Add / edit a subscription.
 *
 * The anchor date is labelled "Started on / next charge" rather than
 * "renewal date", because that is what it is: any one occurrence. The form
 * shows the renewal it implies, so the derivation is never a mystery.
 */
export default function SubscriptionModal() {
  const colors = useColors();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id ? Number(params.id) : null;
  const today = useToday();

  const { data: categories = [] } = useCategories();
  const [initial] = useState(() => (editingId != null ? getSubscription(editingId) : undefined));
  const missing = editingId != null && !initial;

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SubscriptionFormValues>({
    resolver: zodResolver(subscriptionFormSchema),
    defaultValues: initial
      ? {
          name: initial.name,
          amount: paiseToDecimalString(initial.amountPaise),
          billingCycle: initial.billingCycle,
          anchorDate: initial.anchorDate,
          categoryId: initial.categoryId,
          reminderDaysBefore: initial.reminderDaysBefore,
        }
      : emptySubscriptionForm(today),
    mode: 'onTouched',
  });

  useEffect(() => {
    if (!missing) return;
    toast.error('That subscription no longer exists');
    router.back();
  }, [missing, router]);

  const name = watch('name');
  const amount = watch('amount');
  const cycle = watch('billingCycle');
  const anchorDate = watch('anchorDate');
  const categoryId = watch('categoryId');
  const reminder = watch('reminderDaysBefore');

  const category = categories.find((c) => c.id === categoryId);
  const icon = category?.icon ?? deterministicIcon(name || 'Subscription');
  const color = category?.color ?? (category ? colorForCategory(category.name) : deterministicColor(name || 'x'));

  const paise = parseAmountToPaise(amount) ?? 0;
  const nextRenewal = getNextRenewal(anchorDate, cycle, today);

  const submitting = useRef(false);
  const [saving, setSaving] = useState(false);

  const onSubmit = (values: SubscriptionFormValues) => {
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);

    const input = toSubscriptionInput(values);
    const result = editingId != null ? updateSubscription(editingId, input) : createSubscription(input);

    if (!result.ok) {
      submitting.current = false;
      setSaving(false);
      return;
    }
    toast.success(editingId != null ? 'Subscription updated' : `${input.name} is being tracked`);
    router.back();
  };

  const onDelete = () => {
    if (editingId == null || submitting.current) return;
    const id = editingId;
    if (!softDeleteSubscription(id).ok) return;
    submitting.current = true;
    toast.success('Subscription deleted', { action: { label: 'Undo', onClick: () => restoreSubscription(id) } });
    router.back();
  };

  return (
    <KeyboardAvoidingView
      behavior="padding"
      className="flex-1"
      style={{ paddingTop: insets.top, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center justify-between px-5 py-3">
        <RoundButton label="Close" onPress={() => router.back()}>
          <X size={19} color={colors.foreground} />
        </RoundButton>
        <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 16 }}>
          {editingId != null ? 'Edit subscription' : 'New subscription'}
        </Text>
        {editingId != null ? (
          <RoundButton label="Delete subscription" onPress={onDelete} tint={colors.expense}>
            <Trash2 size={17} color={colors.expense} />
          </RoundButton>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        className="px-5"
      >
        {/* Name and amount together: the icon updates as the name is typed,
            which is the first sign the deterministic look is doing anything. */}
        <Animated.View entering={FadeInDown.duration(350)} className="mt-2 flex-row items-center gap-3">
          <CategoryIcon icon={icon} color={color} size={52} />
          <Controller
            control={control}
            name="name"
            render={({ field }) => (
              <TextInput
                autoFocus={editingId == null}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                placeholder="Netflix, rent, gym…"
                placeholderTextColor={colors.subtle}
                selectionColor={colors.primary}
                className="flex-1 rounded-2xl border px-4 py-3.5"
                style={{
                  color: colors.foreground,
                  fontFamily: fonts.semibold,
                  fontSize: 16,
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                }}
              />
            )}
          />
        </Animated.View>
        {errors.name?.message ? <ErrorText>{errors.name.message}</ErrorText> : null}

        <Animated.View entering={FadeInDown.delay(60).duration(350)} className="items-center py-7">
          <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 13 }}>How much per charge?</Text>
          <Controller
            control={control}
            name="amount"
            render={({ field }) => (
              <View className="mt-2 flex-row items-center justify-center">
                <Text style={{ color: colors.primary, fontFamily: fonts.semibold, fontSize: 34, marginRight: 4 }}>₹</Text>
                <TextInput
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.subtle}
                  selectionColor={colors.primary}
                  style={{
                    color: colors.foreground,
                    fontFamily: fonts.bold,
                    fontSize: 46,
                    letterSpacing: -1.5,
                    minWidth: 60,
                    paddingVertical: 0,
                    fontVariant: ['tabular-nums'],
                  }}
                />
              </View>
            )}
          />
          {/* The comparable figure, so a yearly plan can be judged against a monthly one. */}
          {paise > 0 && cycle !== 'monthly' ? (
            <Text style={{ color: colors.muted, fontFamily: fonts.medium, fontSize: 12, marginTop: 6 }}>
              {formatINR(toMonthlyPaise(paise, cycle), { whole: true })} a month
            </Text>
          ) : null}
          {errors.amount?.message ? <ErrorText>{errors.amount.message}</ErrorText> : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(350)}>
          <Label>Billing cycle</Label>
          <Controller
            control={control}
            name="billingCycle"
            render={({ field }) => (
              <Segmented
                size="sm"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'weekly', label: 'Weekly' },
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'quarterly', label: 'Quarterly' },
                  { value: 'yearly', label: 'Yearly' },
                ]}
              />
            )}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(180).duration(350)} className="mt-6">
          <Label>Charged on</Label>
          <View
            className="flex-row items-center rounded-2xl border p-1.5"
            style={{ backgroundColor: colors.card, borderColor: colors.border }}
          >
            <RoundButton label="Previous day" onPress={() => setValue('anchorDate', addDays(anchorDate, -1), { shouldValidate: true })} plain>
              <ChevronLeft size={18} color={colors.foreground} />
            </RoundButton>
            <View className="flex-1 flex-row items-center justify-center gap-2">
              <CalendarDays size={16} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontFamily: fonts.semibold, fontSize: 15 }}>
                {formatDayMonth(anchorDate)} {anchorDate.slice(0, 4)}
              </Text>
            </View>
            <RoundButton label="Next day" onPress={() => setValue('anchorDate', addDays(anchorDate, 1), { shouldValidate: true })} plain>
              <ChevronRight size={18} color={colors.foreground} />
            </RoundButton>
          </View>
          <View className="mt-2 flex-row gap-2">
            {[
              { label: 'Today', value: today },
              { label: 'A month ago', value: addMonthsClamped(today, -1) },
              { label: 'A year ago', value: addMonthsClamped(today, -12) },
            ].map((d) => {
              const on = anchorDate === d.value;
              return (
                <PressableScale
                  key={d.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setValue('anchorDate', d.value, { shouldValidate: true })}
                  className="rounded-full border px-3.5 py-1.5"
                  style={{
                    borderColor: on ? colors.primaryBorder : colors.border,
                    backgroundColor: on ? colors.primarySoft : 'transparent',
                  }}
                >
                  <Text style={{ color: on ? colors.primary : colors.muted, fontFamily: fonts.medium, fontSize: 12 }}>
                    {d.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          {/* Any occurrence will do — show what it works out to, so that is obvious. */}
          <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginTop: 10 }}>
            Next charge {formatDayMonth(nextRenewal)} {nextRenewal.slice(0, 4)} · past dates are fine, the next one is worked out for you
          </Text>
          {errors.anchorDate?.message ? <ErrorText>{errors.anchorDate.message}</ErrorText> : null}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(240).duration(350)} className="mt-6">
          <Label>Category</Label>
          <Controller
            control={control}
            name="categoryId"
            render={({ field }) => (
              <View className="flex-row flex-wrap gap-2">
                {categories.map((c) => {
                  const on = field.value === c.id;
                  const tint = c.color ?? colorForCategory(c.name);
                  return (
                    <PressableScale
                      key={c.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => field.onChange(on ? null : c.id)}
                      scaleTo={0.94}
                      className="flex-row items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5"
                      style={{
                        borderColor: on ? tint : colors.border,
                        backgroundColor: on ? withAlpha(tint, 0.16) : colors.card,
                      }}
                    >
                      <CategoryIcon icon={c.icon} color={tint} size={26} />
                      <Text
                        style={{
                          color: on ? colors.foreground : colors.muted,
                          fontFamily: on ? fonts.semibold : fonts.medium,
                          fontSize: 13,
                        }}
                      >
                        {c.name}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            )}
          />
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(350)} className="mt-6">
          <Label>Remind me</Label>
          <View className="flex-row flex-wrap gap-2">
            {[0, 1, 2, 3, 7].map((d) => {
              const on = reminder === d;
              return (
                <PressableScale
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setValue('reminderDaysBefore', d, { shouldValidate: true })}
                  scaleTo={0.92}
                  className="flex-row items-center gap-1.5 rounded-2xl border px-3.5 py-2.5"
                  style={{
                    borderColor: on ? colors.primaryBorder : colors.border,
                    backgroundColor: on ? colors.primarySoft : colors.card,
                  }}
                >
                  {on ? <Bell size={14} color={colors.primary} /> : null}
                  <Text
                    style={{
                      color: on ? colors.primary : colors.muted,
                      fontFamily: on ? fonts.semibold : fonts.medium,
                      fontSize: 13,
                    }}
                  >
                    {d === 0 ? 'On the day' : d === 1 ? '1 day before' : `${d} days before`}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
          {/* Honest about what does not exist yet — notifications land in Phase 8. */}
          <Text style={{ color: colors.subtle, fontFamily: fonts.regular, fontSize: 12, marginTop: 10 }}>
            Saved with the subscription. Reminders start firing once notifications are switched on.
          </Text>
        </Animated.View>
      </ScrollView>

      <View
        className="px-5 pt-3"
        style={{ paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.border }}
      >
        <PressableScale
          accessibilityRole="button"
          disabled={saving}
          onPress={handleSubmit(onSubmit)}
          className="items-center rounded-full py-4"
          style={{ backgroundColor: colors.primary }}
        >
          <Text style={{ color: colors.onPrimary, fontFamily: fonts.bold, fontSize: 16 }}>
            {editingId != null ? 'Save changes' : 'Track it'}
          </Text>
        </PressableScale>
      </View>
    </KeyboardAvoidingView>
  );
}

function Label({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text
      style={{
        color: colors.muted,
        fontFamily: fonts.semibold,
        fontSize: 12,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function ErrorText({ children }: { children: string }) {
  const colors = useColors();
  return <Text style={{ color: colors.expense, fontFamily: fonts.medium, fontSize: 12, marginTop: 6 }}>{children}</Text>;
}

function RoundButton({
  label,
  onPress,
  children,
  tint,
  plain = false,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
  tint?: string;
  plain?: boolean;
}) {
  const colors = useColors();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      scaleTo={0.88}
      className="h-10 w-10 items-center justify-center rounded-full"
      style={
        plain
          ? { backgroundColor: colors.elevated }
          : {
              backgroundColor: tint ? withAlpha(tint, 0.12) : colors.card,
              borderWidth: 1,
              borderColor: tint ? withAlpha(tint, 0.3) : colors.border,
            }
      }
    >
      {children}
    </PressableScale>
  );
}
