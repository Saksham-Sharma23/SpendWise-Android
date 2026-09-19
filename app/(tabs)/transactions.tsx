/** The ledger tab. The route stays thin (CLAUDE.md #10); the screen lives in its feature. */
import { Ledger } from '@/features/transactions';
export default function TransactionsScreen() {
  return <Ledger />;
}
