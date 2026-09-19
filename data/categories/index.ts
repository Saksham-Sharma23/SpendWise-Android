/**
 * The live category list, shared by every feature that shows a picker.
 *
 * It used to live in features/transactions/queries.ts, and the subscription
 * form, the filter sheet and the split-expense form all imported it from there:
 * the ledger had become the category provider by accident (review A3).
 * Anything two features need sits in data/, below them both.
 */
export { fitsType, liveCategoriesQuery, type Category, type CategoryFor } from './sql';
export { useCategories } from './hooks';
