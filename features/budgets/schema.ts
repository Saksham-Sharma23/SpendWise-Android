import { z } from 'zod';

import { MAX_AMOUNT_PAISE, parseAmountToPaise } from '../../lib/money';
import type { BudgetInput } from './queries';

/**
 * Validation for the budget form.
 *
 * As with transactions, the limit stays the STRING the user typed until
 * `parseAmountToPaise` turns it straight into integer paise — no float ever
 * exists (CLAUDE.md #2).
 */

export const budgetFormSchema = z.object({
  categoryId: z.number({ message: 'Pick a category' }).int().positive('Pick a category'),

  limit: z
    .string()
    .trim()
    .min(1, 'Enter a limit')
    .refine((v) => parseAmountToPaise(v) !== null, 'That is not a valid amount')
    .refine((v) => (parseAmountToPaise(v) ?? 0) > 0, 'A limit has to be more than zero')
    .refine((v) => (parseAmountToPaise(v) ?? 0) <= MAX_AMOUNT_PAISE, 'That limit looks too large'),

  /**
   * 1–31. 31 is not "invalid in February": getCycleWindow clamps it to the
   * month's last day, which is what "resets at month end" means.
   */
  resetDay: z.number().int().min(1, 'Pick a reset day').max(31, 'Pick a reset day'),

  isActive: z.boolean(),
});

export type BudgetFormValues = z.infer<typeof budgetFormSchema>;

export const emptyBudgetForm = (): BudgetFormValues => ({
  categoryId: 0 as unknown as number,
  limit: '',
  resetDay: 1,
  isActive: true,
});

export function toBudgetInput(values: BudgetFormValues): BudgetInput {
  return {
    categoryId: values.categoryId,
    limitPaise: parseAmountToPaise(values.limit) ?? 0,
    resetDay: values.resetDay,
    isActive: values.isActive,
  };
}
