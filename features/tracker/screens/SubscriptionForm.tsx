import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Bell, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { TextInput, View } from 'react-native';
import { toast } from 'sonner-native';

import { CategoryChip } from '@/components/ui/CategoryChip';
import { CategoryIcon } from '@/components/ui/CategoryIcon';
import { Chip } from '@/components/ui/Chip';
import { DatePickerSheet } from '@/components/ui/DatePickerSheet';
import { ErrorText } from '@/components/ui/Field';
import { FormModal, useSubmitOnce } from '@/components/ui/FormModal';
import { IconButton } from '@/components/ui/IconButton';
import { PressableScale } from '@/components/ui/PressableScale';
import { Section } from '@/components/ui/Section';
import { Segmented } from '@/components/ui/Segmented';
import { Text, font } from '@/components/ui/Text';
import { useCategories } from '@/data/categories';
import { colorForName } from '@/lib/categoryColor';
import { addDays, addMonthsClamped, formatDayMonth } from '@/lib/dates';
import { getNextRenewal, toMonthlyPaise } from '@/lib/subscriptions';
import { deterministicColor, deterministicIcon } from '@/lib/identity';
import { formatINR, paiseToDecimalString, parseAmountToPaise } from '@/lib/money';
import { useColors } from '@/lib/theme';
import { useToday } from '@/lib/today';
import {
  createSubscription,
  getSubscription,
  restoreSubscription,
  softDeleteSubscription,
  updateSubscription,
} from '../data/actions';
import {
  emptySubscriptionForm,
  subscriptionFormSchema,
  toSubscriptionInput,
  type SubscriptionFormValues,
} from '../schema';

/**
 * Add / edit a subscription.
 *
 * The anchor date is labelled "Started on / next charge" rather than
 * "renewal date", because that is what it is: any one occurrence. The form
 * shows the renewal it implies, so the derivation is never a mystery.
 */

/** Each block rises 60 ms after the one above it. */
const STAGGER = { base: 0, step: 60 };

export function SubscriptionForm({ editingId }: { editingId: number | null }) {
  const colors = useColors();
  const router = useRouter();
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

  const name = watch('name');
  const amount = watch('amount');
  const cycle = watch('billingCycle');
  const anchorDate = watch('anchorDate');
  const categoryId = watch('categoryId');
  const reminder = watch('reminderDaysBefore');
  const [pickingDate, setPickingDate] = useState(false);

  const category = categories.find((c) => c.id === categoryId);
  const icon = category?.icon ?? deterministicIcon(name || 'Subscription');
  const color = category?.color ?? (category ? colorForName(category.name) : deterministicColor(name || 'x'));

  const paise = parseAmountToPaise(amount) ?? 0;
  const nextRenewal = getNextRenewal(anchorDate, cycle, today);

  const { submit, run, busy } = useSubmitOnce((values: SubscriptionFormValues) => {
    const input = toSubscriptionInput(values);
    const result = editingId != null ? updateSubscription(editingId, input) : createSubscription(input);
    if (result.ok) {
      toast.success(editingId != null ? 'Subscription updated' : `${input.name} is being tracked`);
      router.back();
    }
    return result;
  });

  const onDelete = () => {
    if (editingId == null) return;
    const id = editingId;
    run(() => {
      const result = softDeleteSubscription(id);
      if (result.ok) {
        toast.success('Subscription deleted', { action: { label: 'Undo', onClick: () => restoreSubscription(id) } });
        router.back();
      }
      return result;
    });
  };

  return (
    <FormModal
      title={editingId != null ? 'Edit subscription' : 'New subscription'}
      onDelete={editingId != null ? onDelete : undefined}
      deleteLabel="Delete subscription"
      missing={missing ? 'That subscription no longer exists' : undefined}
      primary={{ label: editingId != null ? 'Save changes' : 'Track it', onPress: handleSubmit(submit), busy }}
    >
      {/* Name and amount together: the icon updates as the name is typed,
          which is the first sign the deterministic look is doing anything. */}
      <Section index={0} stagger={STAGGER} className="mt-2 flex-row items-center gap-3">
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
                ...font('semibold', 16),
                color: colors.foreground,
                backgroundColor: colors.card,
                borderColor: colors.border,
              }}
            />
          )}
        />
      </Section>
      {errors.name?.message ? <ErrorText>{errors.name.message}</ErrorText> : null}

      <Section index={1} stagger={STAGGER} className="items-center py-7">
        <Text variant="body" tone="muted">
          How much per charge?
        </Text>
        <Controller
          control={control}
          name="amount"
          render={({ field }) => (
            <View className="mt-2 flex-row items-center justify-center">
              <Text weight="semibold" size={34} tone="primary" style={{ marginRight: 4 }}>
                ₹
              </Text>
              <TextInput
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={colors.subtle}
                selectionColor={colors.primary}
                style={{
                  ...font('bold', 46),
                  color: colors.foreground,
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
          <Text variant="small" tone="muted" style={{ marginTop: 6 }}>
            {formatINR(toMonthlyPaise(paise, cycle), { whole: true })} a month
          </Text>
        ) : null}
        {errors.amount?.message ? <ErrorText>{errors.amount.message}</ErrorText> : null}
      </Section>

      <Section index={2} stagger={STAGGER} className="" label="Billing cycle">
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
      </Section>

      <Section index={3} stagger={STAGGER} className="mt-6" label="Charged on">
        <View
          className="flex-row items-center rounded-2xl border p-1.5"
          style={{ backgroundColor: colors.card, borderColor: colors.border }}
        >
          <IconButton
            label="Previous day"
            look="plain"
            onPress={() => setValue('anchorDate', addDays(anchorDate, -1), { shouldValidate: true })}
          >
            <ChevronLeft size={18} color={colors.foreground} />
          </IconButton>
          {/* R4-7: the same calendar as the transaction form, not just the arrows. */}
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel={`Charged on ${formatDayMonth(anchorDate)} ${anchorDate.slice(0, 4)}. Opens a calendar`}
            onPress={() => setPickingDate(true)}
            scaleTo={0.96}
            className="flex-1 flex-row items-center justify-center gap-2"
          >
            <CalendarDays size={16} color={colors.primary} />
            <Text variant="bodyStrong" tone="default">
              {formatDayMonth(anchorDate)} {anchorDate.slice(0, 4)}
            </Text>
          </PressableScale>
          <IconButton
            label="Next day"
            look="plain"
            onPress={() => setValue('anchorDate', addDays(anchorDate, 1), { shouldValidate: true })}
          >
            <ChevronRight size={18} color={colors.foreground} />
          </IconButton>
        </View>
        <View className="mt-2 flex-row gap-2">
          {[
            { label: 'Today', value: today },
            { label: 'A month ago', value: addMonthsClamped(today, -1) },
            { label: 'A year ago', value: addMonthsClamped(today, -12) },
          ].map((d) => (
            <Chip
              key={d.label}
              label={d.label}
              size="sm"
              rest="transparent"
              selected={anchorDate === d.value}
              onPress={() => setValue('anchorDate', d.value, { shouldValidate: true })}
            />
          ))}
        </View>
        {/* Any occurrence will do — show what it works out to, so that is obvious. */}
        <Text variant="caption" tone="subtle" style={{ marginTop: 10 }}>
          Next charge {formatDayMonth(nextRenewal)} {nextRenewal.slice(0, 4)} · past dates are fine, the next one is
          worked out for you
        </Text>
        {errors.anchorDate?.message ? <ErrorText>{errors.anchorDate.message}</ErrorText> : null}
        <DatePickerSheet
          visible={pickingDate}
          value={anchorDate}
          today={today}
          title="When is it charged?"
          onSelect={(d) => {
            setValue('anchorDate', d, { shouldValidate: true });
            setPickingDate(false);
          }}
          onClose={() => setPickingDate(false)}
        />
      </Section>

      <Section index={4} stagger={STAGGER} className="mt-6" label="Category">
        <Controller
          control={control}
          name="categoryId"
          render={({ field }) => (
            <View className="flex-row flex-wrap gap-2">
              {categories.map((c) => (
                <CategoryChip
                  key={c.id}
                  category={c}
                  selected={field.value === c.id}
                  onPress={() => field.onChange(field.value === c.id ? null : c.id)}
                />
              ))}
            </View>
          )}
        />
      </Section>

      <Section index={5} stagger={STAGGER} className="mt-6" label="Remind me">
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
                <Text weight={on ? 'semibold' : 'medium'} size={13} tone={on ? 'primary' : 'muted'}>
                  {d === 0 ? 'On the day' : d === 1 ? '1 day before' : `${d} days before`}
                </Text>
              </PressableScale>
            );
          })}
        </View>
        {/* Honest about what does not exist yet — notifications land in Phase 8. */}
        <Text variant="caption" tone="subtle" style={{ marginTop: 10 }}>
          Saved with the subscription. Reminders start firing once notifications are switched on.
        </Text>
      </Section>
    </FormModal>
  );
}
