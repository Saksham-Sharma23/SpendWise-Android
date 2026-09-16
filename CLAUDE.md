# SpendWise Android — Full Project Context (V1)

> A **completely standalone, offline-only** Android expense tracker. Every rupee lives in a SQLite
> database on the phone. **There is no server, no account, and no network call in this application.**
>
> It shares its *design* and its *domain model* with the SpendWise web app — and nothing else.
> No shared code, no shared API, no shared database. That is why there is no login to drop.
>
> **Live build plan (diagrams, rationale, phase tracker):** https://claude.ai/code/artifact/cb2c502a-0993-439c-8abf-90b4524cb707
> **Task list:** [`TASKS.md`](TASKS.md)
> **Design reference only:** [`pcref/CLAUDE.md`](pcref/CLAUDE.md) — the web app's context doc. Read it for
> feature behaviour, UI conventions and domain rules. **Never** treat its API surfaces as something to call.

---

## ⚠️ Read This Before Anything Else

Earlier planning assumed this app was a client for the web app's FastAPI backend. **It is not.**
If you find any instruction, file or comment that implies calling `https://…onrender.com`, using
Axios, storing a JWT, or refreshing a token — it is wrong and predates this decision. Delete it.

**This app makes zero network requests.** The release build should not even declare the
`INTERNET` permission.

---

## System Info
- **OS**: Windows 10 (Git Bash / MINGW64 available; PowerShell 5.1 is the default shell)
- **Project Root**: `D:\Projects\SpendWise_Android`
- **Node**: 22.x
- **Test device**: physical Android phone over wireless debugging (no emulator in the loop)
- **Backend**: none. There is no backend. Do not create one.

---

## The Four Locked Decisions

| Decision | Choice | Consequence |
|---|---|---|
| **Architecture** | Standalone, zero network | No auth, no HTTP, no server-state cache, no offline queue, no cold starts. Only files cross the boundary: spreadsheets in and out, backups out |
| **Storage** | SQLite via `expo-sqlite` + Drizzle ORM | Real SQL, typed queries, generated migrations. `useDbQuery` (lib/db) replaces TanStack Query entirely |
| **Analytics** | SQL aggregation on-device | Port the FastAPI aggregations to `GROUP BY` queries. Never `SELECT` rows you intend to sum |
| **Durability** | Manual export **+** Android auto-backup **+** monthly reminder | All three ship. Each covers a case the others miss. This is the defining risk of a standalone app |

> **Amended 2026-09-14 (TASKS2 F0) — encryption at rest.** The main database is **not** SQLCipher-encrypted
> on the device. It lives in the app sandbox, which Android's file-based encryption already protects, and
> Android auto-backup encrypts its copy with the lock-screen PIN (Android 9+). The earlier design keyed the
> file with a Keystore-held key that never leaves the phone, so an auto-backup restore on a new device
> produced a database nobody could open — Layer 2 of *Durability* could not work.
> **SQLCipher stays in the build** for one job: writing and reading **passphrase-encrypted backup files**
> (`ATTACH … KEY` + `sqlcipher_export`), the copies that actually leave the device. Without a key, SQLCipher
> behaves exactly like SQLite. Implemented in TASKS2 batch 1B.

---

## What Being Standalone Changes

| Concern | If it were a backend client | Standalone |
|---|---|---|
| Auth | JWT pair, refresh queue, SecureStore | **Gone.** No accounts exist |
| Networking | Axios, interceptors, retry, timeouts | **Gone.** No `INTERNET` permission |
| Server state | TanStack Query, staleTime, invalidation | **Gone.** `useDbQuery` over `db/read.ts` — the DB *is* the state |
| Offline mode | Mutation queue, paused mutations, replay | **Gone.** Always offline, so there is no "offline" |
| Cold starts | Render sleeps 30–60s | **Gone.** Local queries return in single-digit ms |
| Analytics | Server returns finished aggregates | **New work.** Port to on-device SQL |
| Seeding | Server seeds system categories | **New work.** Seed on first launch |
| Bulk import | Needs endpoint + chunking + idempotency | **Simpler.** One local transaction |
| Durability | Free — server has backups | **New work, biggest risk.** Factory reset = total loss |
| Data model | Owned by backend, generated from OpenAPI | **Owned here.** `db/schema.ts` is the source of truth |

**The trade:** you lose multi-device access and server-side backup. You gain an app that opens
instantly, works on a plane, costs nothing to run forever, has no attack surface, and needs no
privacy policy about transmitted data because it transmits none.

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | `expo@57`, RN 0.86, React 19.2 | New Architecture default, Hermes |
| Language | TypeScript 5.x `strict` | Types flow from the Drizzle schema outward |
| Routing | `expo-router` | File-based, same mental model as the web App Router |
| **Database** | `expo-sqlite` + `drizzle-orm` | Real SQL, typed queries, aggregation in the engine |
| **Migrations** | `drizzle-kit` + `useMigrations` | The Alembic analogue. Bundled, applied at launch |
| **Reactivity** | `useDbQuery` (lib/db) + `readDb` (db/read.ts) | **Not** Drizzle's `useLiveQuery` (it re-ran per changed row, ignored joined tables, raced, swallowed errors). Reads execute on expo-sqlite's native thread; re-runs are coalesced per table and paused while unfocused. Needs `enableChangeListener: true` |
| Encryption | SQLCipher via `useSQLCipher` | **Backup files only** — the main DB is opened without a key (see the amendment under *Locked Decisions*) |
| Styling | `nativewind` v4 | Tokens in `lib/theme.ts`. **Dark-only in v1**; a light theme arrives as a Settings toggle in Phase 9 |
| Components | `react-native-reusables` | shadcn philosophy for RN — copy-paste, you own it |
| Client state | `zustand` | Filters, theme, import wizard draft only |
| Forms | `react-hook-form` + `zod` | Zod at the form boundary, Drizzle types at the DB boundary |
| Lists | `@shopify/flash-list` v2 | JS-only rewrite for Fabric, no size estimates |
| Charts | `react-native-svg` + Reanimated *(decided Phase 5, 2026-09-15)* | Presentational wrappers in `components/charts/`, pure maths in `geometry.ts`. Animations and the scrubber run in worklets; no Skia, so no native rebuild |
| Animation | `react-native-reanimated` v4, `react-native-gesture-handler` | UI-thread |
| Key-value | `react-native-mmkv` | Prefs, import presets, widget snapshot. **Not for records** |
| Toasts | `sonner-native` | Same API as the web's sonner |
| Sheets | `@gorhom/bottom-sheet` | |
| Icons · Font | `lucide-react-native` · `@expo-google-fonts/plus-jakarta-sans` | Identical to web |
| Spreadsheets | `xlsx` (SheetJS) + `papaparse` read · `exceljs` write | SheetJS reads `.xls`/`.xlsx`; ExcelJS writes `.xlsx` preserving formatting (**pending spike**) |
| Files | `expo-document-picker`, `expo-file-system`, `expo-sharing` | Import in, backup out |
| Notifications | `expo-notifications` (local) | Renewals, budget alerts, backup nudge |
| Widget | `react-native-android-widget` | Config plugin → RemoteViews |
| Lock | `expo-local-authentication` | Optional biometric gate |
| Monitoring | `@sentry/react-native` | **Dev profile only** — it requires `INTERNET` |
| Build | EAS Build, EAS Update | Cloud builds, OTA JS |

**Version discipline:** install with `npx expo install <pkg>`, upgrade with
`npx expo install expo@latest --fix`. Hand-pinning `react-native`, `react-native-reanimated`
or `expo-router` is the #1 cause of "builds locally, fails on EAS".

---

## Repository Layout

```
D:\Projects\SpendWise_Android
├── app/                          # routes only — thin
│   ├── _layout.tsx               # fonts, theme, useMigrations gate, splash
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tabs + centre FAB
│   │   ├── index.tsx             # Home
│   │   ├── transactions.tsx
│   │   ├── insights.tsx          # Analytics
│   │   └── more.tsx
│   ├── budgets/index.tsx
│   ├── tracker/index.tsx
│   ├── sheets/                   # list · [id] workspace · import wizard · link setup
│   ├── backup/index.tsx          # export · restore · history
│   ├── settings/
│   ├── (modals)/                 # transaction · budget · subscription
│   └── +not-found.tsx
├── db/                           # THE SOURCE OF TRUTH
│   ├── schema.ts                 # Drizzle tables — all types flow from here
│   ├── connection.ts             # the one reopenable connection + pragmas (no key) + WAL checkpoint
│   ├── client.ts                 # sync Drizzle handle: WRITES + tiny point reads; writeTx()
│   ├── read.ts                   # async Drizzle handle (sqlite-proxy): every screen READ
│   ├── tx.ts                     # runWriteTx — rejects async callbacks (pure, tested)
│   ├── boot.ts                   # launch: readable? → snapshot → migrate (FKs off) → seed
│   ├── migrate.ts                # FK-safe migration wrapper, pending detection (pure, tested)
│   ├── seed.ts · seedCore.ts     # system categories by fixed sys: uid, versioned
│   ├── files.ts                  # SQLite/, snapshots/, legacy/, unreadable/ locations
│   ├── encryptedCopy.ts          # passphrase-encrypted backup files (SQLCipher)
│   ├── legacyEncryption.ts       # one-time conversion of pre-2026-09-14 keyed databases
│   └── migrations/               # generated by drizzle-kit — NEVER hand-edited (custom SQL via --custom)
├── features/
│   ├── transactions/  { queries.ts  components/  schema.ts }
│   ├── budgets/       { queries.ts  components/  schema.ts }
│   ├── analytics/     { sql.ts  queries.ts  period.ts  components/ }  ← the SQL lives here (builders take the db, so tests run the shipped SQL)
│   ├── tracker/       { queries.ts  renewal.ts  notifications.ts }
│   ├── groups/        { split.ts  debts.ts  balances.ts  draft.ts  sql.ts  writes.ts  queries.ts  mutations.ts  wording.ts  components/ }
│   ├── dashboard/     { queries.ts  components/ }
│   ├── sheets/        { queries.ts  parse.ts  map.ts  normalize.ts  export.ts  refresh.ts  link.ts }
│   └── backup/        { export.ts  restore.ts  validate.ts }
├── components/   ui/ · charts/ · layout/
├── lib/          money.ts · dates.ts · today.ts · theme.ts · db/ (useDbQuery, changeHub, safeWrite) · notifications/
├── plugins/      withBackupRules.js — auto-backup exclusions (config plugin)
├── widget/
├── docs/         diagrams/*.mmd · wireframes/*.excalidraw
├── pcref/CLAUDE.md               # web app design reference (read-only)
├── drizzle.config.ts
├── app.config.ts                 # plugins, permissions, allowBackup + backup rules, useSQLCipher (backup files)
├── eas.json
├── CLAUDE.md                     # this file
└── TASKS.md
```

---

## Key Conventions (Never Break)

1. **No network. Ever.** No HTTP client, no fetch, no API base URL. The release build declares no `INTERNET` permission. If a feature seems to need the network, it is the wrong feature.
2. **`amount_paise` is an INTEGER everywhere** — schema, queries, sums, import parser. SQLite has no decimal type; `Numeric(12,2)` silently becomes `REAL` and floats lose money as one-paise drift you notice months later. A rupee value becomes a string **exactly once**, in `formatINR()`, at render.
3. **Dates are `TEXT` in `YYYY-MM-DD`.** Sorts lexicographically, groups with `substr(date,1,7)`, unambiguous across timezones. SQLite has no date type either.
4. **SQL lives only in `features/*/queries.ts`.** Screens call typed functions (`useMonthlyTrend(24)`, `useTransactions(filters)`) and never see a table name. This is the boundary the API used to give you for free — you have to draw it yourself now.
5. **Never `SELECT` rows you intend to count, sum or group.** Aggregate in SQL. Pulling 50k rows across the bridge to `reduce()` costs hundreds of ms on the UI thread.
6. **Read with `useDbQuery` + `readDb`, and list every base table.** `useDbQuery(run, tables, deps, fallback)` re-runs when any listed table changes — so a query that JOINs `categories` must list it, and a query over a view must list the view's base tables (change events never name views). Never import `useLiveQuery`. Subscribe per screen, never one app-wide store.
7. **Never hand-edit a generated migration.** Edit `db/schema.ts`, run `npx drizzle-kit generate`. Data changes and things drizzle-kit emits wrongly go in a **custom** migration (`drizzle-kit generate --custom`). Read the generated SQL every time — drizzle-kit 0.31 has three known bugs (see Gotchas) — and run `db/__tests__/migrations.test.ts`. Migrations run on phones you cannot inspect — a migration that throws is a permanently broken install.
8. **Test every migration against a copy of a real, populated database.** Empty tables hide every constraint violation.
9. **Imports point downward only.** `app/` → `features/` → `components/` → `lib/`. A feature never imports a sibling; shared things move down. Enforce with an ESLint boundaries rule.
10. **Routes are thin.** `app/` files compose a feature and nothing else — no queries, no business logic.
11. **Currency formatting goes through `formatINR()`.** Never call `toLocaleString("en-IN")` directly — assert ICU once at boot, keep a manual grouping fallback (see Gotchas).
12. **Three screen states, not five:** Content · Empty · Error. There is no loading state worth *designing* — but reads are async, so a query is `'pending'` for a few ms on first load. Render nothing new while pending, and show **Empty only when `status === 'ok'`**. The one real gate is `bootDatabase()` at launch, behind the splash.
13. **Soft delete via `deleted_at`** — powers undo on swipe-delete and undo on a whole import batch. Every query filters `.is(null)`.
14. **Notification channels must exist before posting.** Android silently drops posts to a channel that was never created. Three: `Renewals`, `Budget alerts`, `Backup`.
15. **Reschedule reminders wholesale**, never diff. Cancel-all-then-schedule after any relevant write.
16. **Restore backs up before it overwrites.** Validate schema version and row counts first, snapshot the current DB, then swap. A user restoring the wrong file must not lose the right one.
17. **One diagram per decision, not per file.** `docs/diagrams/NN-topic.mmd`.
18. **Toasts via `sonner-native`**, mirroring the web pattern: modals stay open on error because the hook already toasted (writes return `WriteResult` via `safeWrite`).
19. **Multi-statement writes go through `writeTx`, and its callback is synchronous.** Drizzle's expo driver commits when the callback *returns*; an `await` inside commits early and runs the rest outside the transaction. `runWriteTx` throws (and rolls back) if the callback returns a Promise.

---

## Data Model

Ported from the web app's SQLAlchemy models, multi-user parts removed, two additions.

| Change from the server model | Why |
|---|---|
| **No `user_id` anywhere** | One database, one person. Every `WHERE user_id = …` disappears; indexes get simpler |
| **Amounts as `INTEGER` paise** | SQLite has no decimal type. Integers are exact, sort correctly, sum without error |
| **Dates as `TEXT` `YYYY-MM-DD`** | Sorts lexicographically, groups by `substr()`, timezone-safe |
| **`deleted_at` kept** | Powers undo on swipe-delete and undo on an import batch |
| **New: `import_batches`** | Every import is one undoable unit, with source filename and row counts |
| **New: `app_meta`** | Schema version, `last_backup_at`, seed marker. One row, read at launch |
| **`categories.kind`** *(decided 2026-09-14, lands in migration 0001)* | `'expense' \| 'income' \| 'both'`, default `'both'`. The form offers only categories matching the chosen type. Seeded: `Salary`, `Other Income` → income; `Investments`, `Gifts & Donations`, `Miscellaneous` → both; the rest → expense |
| **`is_recurring` removed** *(decided 2026-09-14, migration 0001)* | The flag did nothing and overlapped the Tracker. Phase 4 may add a nullable `subscription_id` on `transactions` — an additive, safe migration |

```ts
// db/schema.ts — abbreviated
export const transactions = sqliteTable("transactions", {
  id:            integer("id").primaryKey({ autoIncrement: true }),
  type:          text("type", { enum: ["expense", "income"] }).notNull(),
  amountPaise:   integer("amount_paise").notNull(),   // ← never a float
  date:          text("date").notNull(),              // YYYY-MM-DD
  note:          text("note"),
  categoryId:    integer("category_id").references(() => categories.id),
  importBatchId: integer("import_batch_id").references(() => importBatches.id),
  deletedAt:     text("deleted_at"),
  createdAt:     text("created_at").notNull(),
}, (t) => ({
  byDate:     index("tx_date_idx").on(t.date, t.deletedAt),
  byCategory: index("tx_cat_idx").on(t.categoryId, t.date),
  byBatch:    index("tx_batch_idx").on(t.importBatchId),
}));
```

Tables: `categories` · `transactions` · `budgets` · `subscriptions` · `import_batches` · `app_meta` —
plus Groups (migration 0007) and, in Phase 6, `sheets` · `sheet_columns` · `sheet_rows` · `sheet_links` ·
`sheet_row_links` and the `money_rows` view (see *Sheets*).

### Groups — split expenses *(built 2026-09-15, TASKS "Groups")*

**Separate from the ledger:** nothing in Groups creates a transaction or moves a budget, Home or
Insights figure. Friends are typed names (no contacts permission).

| Table | Holds |
|---|---|
| `people` | Friends **and you** — exactly one `is_self` row, uid `sys:self`, seeded by custom migration 0008 |
| `split_groups` | name, icon, `simplify_debts`; `direct_person_id` set on the **hidden group behind a 1:1 friendship**, so friend expenses use the same balance code |
| `group_members` | Soft-removable, only once that member's balance in the group is 0 |
| `split_expenses` + `split_expense_payers` + `split_expense_shares` | Payers and shares each sum to the amount **exactly**; shares keep the typed `input` (basis points / share units / paise) so edits rebuild |
| `split_debts` | **Derived** pairwise debts, rewritten with its expense in one `writeTx` |
| `settlements` | A payment between two members |

- **Balances are never stored.** `netsQuery` sums paid − owed + sent − received per (group, person);
  JS runs `simplifyDebts` over those rows (pairing pre-pass, then two max-heaps, ≤ n − 1 payments) or
  `pairwiseNet` when simplify is off. Money core: `lib/heap.ts`, `features/groups/{split,debts,balances,draft}.ts`.
- **Gotcha:** in a single-table Drizzle select, `${table.column}` renders unqualified — inside a
  correlated subquery SQLite binds it to the inner table. Write `split_groups.id` literally there.
- **Gotcha:** through `readDb` (sqlite-proxy) a raw `db.all(sql\`…\`)` returns value arrays with no
  field names. Wrap raw SQL as `select({...}).from(sql\`(…) x\`)`.
- Diagram: `docs/diagrams/01-debt-simplification.mmd`.

---

## Analytics in SQL

The largest genuinely new engineering task. `/api/v1/analytics` returned finished aggregates;
now those queries run on the phone.

| Screen figure | Endpoint it replaces | Local approach |
|---|---|---|
| 12/24-month trend | `GET /analytics/trend` | `GROUP BY substr(date,1,7)`, `SUM` split by type via `CASE`. ≤24 rows cross into JS |
| Category donut | `GET /analytics/by-category` | `GROUP BY category_id` over a month window, joined to `categories` |
| Summary cards | `GET /transactions/summary` | One query returning income, expense, net for the window |
| Stat cards | computed in the endpoint | avg/day via `SUM / julianday` diff; biggest expense via `ORDER BY … LIMIT 1` |
| Budget progress | `GET /budgets` enriched | `GROUP BY category_id` over each budget's reset-day cycle window (computed in TS, passed as bound params) |
| Upcoming renewals | `GET /subscriptions/upcoming` | Port `_enrich` to TS — advance `anchor_date` by cycle until ≥ today, month-end clamped |

```sql
-- features/analytics/queries.ts — the trend query, the one that matters most
SELECT
  substr(date, 1, 7)                                        AS month,
  SUM(CASE WHEN type = 'income'  THEN amount_paise ELSE 0 END) AS income_paise,
  SUM(CASE WHEN type = 'expense' THEN amount_paise ELSE 0 END) AS expense_paise
FROM transactions
WHERE deleted_at IS NULL
  AND date >= ?
GROUP BY month
ORDER BY month;
-- Uses tx_date_idx. 50,000 transactions aggregate in single-digit ms;
-- JS never sees more than two dozen objects.
```

**Verify with real volume early.** In Phase 1, seed 50,000 synthetic transactions across four
years and time every analytics query on the actual phone. Finding a slow query in Phase 1 is a
five-minute fix; finding it in Phase 5 is a redesign.

---

## Navigation / UI Architecture

**Four tabs + one action.** The web sidebar carries seven destinations; a tab bar carries four.

```
┌────────── MODAL LAYER (over any tab) ──────────────────────────┐
│  Add/edit transaction · Budget · Subscription · Filters sheet  │
└────────────────────────────────────────────────────────────────┘
   Home          Transactions      Insights        More
   ├ summary     ├ FlashList       ├ trend area    ├ Budgets
   ├ insight     ├ month headers   ├ scrubber      ├ Tracker
   ├ trend       ├ swipe delete    ├ donut         ├ Sheets
   ├ budgets →   ├ long-press sel. ├ month sel.    ├ Backup & restore
   ├ renewals →  ├ filter chips    └ stat cards    ├ Settings
   └ recent      └ search (LIKE)                   └ Groups & friends

[ Home ] [ Transactions ] ( + ) [ Insights ] [ More ]
                            tap: add · hold: import
```

- **Budgets/Tracker are under More but one tap from their Home cards** — that's how you actually arrive at them.
- **Backup & restore is a first-class screen**, not a settings sub-page. On a standalone app it earns that.
- **The centre FAB is an action, not a tab.** A sheet dismisses back to where you were.
- **The ledger pages by keyset, not by a growing `LIMIT`** *(decided 2026-09-14)*. Page 1 is live; older pages load with `WHERE (date, id) < (?, ?) ORDER BY date DESC, id DESC LIMIT 40` and refresh only when a change touches them. A growing window re-sends every loaded row on each write. Implemented in TASKS2 batch 4A.
- **Dark-only in v1** *(decided 2026-09-14)*. The native shell (`userInterfaceStyle`, splash) is dark too. Every colour comes from `lib/theme.ts` tokens so the Phase 9 light-theme toggle is a token swap, not a hunt for literals.
- **Bottom sheets** for anything short. **Full-screen modals** for transaction and subscription forms.
- **First-run onboarding matters more here** — a new install is genuinely blank. Offer three doors: add first transaction, import a sheet, restore a backup.

---

## Sheets — Imported and Linked Spreadsheets

> **Decided 2026-09-14.** Many people already track their money in spreadsheets. SpendWise does
> not swallow those files into its ledger — it keeps each one as its own **sheet**: a workspace
> the user views, edits and exports separately. Optionally, a sheet can be **linked** so that
> transactions added in the app appear in it automatically, in that sheet's own column order and
> format. Phases 6A and 6B in [`TASKS.md`](TASKS.md).

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

## Backup & Restore

Not a nice-to-have. The phone holds the only copy of data typed in by hand over years.
All three layers ship — each covers a case the others miss.

| Layer | Covers | Limits |
|---|---|---|
| **1 · Manual export** (`.db` or `.json` via share sheet) | The phone you lose, the app you uninstall | Only happens if the user remembers |
| **2 · Android auto-backup** (`allowBackup: true` + backup rules) | The phone you upgrade | 25 MB cap, silent, not guaranteed to run. Only works because the main DB is unkeyed — a Keystore-keyed file restores unopenable. Rules exclude `-wal`/`-shm` and include `files/sheets/`; the WAL is checkpointed when the app backgrounds |
| **3 · Monthly reminder** (local notification) | Makes layer 1 actually happen | Fires only when `last_backup_at` > 30 days old |

| Decision | Choice | Reasoning |
|---|---|---|
| Export format | Both `.db` and `.json` | `.db` is exact byte-for-byte. `.json` is readable and future-proof. Default `.db` |
| Restore safety | Validate, then snapshot current DB before overwriting | The most destructive action in the app. Restoring the wrong file must not lose the right one |
| On-device encryption | None beyond Android's own *(decided 2026-09-14)* | FBE + app sandbox cover the realistic threats; a device-bound key breaks auto-backup restore and adds a lock-yourself-out failure mode |
| Exported file | Optional passphrase on `.db`, via SQLCipher `ATTACH … KEY` + `sqlcipher_export` | The export is the copy that leaves the device, so that is where encryption earns its cost. Restore attaches the file with the passphrase and exports into a plain DB. A forgotten passphrase means that backup is gone — say so in the UI |
| Nudge cadence | Monthly, only if stale | A reminder firing the day after you backed up is how notifications get disabled |

> ⚠️ **Test this like it matters.** Every other feature failing is an annoyance. Backup failing is
> permanent loss of hand-entered data. Phase 9 must include a real drill: populate → export →
> **uninstall completely** → reinstall → restore → verify row counts and totals match exactly.
> On the actual phone. Again before every release that touches the schema.

---

## Native Layer

### Local reminders (`expo-notifications`)
- **Renewals** — recompute upcoming subs after any write, cancel-all-and-reschedule. Never diff.
- **Budget alerts** — crossing 75% and 100% of a category limit, evaluated after each transaction write.
- **Backup nudge** — monthly, only when last export is >30 days old.
- Fire at 09:00 local with an **inexact** alarm. `SCHEDULE_EXACT_ALARM` is Play-scrutinised and unwarranted.
- Android 13+ needs runtime `POST_NOTIFICATIONS` — ask **in context** on first subscription save, never at launch.
- Three channels: `Renewals`, `Budget alerts`, `Backup`.

### Quick add: FAB + home widget
- `react-native-android-widget` renders to Android **RemoteViews** — no JS runtime, no state, no fetch.
- The widget reads a **snapshot** written to MMKV after each write: today's spend, month total, nearest renewal.
- Tapping deep-links via `expo-linking` into the add-transaction modal.

### Permissions — exactly two
`POST_NOTIFICATIONS` and `RECEIVE_BOOT_COMPLETED`. **No `INTERNET`.**
The Play listing can honestly say the app cannot transmit your financial data anywhere, because
Android itself won't let it. The Data Safety form becomes nearly empty.
*Sentry requires `INTERNET`* — ship it in the dev profile only and keep the release build provably offline.

---

## How to Run (Local Dev)

### Once, at the start of Phase 0
Go straight to a **development build**. Expo Go cannot load SQLCipher, MMKV, Skia or the widget
plugin — and with SQLite at the centre of this app, Expo Go is useless almost immediately.

```bash
# On the phone: Settings → Developer options → Wireless debugging → on
# Tap "Pair device with pairing code", read off the ip:port + code

adb pair 192.168.1.42:37105        # enter the 6-digit code
adb connect 192.168.1.42:41233     # the OTHER port, from the main screen
adb devices                        # expect: 192.168.1.42:41233  device

npx eas build --profile development --platform android
# ...install the APK from the link EAS prints. Or, with a local Android SDK:
npm run android                    # sets SPENDWISE_DEV_NETWORK=1 → dev build keeps INTERNET
```

**`INTERNET` is opt-in (fail-closed).** Only the EAS development profile or
`SPENDWISE_DEV_NETWORK=1` grants it. Use `npm run prebuild:dev` (not `npx expo prebuild`)
before a local debug build, or Metro cannot reach the phone. A plain prebuild — what a
release build uses — strips it.

### Every day after
```bash
npx expo start --dev-client        # scan the QR, or press "a"
adb shell input keyevent 82        # dev menu (or shake the device)
npx expo start --dev-client --clear  # after a dependency change
npx expo start --dev-client --tunnel # hostile Wi-Fi / client isolation
```

### Inspecting the database — the primary debugging tool
With no API to curl and no network tab to read, the database **is** the system.

The main database is unkeyed (decision F0-1), so the live file is directly readable. A database
from an older build that was SQLCipher-keyed is converted once at boot (`db/legacyEncryption.ts`).

```bash
# 1. Send SpendWise to the background first — that checkpoints the WAL into the main file,
#    so the single-file pull below is complete.
npm run db:pull            # copies files/SQLite/spendwise.db → ./local.db (gitignored)
npm run db:studio          # Drizzle Studio via drizzle.studio.config.ts
npx drizzle-kit generate   # regenerate migrations after editing db/schema.ts
```

The dev harness (More → Dev harness) seeds 50k rows, benchmarks the shipped query builders
(median time + TEMP B-TREE / SCAN flags), and round-trips a passphrase-encrypted backup file.

### The shortcut worth knowing
`eas update --branch development` pushes new JavaScript to the installed dev build in ~30s.
You only need a new **native** build when adding a package with native code or changing
`app.config.ts`. Note: **a schema change is not a native change** — migrations are JS-bundled
and ship over the air too.

---

## Gotchas

- **drizzle-kit 0.31 generates three kinds of broken SQLite migration — read every generated file.** All three were caught by `db/__tests__/migrations.test.ts`, which applies migrations to a populated database through drizzle's real migrator:
  1. **Adding a column and rebuilding a table in one generate** copies the *new* column from the *old* table (`no such column`). Split it: rebuild first, add columns in a later generate.
  2. **A table rebuild copies VIRTUAL generated columns** in its INSERT … SELECT, which SQLite rejects. `transactions.month` is therefore added after the last rebuild (0005). A future rebuild of `transactions` must drop and re-add it.
  3. **A partial expression index** (``uniqueIndex().on(sql`lower(name)`).where(…)``) is emitted with the expression in backticks, i.e. as a column name. `cat_name_unique` lives in custom migration 0006 instead.
- **Never migrate with foreign keys on.** Drizzle runs all pending migrations in ONE transaction, where the generated `PRAGMA foreign_keys=OFF` is ignored — so rebuilding `categories` cascade-deletes every budget and uncategorises every transaction. `db/boot.ts` turns FKs off *before* the transaction (`migrateWithForeignKeysOff`) and runs `foreign_key_check` after. A test proves the data loss without it.
- **Screens read through `db/read.ts`, never `db` from `db/client.ts`.** The expo Drizzle driver executes synchronously on the JS thread even when awaited. `db` is for writes inside `writeTx` and tiny point reads only.

- **`toLocaleString("en-IN")` on Hermes** — works on Android (platform ICU), but fails *silently* to `en-US` grouping where ICU is unavailable. `₹124,500.00` instead of `₹1,24,500.00` ships unnoticed. Assert once at boot, keep a manual fallback, unit-test both.
- **Floats destroy money.** SQLite stores `REAL` for anything decimal-shaped. Integer paise everywhere; a lint rule against `parseFloat` outside `lib/money.ts`.
- **Broad live-query subscriptions** make every keystroke re-run every query. Watch for it in Phase 3 when Home gains six widgets at once.
- **Migrations on an empty DB prove nothing.** Empty tables hide every constraint violation.
- **RN flexbox differs from CSS**: `flexDirection` defaults to `column`. **No style cascade** — text styling doesn't inherit through a `View`. Percentage sizing works in fewer places.
- **NativeWind does not port** `hover:`, `group-hover:`, `focus-within:`, `position: fixed`, z-index stacking, or CSS grid beyond the simplest cases.
- **Three meanings of "back"** — Android back gesture vs sheet dismissal vs the import wizard's step-back. They must not fight.
- **Notifications die quietly** after a reboot or force-stop. Test both paths explicitly on device.
- **A database keyed from the Android Keystore cannot survive auto-backup.** Keystore keys never leave the device, so the restored file opens on the new phone as "file is not a database" (and `expo-secure-store` throws `DecryptException`). This is why the main DB is unkeyed since 2026-09-14. If on-device encryption ever returns, the key must be wrapped by something the user can bring to a new phone (a recovery code), never by the Keystore alone.
- **Never `await` inside `db.transaction()`.** Drizzle's expo driver is synchronous: it commits when the callback *returns*, and an async callback returns at its first `await` — the rest runs outside the transaction. Use the `writeTx` helper (TASKS2 batch 1A).
- **Local native builds OOM on this machine at the default ABI set.** Gradle compiles `expo-modules-core` C++ for all four ABIs in parallel; on 8 GB RAM clang is killed mid-compile and reports `clang frontend command failed due to signal`, which reads like a compiler bug but is memory pressure. Build arm64 only: `npm run build:local-apk` (or `-PreactNativeArchitectures=arm64-v8a`). EAS cloud builds are unaffected.
- **Even arm64-only, the Kotlin daemon gets OOM-killed** if anything else is running (Metro especially). Symptom: `e: Daemon compilation failed: Connection to the Kotlin daemon has been unexpectedly lost`, surfacing as a vague "Compilation error" in `expo-modules-core:compileDebugKotlin`. Fix: `-Pkotlin.compiler.execution.strategy=in-process --max-workers=2` (baked into `npm run build:local-apk`), and **never start Metro until the APK is built**.
- **Never pipe Gradle through `tail`.** A shell pipeline returns the *last* command's exit code, so a failed build reports exit 0. Redirect to a log and grep for `BUILD SUCCESSFUL` / `BUILD FAILED`.
- **Verify permissions against the built APK, not the config and not the manifest.** Three layers can each lie to you, and this project hit all three: (1) `npx expo config` showed `INTERNET` absent while the generated manifest still had it; (2) the generated manifest is only regenerated by `expo prebuild` — an existing `android/` folder silently keeps the OLD policy, so an APK built after editing `app.config.ts` can still ship permissions you already blocked; (3) library manifests contribute permissions you never declared. The only authoritative check is `aapt2 dump permissions app-*.apk` on the artifact you are about to ship. **Always `rm -rf android` before a verification prebuild.**
- **`npx expo config` is not the merged Android manifest.** It showed `INTERNET` absent under the production profile while the generated manifest still contained it. Verify every permission claim against `android/app/src/main/AndroidManifest.xml` after a prebuild, and use `android/app/build/outputs/logs/manifest-merger-debug-report.txt` to find which library contributed a permission you never declared.

---

## Phase Map

Full detail with checkboxes in [`TASKS.md`](TASKS.md) and the [live plan](https://claude.ai/code/artifact/cb2c502a-0993-439c-8abf-90b4524cb707).

| Phase | Name | Est. |
|---|---|---|
| 0 | Foundations | 1–2 d |
| 1 | **Database foundation** | 3–4 d |
| 2 | Transactions | 4–5 d |
| 3 | Home dashboard | 3 d |
| 4 | Budgets & Tracker | 4 d |
| 5 | Analytics | 3 d |
| 6A | Sheets: import and workspaces | 7–8 d |
| 6B | Linked sheets | 4–5 d |
| 7 | **Backup & restore** | 3–4 d |
| 8 | Native layer | 3–4 d |
| 9 | Hardening & Play Store | 4–5 d |
| G | Groups — split expenses (pulled forward from v1.1) | 6.5 d |

**Total: ~31–40 working days solo** (6–8 weeks of evenings and weekends). Phase 6 grew on
2026-09-14 from a one-way import into sheets + linking; auth, HTTP, caching and offline queueing
still account for everything the standalone design removed.

Phase 1 is the one to over-invest in: schema, migrations, encryption and the query boundary are
what everything else sits on, and all four are expensive to change later.

---

## Deferred, With Reasons

| Item | Why | Cost to add later |
|---|---|---|
| **Multi-device sync** | No server by design | A real project, not a switch. The schema allows it: add a UUID column and `updated_at` per row (both additive), and only `features/*/queries.ts` changes |
| **Precomputed rollup tables** | Premature | Only if a real ledger measurably janks. Measure before believing it |
| **Multi-currency** | Web app is INR-only too | Follows the web app's lead |
| **Live Google Sheets sync** | Needs the Sheets API, i.e. `INTERNET` | Breaks convention #1. `.xlsx` files stored in Drive already work — Drive's own app syncs them |
| **Copy sheet rows into the ledger** | Not chosen for v1 — sheets use "include in totals" | Cheap later: the dedupe hash and `import_batches` already exist |
| **Bank SMS auto-capture** | `READ_SMS` is incompatible with Play | Would also break the "no INTERNET, no data collected" story |

---

## Reference Docs
- [`TASKS.md`](TASKS.md) — phase + task tracker, tick as you go
- [`pcref/CLAUDE.md`](pcref/CLAUDE.md) — the web app's context. **Design and domain reference only.** Its API surfaces describe a backend this app does not call
- [Live build plan](https://claude.ai/code/artifact/cb2c502a-0993-439c-8abf-90b4524cb707) — diagrams, rationale, objections-and-answers, risk register
- `docs/diagrams/*.mmd` — low-level mechanism diagrams (created as phases land)
