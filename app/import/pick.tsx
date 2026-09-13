import { FileSpreadsheet } from 'lucide-react-native';
import { View } from 'react-native';

import { Screen } from '../../components/layout/Screen';
import { EmptyState } from '../../components/ui/EmptyState';

export default function ImportPickScreen() {
  return (
    <Screen back eyebrow="Step 1 of 4" title="Import a sheet" subtitle="Excel or CSV, from any bank or your own tracker">
      <View className="px-5">
        <EmptyState
          icon={FileSpreadsheet}
          title="Bring your spreadsheet"
          description="Pick a file, match its columns, review every row, then import it all at once — with one-tap undo."
          badge="Arrives in Phase 6"
        />
      </View>
    </Screen>
  );
}
