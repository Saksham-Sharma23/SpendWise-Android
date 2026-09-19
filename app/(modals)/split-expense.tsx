import { ExpenseForm } from '@/features/groups/components/ExpenseForm';
import { useCategories } from '@/features/transactions/queries';

/**
 * Categories come from the ledger's feature and are handed down: features may
 * not import one another (CLAUDE.md #9), so the route is where they meet.
 */
export default function SplitExpenseModal() {
  const { data: categories } = useCategories();
  return <ExpenseForm categories={categories} />;
}
