import { Ledger } from '../../features/transactions/components/Ledger';

/** The ledger tab. The route stays thin (CLAUDE.md #10); the screen lives in its feature. */
export default function TransactionsScreen() {
  return <Ledger />;
}
