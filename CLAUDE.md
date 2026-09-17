# SpendWise Android — Project Context

> A **standalone, offline-only** Android expense tracker. Every rupee lives in a SQLite database on the
> phone. **There is no server, no account and no network call.** It shares the SpendWise web app's
> *design* and *domain model*, and nothing else: no shared code, API or database.
>
> | Doc | What it is for |
> |---|---|
> | [`TASKS.md`](TASKS.md) | **The only live tracker**: status, next work in order, device checks, decisions |
> | [`plan.md`](plan.md) | **Task cards** for every remaining item: problem with file/line, fix steps, tests, done-when |
> | [`docs/architecture-review-2026-09-17.md`](docs/architecture-review-2026-09-17.md) | Known bugs (`B1`…), architecture problems (`A1`…) and the **target architecture** |
> | [`docs/design/`](docs/design/) | Designs for unbuilt phases: Sheets (6A/6B), Backup & native layer (7/8) |
> | [`docs/run-on-phone.md`](docs/run-on-phone.md) | Getting a dev build running on the phone, with troubleshooting |
> | [`docs/history/`](docs/history/) | Archived trackers: the *why* behind code that looks unusual |
> | [`pcref/CLAUDE.md`](pcref/CLAUDE.md) | The web app's context. **Design and domain reference only.** Never call its API |
>
> *Last checked against the code: 2026-09-17 (`7f69c5c` + the uncommitted F5 batch).*

---

## ⚠️ Read this first

- **Expo has changed.** Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before
  writing code against an Expo or React Native API. Answers from memory are usually for an older SDK.
- **This app makes zero network requests.** Anything that implies `fetch`, Axios, a base URL, a JWT or
  a token refresh is wrong, and predates the 2026-09-11 decision. The release build does not even declare
  `INTERNET`.
- **Current phase: refactoring (R0–R4 in TASKS.md) before Backup (7) and Sheets (6A).** New code goes in the
  **target layout** described in *Architecture*, even where older features have not moved yet.
- **Tests are the safety net.** `npx tsc --noEmit` and `npx jest` (478 tests; ~5 min on this machine — the migration tests build 50k-row fixtures) must stay green.
  There is no ESLint yet (R2), so the conventions below are enforced by review.

## System

| | |
|---|---|
| OS | Windows 10. PowerShell 5.1 default; Git Bash available |
| Project root | `D:\Projects\SpendWise_Android` |
| Node | 22.x |
| Test device | One physical Android phone over wireless debugging. No emulator |
| Git | Default branch `main` (work has been on `master`; see R0) |

---

## The locked decisions

| Decision | Choice | Consequence |
|---|---|---|
| **Architecture** | Standalone, zero network | No auth, HTTP, server cache or offline queue. Only files cross the boundary: spreadsheets in, backups out |
| **Storage** | SQLite (`expo-sqlite`) + Drizzle ORM | Typed queries, generated migrations. `useDbQuery` + `readDb` replace any server-state library |
| **Analytics** | Aggregate in SQL on the device | `GROUP BY` in SQLite; never `SELECT` rows you intend to sum |
| **Durability** | Manual export **+** Android auto-backup **+** monthly reminder | All three must ship (Phases 7/8). Today only auto-backup rules exist, **so a factory reset loses everything** |
| **Encryption** *(amended 2026-09-14)* | Main DB **unkeyed**; SQLCipher only for passphrase-encrypted **backup files** | A Keystore-keyed DB restored by auto-backup could not be opened. FBE + the sandbox protect data at rest |

---

## Stack (as installed)

| Layer | Choice | Notes |
|---|---|---|
| Runtime | `expo@57`, React Native 0.86 (New Architecture, Hermes), React 19.2 | Install with `npx expo install`; never hand-pin RN/Reanimated/expo-router |
| Language | TypeScript 6.0, `strict` + `noUncheckedIndexedAccess` | Types flow from `db/schema.ts` |
| Routing | `expo-router` (typed routes) | File-based |
| Database | `expo-sqlite` (SQLCipher build) + `drizzle-orm` 0.45 / `drizzle-kit` 0.31 | Migrations bundled via `babel-plugin-inline-import`, so a schema change ships over the air |
| Reads | `useDbQuery` (`lib/db`) over `readDb` (`db/read.ts`) | Native worker thread, coalesced per table, paused while unfocused. **Not** Drizzle's `useLiveQuery` |
| Styling | `nativewind` v4 + tokens in `lib/theme.ts` | Light + dark palettes; System/Light/Dark in Settings. `global.css` is **generated** (`npm run theme:css`, test-enforced) |
| State | `zustand` | Ledger filters, today's date, theme only |
| Preferences | `react-native-mmkv` | Theme preference (synchronous read at startup). **Not for records** |
| Forms | `react-hook-form` + `zod` | Amounts stay strings until `parseAmountToPaise` |
| Lists | `@shopify/flash-list` v2 | |
| Charts | `react-native-svg` + Reanimated/worklets | Pure maths in `components/charts/geometry.ts`. No Skia |
| Motion/gestures | `react-native-reanimated` 4, `react-native-gesture-handler` | `useMotion()` honours "Remove animations" |
| Toasts · Icons · Font | `sonner-native` · `lucide-react-native` · Plus Jakarta Sans | Same as the web app |
| Files | `expo-file-system`, `expo-sharing` | CSV export, boot recovery sharing |
| Declared, not yet used | `expo-notifications` (config plugin only) | Phase 8 |
| Legacy, to remove | `expo-secure-store` | Only for `db/legacyEncryption.ts` (R6) |
| Unused (remove in R0) | `date-fns`, `@gorhom/bottom-sheet`, `expo-crypto`, `expo-document-picker`, `expo-local-authentication` | |
| Planned | SheetJS (vendor tarball) + papaparse + ExcelJS (6A, after a spike) · `react-native-android-widget` (8) | Not installed |
| Tests | Jest 30 + ts-jest, Node environment, `better-sqlite3` running the real migrations | No component tests |

**Crash reporting:** none in release builds. Sentry is ruled out (it needs `INTERNET`); a local crash log is planned (R6).

---

## Architecture

### Layers and import direction

```
app/  →  features/  →  components/  ·  data/*  →  db/  →  lib/
routes   screens,       presentational  shared    SQLite   pure utilities
         feature data   UI              queries*  runtime  (+ lib/db runtime)
```
`*data/` is the **target** shared layer (R3) and does not exist yet. Rules:
1. A feature never imports another feature. Something two features need moves **down** (`data/`, `components/`, `lib/`).
2. `components/` and `lib/` never import `features/`. `lib/` stays free of React Native where it holds pure logic, so Node tests can load it.
3. `app/` imports `db/` only in `app/_layout.tsx` (boot). *Today `app/settings/index.tsx` and `app/dev.tsx` also do; R4 moves them.*

### Repository layout (as it is today)

```
app/                         routes. Thin ones render a feature screen; the four forms/sheets in (modals)/ are
  _layout.tsx                  still full screens (R4 moves them)
  (tabs)/                    index (Home) · transactions · add (FAB placeholder) · insights · more
  (modals)/                  transaction · budget · subscription · filters (formSheet) · category · group ·
                             friend · split-expense · settle-up · balances (formSheet)
  budgets/ tracker/ categories/ groups/[id]/{index,totals} friends/[id] settings/{index,recently-deleted}
  sheets/ backup/            placeholders for Phases 6A and 7
  dev.tsx                    dev harness (redirects away when !__DEV__)
features/
  transactions/              queries.ts (hooks + builders + writes) · filters.ts · pages.ts (keyset maths) ·
                             filterStore.ts · schema.ts · csv.ts · export.ts · components/ (Ledger, RecentlyDeleted…)
  dashboard/                 queries.ts · components/ (Dashboard, TrendChart card)
  analytics/                 sql.ts (builders take db) · queries.ts (hooks) · period.ts (pure) · components/
  budgets/                   queries.ts · progress.ts (pure) · dial.ts (pure) · schema.ts · components/
  tracker/                   queries.ts · renewal.ts (pure) · schema.ts · components/
  categories/                queries.ts · mutations.ts (writes take db) · components/
  groups/                    split.ts · debts.ts · balances.ts · draft.ts · wording.ts (pure) · sql.ts · writes.ts
                             (take db) · queries.ts (hooks) · mutations.ts (safeWrite) · components/
  boot/components/BootFailure.tsx   settings/components/Appearance.tsx
  backup/ import/            empty folders (remove in R0)
components/
  ui/                        Card, PressableScale, Segmented, CategoryIcon, LedgerRow, AnimatedAmount,
                             DatePickerSheet, EmptyState, Swap, AmountDial, Avatar, *Card presentational pieces
  charts/                    AreaChart (scrubber) · Donut · MiniDonut · TrendChart · geometry.ts (pure, tested)
  layout/                    Screen (+ TAB_BAR_CLEARANCE) · TabBar (glass, droplet) · ThemeProvider · Welcome · glass
db/
  schema.ts                  THE source of truth for every table and type
  connection.ts              the one reopenable connection (proxy), pragmas, WAL checkpoint
  client.ts                  sync Drizzle handle `db`: writes + tiny point reads; `writeTx`
  read.ts                    async `readDb` (sqlite-proxy on the native thread): every screen read
  tx.ts                      runWriteTx: refuses async callbacks (pure, tested)
  boot.ts                    readable? → pragmas → snapshot → migrate (FKs off) → seed → purge
  migrate.ts · seed.ts · seedCore.ts · retention.ts · files.ts
  encryptedCopy.ts           passphrase-encrypted backup copies (SQLCipher)
  legacyEncryption.ts        one-time conversion of pre-2026-09-14 keyed databases (remove in R6)
  devSeed.ts · benchmark.ts  dev harness tools
  migrations/                generated by drizzle-kit. NEVER hand-edit; custom SQL via `--custom`
lib/
  money.ts dates.ts calendar.ts today.ts heap.ts identity.ts insight.ts renewals.ts dedupe.ts icons.ts
  categoryColor.ts theme.ts themeCss.ts themeStore.ts motion.ts
  db/                        useDbQuery · changeHub · latestOnly · safeWrite · errors (UserFacingError)
plugins/withBackupRules.js   auto-backup exclusions (exclude-only; tested)
scripts/                     with-dev-network.js (INTERNET opt-in) · gen-theme-css.ts · verify-apk.sh
docs/                        see the table at the top · diagrams/01-debt-simplification.mmd
```

### Target layout (R3/R4): use it for new code

```
features/<name>/
  index.ts            public surface
  screens/            full screens and modal screens (routes render these)
  components/         feature-private UI
  data/sql.ts         read builders that TAKE `db`, so tests run the shipped SQL
  data/writes.ts      pure write cores that take a sync `db`, use writeTx, throw UserFacingError
  data/hooks.ts       useDbQuery hooks binding sql.ts to readDb
  data/actions.ts     safeWrite-wrapped writes bound to the app db: what screens call
  domain/             pure logic (no db, no React Native)
  schema.ts           zod form schemas
data/                 shared queries two or more features need: ledger aggregates, categories, app_meta
components/ui/        Text (variants), Button, IconButton, Chip, Field, FormModal + useSubmitOnce, Section…
db/types.ts           one SyncDb / AnyDb type
```
`features/analytics` and `features/groups` are closest to this today; copy them, not `transactions`.

---

## Conventions (never break)

1. **No network. Ever.** No HTTP client, `fetch` or base URL. `INTERNET` is opt-in for dev builds only (`scripts/with-dev-network.js`, EAS development profile) and blocked everywhere else.
2. **Money is INTEGER paise everywhere**: schema, queries, sums, parsing. Text becomes paise via `parseAmountToPaise` (never through a float); paise become text **once**, via `formatINR` / `formatINRCompact` / `formatCount`. No `parseFloat` or `toLocaleString` outside `lib/money.ts`.
3. **Dates are `TEXT 'YYYY-MM-DD'`**; timestamps are `TEXT` ISO (`nowISO()`, identical to the column default). Month aggregates use the generated `transactions.month` column.
4. **SQL lives in a feature's data layer (or `data/`), never in components or routes.** Screens call typed hooks and functions.
5. **Aggregate in SQL.** Never pull rows into JS to count, sum or group. Bound every date range on **both** ends.
6. **Read with `useDbQuery(run, tables, deps, fallback)` over `readDb`, and list every base table**, joins included; a view's base tables, never the view. Never import `useLiveQuery`. Subscribe per widget.
7. **Three screen states:** content · empty · error. `pending` lasts a few ms. Render nothing new while pending, and show Empty **only** when `status === 'ok'`.
8. **Multi-statement writes go through `writeTx`, and the callback is synchronous** (`.run()`/`.all()`, never `await`). Drizzle's expo driver commits when the callback returns.
9. **Writes return `WriteResult` via `safeWrite`.** Rule violations throw `UserFacingError` (shown verbatim). On `ok: false` the form stays open; `safeWrite` has already toasted.
10. **Soft delete via `deleted_at`**; every read filters it; unique indexes are partial. Undo is a toast action. Deleted transactions are purged after 30 days, except import-batch rows (`db/retention.ts`).
11. **Every `category_id` / `person_id` reference must be handled by merge/delete/restore paths.** When you add a table with such an FK, update `features/categories/mutations.ts` and its test (see B4).
12. **Schema changes:** edit `db/schema.ts` → `npx drizzle-kit generate` → **read the SQL** (three known generator bugs, see Gotchas) → `db/__tests__/migrations.test.ts` on the populated fixture → run on a copy of the phone's database. Data fixes go in `drizzle-kit generate --custom`. Never hand-edit a generated migration.
13. **Colours come from tokens.** `useColors()` in components (`colors` only where a hook can't run). No hex literals in charts or screens (`components/charts/__tests__/tokens.test.ts`). Change a palette → `npm run theme:css`.
14. **Use `useToday()` for "today" in anything rendered**, never `todayISO()` at render. Date presets are stored as names and resolved at query time.
15. **Restore backs up before it overwrites** (Phase 7): validate, snapshot, then swap.
16. **Notification channels exist before posting; reminders are rescheduled wholesale** (Phase 8).
17. **Dev-only code is guarded twice:** the entry point checks `__DEV__`, and the route or function refuses to run otherwise (`app/dev.tsx`, `db/devSeed.ts`).
18. **Tests run the shipped code.** Pure logic is tested directly; SQL is tested by passing a better-sqlite3 Drizzle handle to the same builders (`db/__tests__/support.ts`). Don't keep a hand-written copy of a query in a test.

---

## Data model

`db/schema.ts` is authoritative. Nine migrations (`0000`–`0008`) are applied on the dev phone up to 0006 (verified 2026-09-15).

| Table | Holds | Notes |
|---|---|---|
| `categories` | name, icon, color, `kind` (`expense`/`income`/`both`), `is_system` | System rows have fixed `sys:<slug>` uids and are reconciled by `SEED_VERSION` (`db/seed.ts`). `cat_name_unique` (lower(name), live rows) lives in custom migration 0006. Deleted rows get a tombstone name |
| `transactions` | `type`, `amount_paise`, `date`, generated `month`, note, `category_id`, `import_batch_id`, `dedupe_hash` | Indexes: `tx_ledger_idx (date) WHERE deleted_at IS NULL` (keyset pages), `tx_month_idx (month,type,amount_paise)` partial, `tx_cat_idx`, `tx_batch_idx`, `tx_dedupe_idx` |
| `budgets` | `category_id`, `limit_paise`, `reset_day` 1–31, `is_active` | One **live** budget per category. The cycle window is computed in TS (`getCycleWindow`) and bound as parameters |
| `subscriptions` | name, `amount_paise` per cycle, `billing_cycle`, `status`, `anchor_date`, `category_id`, `reminder_days_before` | Next renewal is computed on read (`getNextRenewal`), never stored. The reminder is unused until Phase 8 |
| `import_batches` | source name, counts, `undone_at` | For Phase 6 undo |
| `app_meta` | key/value | `schema_version`, `seed_version`, `seeded_at`, `last_backup_at`, `onboarding_dismissed` (`META_KEYS`) |
| `people` | friends + exactly one `is_self` row (`sys:self`, migration 0008) | Groups |
| `split_groups` | name, icon, `simplify_debts`, `direct_person_id` | A 1:1 friendship is a **hidden group** with `direct_person_id` set |
| `group_members` | soft-removable membership | Removal allowed only at a zero balance |
| `split_expenses` + `split_expense_payers` + `split_expense_shares` | amount, method, payers, shares (+ typed `input`) | Payers and shares each sum **exactly** to the amount |
| `split_debts` | derived pairwise debts per expense | Rewritten with its expense in one `writeTx` |
| `settlements` | a payment between two members | |

Every user table has `uid` (32 hex chars from SQLite, or `sys:*`) for export → restore identity, plus `created_at`/`deleted_at` (and `updated_at` where edited).
**Groups never touch the ledger:** no group expense creates a transaction or moves a budget, Home or Insights figure. **Balances are never stored.** `netsQuery` sums flows per (group, person); JS runs `simplifyDebts` (pairing pre-pass + two max-heaps, ≤ n − 1 payments) or `pairwiseNet`. See `docs/diagrams/01-debt-simplification.mmd`.

---

## Screens and navigation

```
[ Home ] [ Transactions ] ( + ) [ Insights ] [ More ]
                          tap: add transaction · long-press: Sheets
More → Budgets · Tracker · Categories · Groups · Sheets* · Backup* · Settings (Appearance, Recently deleted) · Dev harness (dev)
                                                   * placeholder screens
```
- **Home:** net balance, income/expense vs last month, insight banner (`lib/insight.ts`), 6/12-month bar/line trend, top categories, budgets card, renewals card, recent transactions. A first-run Welcome (add · import · restore) shows while the ledger is empty and not dismissed.
- **Transactions:** keyset-paged FlashList with sticky month headers, 150 ms debounced search (note + category name), type switch, filter sheet (type, date presets or a custom range, categories) with removable chips, swipe delete + undo, long-press multi-select, CSV export of the current filter.
- **Insights:** 3/6/12/24-month range drives the summary, a scrubbable area chart and stat cards (avg/day, biggest expense, top category, savings rate); category donut with a month picker.
- **Budgets** (alarm-clock amount dial, cycle windows, 75% warning), **Tracker** (status filter, renewal/amount/name sort, monthly-equivalent totals), **Categories** (create, rename, recolour, icon, merge, delete), **Groups** (hub, group detail/totals, friend detail, expense form with equal/exact/percent/shares and multiple payers, settle up).
- Full-screen modals for forms, native `formSheet` for filters and balances, the JS `DatePickerSheet` for dates (5 years back, 1 year ahead).

---

## How to run

Full walkthrough and troubleshooting: [`docs/run-on-phone.md`](docs/run-on-phone.md).

```bash
npm ci
npx tsc --noEmit && npx jest          # must pass before any commit
adb connect <phone-ip>:<port>         # wireless debugging
npm run android:local                 # local arm64 dev build (INTERNET granted for Metro); or: npm run build:dev (EAS)
npm start                             # Metro for the dev client
npm run theme:css                     # after changing a palette in lib/theme.ts
npm run db:generate                   # after editing db/schema.ts, then READ the SQL
```

- **Expo Go does not work** (SQLCipher, MMKV). Always use a development build.
- **`INTERNET` is fail-closed.** Use `npm run prebuild:dev` (not `npx expo prebuild`) before a local debug build, or Metro can't reach the phone.
- **Local native builds:** arm64 only, Kotlin in-process, `--max-workers=2`, and **never start Metro until the APK is built** (8 GB RAM). Redirect Gradle to a log and grep `BUILD SUCCESSFUL`; never pipe it through `tail`.
- **A schema change is not a native change.** Migrations are bundled JS. Adding a native package or editing `app.config.ts`/`plugins/` is.
- **Inspect the database:** background the app (checkpoints the WAL) → `npm run db:pull` → `npm run db:studio`. The dev harness (More → Dev harness) seeds 50k rows, benchmarks the shipped builders (median + TEMP B-TREE/SCAN flags) and round-trips an encrypted backup file.
- **Release check:** `rm -rf android` → prebuild → `npm run build:release-apk` (runs `verify:apk`: `aapt2 dump permissions` on the artifact).

---

## Gotchas

**Database**
- **drizzle-kit 0.31 emits broken SQLite migrations in three cases. Read every generated file.** (1) Adding a column *and* rebuilding a table in one generate copies the new column from the old table: split the generate. (2) A rebuild copies VIRTUAL generated columns, which SQLite rejects: `transactions.month` must be dropped and re-added around any future rebuild of `transactions`. (3) A partial expression index is emitted as a backticked column name: write it in a `--custom` migration.
- **Never migrate with foreign keys on.** Drizzle runs all pending migrations in one transaction, where `PRAGMA foreign_keys=OFF` is ignored, so rebuilding `categories` would cascade-delete budgets. `migrateWithForeignKeysOff` handles it; a test proves the loss without it.
- **Screens read through `db/read.ts`.** The expo Drizzle driver runs synchronously on the JS thread even when awaited. `db/client.ts` is for writes in `writeTx` and tiny point reads (edit-form prefill).
- **In a single-table Drizzle select, `${table.column}` renders unqualified.** Inside a correlated subquery SQLite binds it to the inner table. Write `split_groups.id` literally there.
- **Through `readDb`, a raw `db.all(sql\`…\`)` returns bare arrays.** Wrap raw SQL as `select({...}).from(sql\`(…) x\`)`.
- **A partial index is used only if the query repeats its predicate** (`deleted_at IS NULL`). Month aggregates must filter on `month`, not `substr(date,…)`.
- **Change events name base tables, never views**, and fire once per row (the change hub coalesces them).
- **Migrations on an empty database prove nothing.** Empty tables hide every constraint violation.

**Android and build**
- **Verify permissions on the built APK, never on `expo config` or the manifest.** `android.permissions` only *adds*; library manifests contribute more; a stale `android/` keeps the old policy. Only `blockedPermissions` removes, and only `aapt2 dump permissions` on the artifact tells the truth.
- **`expo-notifications` drags in FCM, Install Referrer and ~18 OEM badge permissions.** All are blocked in `app.config.ts`. `WAKE_LOCK` is kept for scheduled notifications.
- **Auto-backup has a 25 MB quota and fails silently.** Backup rules are exclude-only (any `<include>` narrows the backup), have no wildcards, and exclude WAL/SHM, snapshots, legacy, unreadable and the dev-launcher bundle.
- **A Keystore-keyed database cannot survive auto-backup.** If on-device encryption ever returns, the key must be recoverable by the user (a recovery code), never Keystore-only.
- **Edge-to-edge:** the tab bar grows by the bottom inset; `KeyboardAvoidingView behavior="padding"` is the one source of keyboard padding.
- **Splash colours** equal `background` in `lib/theme.ts`. A forced Light theme on a dark phone still gets the dark splash (drawn before JS runs).

**React Native and UI**
- **Reanimated rejects exponent notation in colour strings.** Use `interpolateColor`, never `rgba(… ${alpha})` templates.
- **`toLocaleString("en-IN")` silently falls back to US grouping without ICU.** Always go through `lib/money.ts`.
- **Flexbox defaults to `column`; text styles don't cascade through `View`.** NativeWind can't do `hover:`, `position: fixed`, z-index stacking or real CSS grid.
- **Android elevation on a translucent or clipping view draws a hard rectangle.** `shadow()` pins `elevation: 0`; depth comes from borders.
- **Three meanings of "back"** (system gesture, sheet dismissal, in-form sheets): in-form sheets (`groups/components/kit.tsx`) close before the screen.

---

## Deferred, with reasons

| Item | Why | Cost later |
|---|---|---|
| Multi-device sync | No server by design | A real project; `uid` columns already exist |
| Rollup tables | Premature: plans verified index-only, desktop trend 3.5 ms at 50k | Only if on-device timings exceed 50 ms |
| Multi-currency | The web app is INR-only | Follows the web app |
| Live Google Sheets sync | Needs `INTERNET` | Drive-stored `.xlsx` files already work through the picker (6A) |
| Bank SMS capture | `READ_SMS` is incompatible with Play and the privacy promise | — |
