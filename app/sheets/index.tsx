import { FileSpreadsheet } from 'lucide-react-native';

import { ComingSoon } from '@/components/layout/ComingSoon';

/** Every "Import a sheet" entry point lands here. Phase 6A replaces this placeholder. */
export default function SheetsScreen() {
  return (
    <ComingSoon
      title="Sheets"
      subtitle="Your spreadsheets, kept as their own workspaces"
      icon={FileSpreadsheet}
      heading="Import a sheet"
      description="Bring in an Excel or CSV file and keep it as its own sheet — view it, edit it, export it, and choose whether it counts in your totals."
      badge="Arrives in Phase 6"
    />
  );
}
