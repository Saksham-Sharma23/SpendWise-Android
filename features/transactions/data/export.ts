import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { todayISO } from '@/lib/dates';
import { csvFileName, csvHeader, csvLine } from '../domain/csv';
import { getTransactionsPage, hasActiveFilters, type TransactionFilters } from './queries';

const PAGE = 2000;

/** Let the UI thread paint between pages, so the export never reads as a freeze. */
const yieldToUI = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export interface ExportResult {
  rows: number;
  shared: boolean;
}

/**
 * Export every transaction matching `filters` to a CSV and open the share
 * sheet.
 *
 * The file is written to the cache directory page by page with `append`, so
 * memory stays flat whatever the ledger size. Nothing leaves the device
 * unless the user picks a destination in the share sheet — the app itself
 * sends nothing anywhere (CLAUDE.md #1).
 */
export async function exportTransactionsCsv(filters: TransactionFilters): Promise<ExportResult> {
  const file = new File(Paths.cache, csvFileName(todayISO(), hasActiveFilters(filters)));
  if (file.exists) file.delete();
  file.create();
  file.write(csvHeader());

  let rows = 0;
  for (let offset = 0; ; offset += PAGE) {
    const page = getTransactionsPage(filters, PAGE, offset);
    if (page.length === 0) break;
    file.write(page.map(csvLine).join(''), { append: true });
    rows += page.length;
    if (page.length < PAGE) break;
    await yieldToUI();
  }

  if (!(await Sharing.isAvailableAsync())) return { rows, shared: false };
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export transactions',
    UTI: 'public.comma-separated-values-text',
  });
  return { rows, shared: true };
}
