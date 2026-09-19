import { paiseToDecimalString } from '@/lib/money';

/**
 * CSV formatting for the ledger export — pure, so it is tested in Node.
 *
 * Three details decide whether the file opens correctly in Excel:
 *   - a UTF-8 byte-order mark, or Excel guesses a legacy code page and the
 *     ₹ in a note becomes "â‚¹";
 *   - CRLF line endings, which Excel expects;
 *   - amounts written as plain decimals from integer paise ("1245.50"), never
 *     through a float and never with grouping commas that would split cells.
 */

export const CSV_BOM = '﻿';
export const CSV_EOL = '\r\n';

export const CSV_COLUMNS = ['Date', 'Type', 'Amount', 'Category', 'Note'] as const;

export interface CsvRow {
  date: string;
  type: 'expense' | 'income';
  amountPaise: number;
  categoryName: string | null;
  note: string | null;
}

/**
 * Quote a cell when it contains a delimiter, quote or line break, doubling
 * embedded quotes (RFC 4180). A leading = + - @ is prefixed with an
 * apostrophe so a note like "=HYPERLINK(...)" cannot run as a formula when
 * the file is opened in a spreadsheet.
 */
export function csvCell(value: string | null | undefined): string {
  if (value == null) return '';
  let v = String(value);
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function csvHeader(): string {
  return CSV_BOM + CSV_COLUMNS.join(',') + CSV_EOL;
}

export function csvLine(row: CsvRow): string {
  return (
    [
      row.date,
      row.type === 'income' ? 'Income' : 'Expense',
      paiseToDecimalString(row.amountPaise),
      csvCell(row.categoryName),
      csvCell(row.note),
    ].join(',') + CSV_EOL
  );
}

/** A dated, filesystem-safe name: spendwise-transactions-2026-09-14.csv */
export function csvFileName(today: string, filtered: boolean): string {
  return `spendwise-transactions${filtered ? '-filtered' : ''}-${today}.csv`;
}
