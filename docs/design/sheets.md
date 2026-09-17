# Design — Sheets (imported and linked spreadsheets)

> **Status:** designed 2026-09-14, **not built**. Phases 6A and 6B in [`TASKS.md`](../../TASKS.md).
> Moved out of `CLAUDE.md` on 2026-09-17 so the context file describes the code as it is.
> Before any 6A code, pass the *Sheets readiness gate* in TASKS.md.


> **Decided 2026-09-14.** Many people already track their money in spreadsheets. SpendWise does
> not swallow those files into its ledger — it keeps each one as its own **sheet**: a workspace
> the user views, edits and exports separately. Optionally, a sheet can be **linked** so that
> transactions added in the app appear in it automatically, in that sheet's own column order and
> format. Phases 6A and 6B in [`TASKS.md`](../../TASKS.md).

### The model

```
   Ledger (transactions)                       Sheets (one per imported file)
  ┌──────────────────────┐   link rules    ┌───────────────────────────────────┐
  │ added in the app     │ ───────────────▶│ Food log.xlsx   ← mirrored rows   │
  │ counts in totals     │  add/edit/del   │ HDFC 2025.xls   ← imported rows   │
  └──────────┬───────────┘   mirrored      │ Trip.csv        ← edited in app   │
             │                             └──────────┬───────────┬────────────┘
             ▼                                        │ include   │ export (.csv / .xlsx,
      money_rows view  ◀──────────────────────────────┘ in totals │ formatting preserved)
   (dashboard, budgets, analytics)                                ▼
                                                    share sheet / replace original
```

| Decision | Choice | Consequence |
|---|---|---|
| **What an import is** | A separate sheet, not ledger rows | Each file is viewed and edited on its own. The ledger stays the app's own data |
| **Who is written to** | The app edits **its own copy**; the original changes only on explicit **export** | No silent overwrites, no clash with edits made in Excel. The original goes stale until exported — surface that with an "Unexported changes" badge |
| **Totals** | Per-sheet **"Include in my totals"** toggle | Implemented once as a `money_rows` view (`transactions` UNION ALL included sheet rows). Mirrored rows are **never** included — they would double count |
| **Linking** | Rules per sheet (type, categories, amount range); many links at once | A transaction matching two links lands in both. The add form shows destination chips with a per-transaction skip |
| **Sync scope** | Mirror add, edit and delete | Row identity lives in `sheet_row_links`. **No ID column is ever added to the user's sheet** |
| **Formatting** | Must survive export | ExcelJS rebuilds the `.xlsx` from the stored original as a template. **Gated on a spike** — see Risks |
| **Refresh** | Re-read the original with a review step | New / changed / removed rows, per-row accept; app edits kept by default; conflicts shown when both sides changed a row |
| **View mode** | User setting: cards + form · grid · cards with grid toggle | All three render the same rows. Global default in Settings, per-sheet override |

### Data model additions

| Table | Holds | Notes |
|---|---|---|
| `sheets` | name, source filename, kind (`csv`/`xlsx`/`xls`), tab name, header row, persisted source URI, source content hash, `include_in_totals`, view-mode override, last imported/exported | The original file is kept as the export template in `files/sheets/<id>/`, **not** as a BLOB |
| `sheet_columns` | position, header, role (`date`/`amount`/`debit`/`credit`/`type`/`note`/`category`/`extra`), format | Unmapped columns are kept as `extra` and stay editable |
| `sheet_rows` | raw cells (JSON, exactly as written) **plus** normalised `date`, `amount_paise`, `type`, `category_id`; origin (`file`/`app`/`mirror`); source row index + content hash; `deleted_at` | Raw cells are what export writes; normalised columns are what SQL aggregates. Index `(sheet_id, date, deleted_at)` |
| `sheet_links` | rules, field→column mapping and order, date/amount/type formats, insert position (append / date order), enabled | One sheet can have one link; many sheets can be linked |
| `sheet_row_links` | `transaction_id` ↔ `sheet_row_id` per link | Makes edit/delete mirroring exact. Unique `(transaction_id, link_id)` |

### Import pipeline (per file, several files at once)

```
1 Pick → 2 Parse → 3 Tab → 4 Map → 5 Normalise → 6 Review → 7 Create sheet
 multi    SheetJS    picker   ↕MMKV    dd/mm picker   flagged rows    one db.transaction()
 files    papaparse           presets  ₹ · DR/CR→paise kept, not dropped + template saved
```

| Stage | Messy reality | Resolution |
|---|---|---|
| **1 Pick** | Several files; files in Drive | `File.pickFileAsync({ multipleFiles: true })` — Android's document picker, with a persistable URI grant used later by Refresh. Drive-hosted `.xlsx`/`.csv` work; **native Google Sheets documents do not** (they need the online API) |
| **2 Parse** | RN has no `File` stream; legacy bank `.xls` | SheetJS reads `.xls`/`.xlsx` from base64 (`cellDates: true`); papaparse reads CSV |
| **3 Tab** | One workbook, a tab per month | Tab picker; each chosen tab can become its own sheet |
| **4 Map** | `Txn Date`, `Narration`, `Withdrawal Amt.`, `Deposit Amt.` — or `What` / `How much` | Fuzzy header matching, two-column debit/credit mode, header-row detection under a bank logo, presets by header fingerprint. HDFC / ICICI / SBI presets bundled |
| **5 Normalise** | Excel serials, ambiguous `03/04/2026`, `"₹ 1,24,500.00"`, `"(2,300)"`, `"2300 DR"` | dd/mm vs mm/dd picker with three sample rows; parse straight to integer paise via `parseAmountToPaise`, never through a float |
| **6 Review** | 6 bad dates, 40 unknown categories | Rows that fail normalisation stay in the sheet, flagged. Category text maps to app categories (unknown → Uncategorised); the original text is kept for export |
| **7 Create** | — | One `db.transaction()` writes the sheet, columns and rows; the original file is copied in as the template |

### Linked sheets — the write path

```
createTransaction(input)
  └─ db.transaction():
       insert transactions row
       for each enabled sheet_link whose rules match:
           format fields per link (column order, date style, amount style, type style)
           insert sheet_rows (origin = 'mirror') at append / date position
           insert sheet_row_links
  ── ledger and sheets can never disagree after a crash
edit   → update mapped cells; if rules no longer match → remove from that sheet (toast)
delete → soft-delete mirrored rows;  undo → restore them
new link → offer backfill of existing matching transactions
```

Amount styles: plain `1234.50` · grouped `₹1,24,500.00` · negative-for-expense · separate debit/credit
columns · type column (`Expense`/`Income` or `DR`/`CR`). Date styles: `dd/mm/yyyy` · `yyyy-mm-dd` · `d MMM yyyy`.

### Export

- **`.csv`** — written from raw cells, UTF-8 with BOM so Excel reads ₹ correctly.
- **`.xlsx`** — ExcelJS loads the stored original as a template, rewrites the data region from
  `sheet_rows` in order, gives new rows the style of the last existing data row, and keeps widths,
  merged cells, number formats and formulas. `.xls` sources export as `.xlsx`.
- Destinations: share sheet (**Save a copy**, the default), or **Replace the original file** through
  the persisted URI — only after checking its content hash still matches the last import/export.
- Export records each row's position and hash, so the next Refresh can match rows without an ID column.

### Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| **ExcelJS under Hermes** | Heavy; expects Node `Buffer`/streams. "Must preserve formatting" depends on it | 1-day spike on a styled real fixture on the phone, before any 6A code. Fallbacks: native Apache POI (APK size) or header/column styles only |
| **Row matching on Refresh without an ID column** | Rows edited in Excel and reordered can mis-match | Position + content hash from the last import/export; ambiguous matches go to the review screen, never auto-applied |
| **Template files and the 25 MB auto-backup cap** | Large workbooks count against it | Show sheet storage in Settings; Phase 7 backup includes `files/sheets/` explicitly |
| **Double counting** | A linked sheet that is also "in totals" contains copies of ledger rows | `money_rows` excludes `origin = 'mirror'` unconditionally |
| **Parse/export on the JS thread** | Thousands of rows freeze the UI | Chunk through `InteractionManager` with a progress bar |

