import { Dashboard } from '@/features/dashboard/components/Dashboard';

/** Home. The route stays thin (CLAUDE.md #10); the dashboard lives in its feature. */
export default function HomeScreen() {
  return <Dashboard />;
}
