import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { readDb } from '@/db/read';
import { todayISO } from '@/lib/dates';
import { csvFileName, csvHeader, csvLine } from '../domain/csv';
import { keyOf } from '../domain/pages';
import { hasActiveFilters, type TransactionFilters } from './filters';
import { ledgerQuery, olderThanQuery, type TransactionRow } from './sql';

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
 * Pages by KEYSET through the read handle (B17). The old export paged with
 * `LIMIT … OFFSET n` on the synchronous handle: every page re-walked all the
 * rows before it, so a 50k-row export did quadratic work, and did it on the JS
 * thread. `(date, id) < (last)` is a range scan on tx_ledger_idx, and readDb
 * runs it on expo-sqlite's native worker.
 *
 * The file is written page by page with `append`, so memory stays flat
 * whatever the ledger size. Nothing leaves the device unless the user picks a
 * destination in the share sheet (CLAUDE.md #1).
 */
export async function exportTransactionsCsv(filters: TransactionFilters): Promise<ExportResult> {
  const file = new File(Paths.cache, csvFileName(todayISO(), hasActiveFilters(filters)));
  if (file.exists) file.delete();
  file.create();
  file.write(csvHeader());

  let rows = 0;
  let page = (await ledgerQuery(readDb, filters, PAGE)) as TransactionRow[];
  while (page.length > 0) {
    file.write(page.map(csvLine).join(''), { append: true });
    rows += page.length;
    if (page.length < PAGE) break;
    await yieldToUI();
    page = (await olderThanQuery(readDb, filters, keyOf(page[page.length - 1]!), PAGE)) as TransactionRow[];
  }

  if (!(await Sharing.isAvailableAsync())) return { rows, shared: false };
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export transactions',
    UTI: 'public.comma-separated-values-text',
  });
  return { rows, shared: true };
}
