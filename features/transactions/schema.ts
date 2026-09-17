import { z } from 'zod';

import { fromISODate, toISODate } from '../../lib/dates';
import { MAX_AMOUNT_PAISE, parseAmountToPaise } from '../../lib/money';
import type { TransactionInput } from './queries';

/**
 * Validation for the add/edit transaction form.
 *
 * The amount is validated as the STRING the user typed, not as a number.
 * That is deliberate: `parseAmountToPaise` goes from text straight to integer
 * paise without ever constructing a float, so '1.005' becomes 101 paise
 * rather than the 100 a float round-trip would give (see lib/__tests__/money).
 * Letting Zod coerce to a number first would throw that away.
 */

const MAX_NOTE = 200;

export const transactionFormSchema = z.object({
  type: z.enum(['expense', 'income']),

  amount: z
    .string()
    .trim()
    .min(1, 'Enter an amount')
    .refine((v) => parseAmountToPaise(v) !== null, 'That is not a valid amount')
    .refine((v) => (parseAmountToPaise(v) ?? 0) !== 0, 'Amount cannot be zero')
    .refine((v) => Math.abs(parseAmountToPaise(v) ?? 0) <= MAX_AMOUNT_PAISE, 'That amount looks too large'),

  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date')
    // Date.parse accepts 2026-02-31 in most engines, so round-trip instead:
    // an impossible date comes back as a different string.
    .refine((v) => toISODate(fromISODate(v)) === v, 'That date does not exist'),

  categoryId: z.number().int().positive().nullable(),

  note: z.string().trim().max(MAX_NOTE, `Keep it under ${MAX_NOTE} characters`).optional(),
});

export type TransactionFormValues = z.infer<typeof transactionFormSchema>;

export const emptyTransactionForm = (date: string): TransactionFormValues => ({
  type: 'expense',
  amount: '',
  date,
  categoryId: null,
  note: '',
});

/**
 * Form values -> the shape `createTransaction` / `updateTransaction` expect.
 *
 * Amount is stored as a magnitude; direction is carried by `type`. Storing a
 * signed amount as well would let the two disagree, and every aggregate in
 * the app splits on `type` via CASE — a negative income row would quietly
 * corrupt the trend chart.
 */
export function toTransactionInput(values: TransactionFormValues): TransactionInput {
  const paise = parseAmountToPaise(values.amount) ?? 0;
  return {
    type: values.type,
    amountPaise: Math.abs(paise),
    date: values.date,
    note: values.note?.trim() ? values.note.trim() : null,
    categoryId: values.categoryId,
  };
}
