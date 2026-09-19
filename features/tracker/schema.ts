import { z } from 'zod';

import { fromISODate, toISODate } from '@/lib/dates';
import { MAX_AMOUNT_PAISE, parseAmountToPaise } from '@/lib/money';
import type { SubscriptionInput } from './queries';

/**
 * Validation for the subscription form.
 *
 * The amount is the charge PER CYCLE, not a monthly equivalent — the monthly
 * figure is derived (`toMonthlyPaise`), so storing it too would let the two
 * disagree.
 */

export const subscriptionFormSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(60, 'Keep the name under 60 characters'),

  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((v) => parseAmountToPaise(v) !== null, 'That is not a valid amount')
    .refine((v) => (parseAmountToPaise(v) ?? 0) > 0, 'Amount has to be more than zero')
    .refine((v) => (parseAmountToPaise(v) ?? 0) <= MAX_AMOUNT_PAISE, 'That amount looks too large'),

  billingCycle: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']),

  /**
   * Any occurrence of the charge, past or future. Everything else (next
   * renewal, countdown) is derived from it, which is why a past date is
   * perfectly valid here.
   */
  anchorDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
    .refine((v) => toISODate(fromISODate(v)) === v, 'That date does not exist'),

  categoryId: z.number().int().positive().nullable(),

  reminderDaysBefore: z.number().int().min(0).max(30),
});

export type SubscriptionFormValues = z.infer<typeof subscriptionFormSchema>;

export const emptySubscriptionForm = (today: string): SubscriptionFormValues => ({
  name: '',
  amount: '',
  billingCycle: 'monthly',
  anchorDate: today,
  categoryId: null,
  reminderDaysBefore: 2,
});

export function toSubscriptionInput(values: SubscriptionFormValues): SubscriptionInput {
  return {
    name: values.name.trim(),
    amountPaise: parseAmountToPaise(values.amount) ?? 0,
    billingCycle: values.billingCycle,
    anchorDate: values.anchorDate,
    categoryId: values.categoryId,
    reminderDaysBefore: values.reminderDaysBefore,
  };
}
