/** Home. The route stays thin (CLAUDE.md #10); the dashboard lives in its feature. */
import { Dashboard } from '@/features/dashboard';
export default function HomeScreen() {
  return <Dashboard />;
}
