import { FileSpreadsheet } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { EmptyState } from '../../components/ui/EmptyState';

/**
 * Sheets — the list of imported spreadsheets (CLAUDE.md "Sheets").
 *
 * Every "Import a sheet" entry point lands here: the FAB long-press, More,
 * and the empty Home, Transactions and Insights screens. Phase 6A replaces
 * this placeholder with the list and the import wizard beneath it.
 */
export default function SheetsScreen() {
  return (
    <Screen back title="Sheets" subtitle="Your spreadsheets, kept as their own workspaces">
      <View className="px-5">
        <EmptyState
          icon={FileSpreadsheet}
          title="Import a sheet"
          description="Bring in an Excel or CSV file and keep it as its own sheet — view it, edit it, export it, and choose whether it counts in your totals."
          badge="Arrives in Phase 6"
        />
      </View>
    </Screen>
  );
}
