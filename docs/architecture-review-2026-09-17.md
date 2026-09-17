# Codebase review — 17 Sep 2026

> A full read of the repository at `7f69c5c` plus the uncommitted F5 work in the working tree
> (~20k lines of TypeScript across `app/`, `features/`, `components/`, `db/`, `lib/`).
> The fixes and refactors this review calls for are scheduled in [`TASKS.md`](../TASKS.md) as
> phases **R0–R6**. IDs in this file (`B3` bugs, `A2` architecture, `T6` tooling) are the IDs used there.

## Verdict

The **foundations are strong** and several parts of this codebase are better than most production apps:

- `db/` is careful: typed boot outcomes, a snapshot before migrating, migrations with foreign keys off, a
  migration test against a populated 50k-row database, a reopenable connection, and `writeTx`, which
  refuses async callbacks.
- Money is integer paise end to end, and the dangerous arithmetic is pure and heavily tested: cycle windows,
  renewals, splits and debt simplification.
- `npx tsc --noEmit` is clean, and **478 tests in 35 suites pass** (`npx jest`, ~5 min locally, most of it the 50k-row migration fixtures).
- The boundary rules hold. No feature imports a sibling, and `components/` and `lib/` never import `features/`.

What stops it from being a codebase you can hand to someone else:

1. **Every feature is structured differently.** There are four data-access patterns (A1), and routes range
   from 5 lines to 469 lines (A4).
2. **The same query is written in two or three places.** The "features never import each other" rule has no
   shared layer beneath it, so shared queries are copied (A2).
3. **There is no UI kit for text, buttons or forms.** 332 inline `fontFamily` styles across 45 files, with
   `Label`, `RoundButton` and `ErrorText` defined again in each form (A5).
4. **The rules are enforced by memory, not by tools.** `npm run lint` fails because ESLint is not installed.
   There is no CI, no README and no formatter (T1).
5. **The docs have drifted from the code.** There are three trackers (TASKS.md, TASKS2.md, two external
   artifacts), CLAUDE.md describes packages and folders that don't exist, and comments refer to tests that
   don't exist (T3).
6. **20 correctness bugs.** None destroys data, but several show wrong numbers (B1–B20).

---

## 1. Bugs

Ordered by user impact. Each one was confirmed by reading the code. Numeric claims were checked in Node.

### Wrong numbers on screen

| ID | Where | Bug | Scenario |
|---|---|---|---|
| **B1** | `features/dashboard/queries.ts:187` | Top categories filter `date >= startOfMonth(today)` with **no upper bound**. The month overview bounds by `nextStart`. | An expense dated next month (the date picker allows a year ahead) counts in "Where it went" and in the Insight banner's share, but not in the month's expense total. The share can exceed 100%. |
| **B2** | `features/analytics/sql.ts:34,48,83` | `trendQuery`, `totalsQuery` and `biggestExpenseQuery` filter `month >= firstMonth` with no upper bound. `categoryTotalsQuery` stops at the current month. | Future-dated rows inflate period totals, avg/day and savings rate. The trend drops those rows, so the cards and the chart disagree. |
| **B3** | `features/tracker/renewal.ts:61,134` | `yearlyCostPaise = round(amount/12) × 12`. The comment says a yearly plan's yearly cost "is the charge itself". | A ₹1,499/year plan shows ₹1,499.04/year (149904 paise). The yearly total drifts in the same way, which is the float-style drift this app exists to prevent. |
| **B4** | `features/categories/mutations.ts:148,184` | Merge and delete move `transactions`, `subscriptions` and `budgets`, but not **`split_expenses.category_id`**, because Groups was added later. | Delete "Food" → Group totals show **"Food ⟨deleted #7⟩"**, because `groupCategoryQuery` joins categories without a `deleted_at` filter. |
| **B5** | `features/{transactions,budgets,tracker}/schema.ts` | `MAX_PAISE = 100_00_00_000 * 100` is **₹100 crore**. Comments say ₹10 crore, and Groups uses ₹10 crore. | The typo guard ("a missed decimal point") is 10× looser than documented and differs between features. |
| **B6** | `lib/money.ts:158-159` | `formatINRCompact` picks the unit before rounding. | ₹99,960 renders as "₹100.0K", not "₹1.0L". The same applies at the lakh→crore boundary. |

### Broken interactions

| ID | Where | Bug | Scenario |
|---|---|---|---|
| **B7** | `features/transactions/components/Ledger.tsx:353` | "Try again" on the ledger error state calls `onRefresh` → `resetPages()`. When no older pages are loaded, the `useDbQuery` deps don't change, so **nothing re-runs**. | Ledger query fails → "Try again" does nothing. |
| **B8** | `db/migrate.ts:60`, `db/boot.ts` | A `foreign_key_check` failure throws **after** drizzle has committed the migration. Boot shows "couldn't finish updating", but the next launch (or "Try again") finds nothing pending and opens normally. | The failure screen appears once, then the violations are silently accepted. |
| **B9** | `features/transactions/components/Ledger.tsx:195` | `renderItem` reads `colors` but doesn't list it in its deps. | Switch theme with the ledger mounted → month headers keep the old palette. |
| **B10** | `lib/categoryColor.ts:14` + `Ledger.tsx:58` | The uncategorised fallback returns `colors.muted`, the text colour of the *current theme*, and it is baked into row objects when they are fetched. | Switch theme → uncategorised rows keep the previous theme's grey. |
| **B11** | `features/boot/components/BootFailure.tsx:51` | `<StatusBar style="light" />` is hard-coded. | Light theme + boot failure → white status-bar icons on an off-white background. |
| **B12** | `features/transactions/queries.ts:328` | `keysFor` silently truncates changed ids to 500. | Undo a 2,000-row bulk delete while scrolled deep → some older pages are never refreshed. |

### Data safety and durability

| ID | Where | Bug | Scenario |
|---|---|---|---|
| **B13** | `db/boot.ts:62` | `hasUserData()` checks only `transactions`. | Someone who uses only Groups, Budgets or the Tracker gets **no pre-migration snapshot**. |
| **B14** | `features/groups/writes.ts:206` | `deleteGroup` soft-deletes a group with non-zero balances without checking them. `restoreExpense` restores rows that may reference members who have since been removed. | Balances vanish from the hub. Friend totals change with no settlement. |
| **B15** | `features/categories/mutations.ts:163` | The merge hard-deletes the target's soft-deleted budgets "because they hold the unique slot". That stopped being true at migration 0001, when the index became partial. | Needless permanent deletion of history. The comment contradicts the file header. |

### Performance (carried from TASKS2 F4, still open)

| ID | Where | Issue |
|---|---|---|
| **B16** | `components/ui/AnimatedAmount.tsx:51` | `setState` on every animation frame for 700 ms, six instances mounted. |
| **B17** | `features/transactions/queries.ts:283` + `export.ts` | CSV export pages with **OFFSET** on the **sync** handle, so it is O(n²) and runs on the JS thread for a 50k export. |
| **B18** | `lib/money.ts` `formatINR` | Uses `toLocaleString('en-IN')` on every call, although the manual grouping is already correct and tested. |

### Cosmetic

| ID | Where | Bug |
|---|---|---|
| **B19** | `lib/identity.ts` | Substring matching is too loose. "Petrol" → paw-print (`pet`), "LinkedIn Premium" → landmark (`emi`), "Maid"/"Daily" → sparkles (`ai`), "Card" → car, "Parent" → house. |
| **B20** | `app/dev.tsx:93,141,174` | `toLocaleString()` in app code (breaks convention #11). The tab bar says "Activity" but the route and screen say "Transactions". |

---

## 2. Architecture problems

### A1 — Four data-access patterns

| Feature | Read builders | Hooks | Writes | Error style |
|---|---|---|---|---|
| transactions, dashboard, budgets, tracker | close over `readDb`, in `queries.ts` | `queries.ts` | `queries.ts`, sync `db` | `safeWrite` |
| analytics | take `db`, in `sql.ts` | `queries.ts` | — | — |
| categories | inline in `queries.ts` | `queries.ts` | `mutations.ts` takes `db` | throws `CategoryError`; each screen `try/catch`es |
| groups | take `db`, in `sql.ts` | `queries.ts` | `writes.ts` (pure) → `mutations.ts` (safeWrite **and toasts**) | `UserFacingError` |

Only the analytics and groups style lets tests run the **shipped** SQL. Budgets' spend test keeps a
hand-written copy of its query. Toasts are raised from the data layer in `groups/mutations.ts`, from
routes, and from components. A newcomer can't tell which pattern to copy.

**Target:** one layout for every feature (section 4).

### A2 — Duplicated queries, because there is no shared data layer

The rule "a feature never imports a sibling" (CLAUDE.md #9) is right, but nothing sits below features for
shared *domain* queries, so they are copied:

| Query | Copies |
|---|---|
| income/expense `CASE` sums | `transactions/queries.ts`, `dashboard/queries.ts`, `analytics/sql.ts` |
| monthly trend + gap filling | `dashboard/queries.ts`, `analytics/sql.ts` + `queries.ts` (identical SQL) |
| expense per category | `dashboard` `topCategoriesQuery`, `analytics` `categoryTotalsQuery` (they already disagree: B1/B2) |
| budget spend in cycle windows + the 75% threshold | `dashboard` `useDashboardBudgets`, `budgets` `budgetQueries.spend`, `budgets` `budgetProgressForCategory` |
| group nets | `groups/sql.ts` `netsQuery`, `groups/writes.ts` `groupNetsSync` |
| live category list | `transactions/queries.ts` `useCategories` (used by subscription, filters, split-expense), `categories/queries.ts` |
| `app_meta` get/set | lives in `db/seed.ts`; `dashboard/queries.ts` imports the seeder to dismiss onboarding |
| `nowISO` | `lib/dates.ts`, a private `now()` in `groups/writes.ts` and `categories/mutations.ts` |
| amount limits | three `MAX_PAISE` + `MAX_EXPENSE_PAISE` (B5) |

B1 and B2 exist *because* of this duplication: two copies of "this month's expenses" drifted apart.

### A3 — `features/transactions` owns things that aren't transactions

`useCategories` lives there and is imported by the subscription modal, the filters modal and the
split-expense route. The ledger feature has become the category provider by accident.

### A4 — Routes aren't thin (convention #10 is broken in 7 files)

| Route | Lines | Contains |
|---|---|---|
| `app/(modals)/transaction.tsx` | 469 | full form, local `Label`/`ErrorText`/`RoundButton` |
| `app/(modals)/subscription.tsx` | 451 | full form, same three helpers again |
| `app/(modals)/budget.tsx` | 343 | full form, same three helpers again |
| `app/(modals)/filters.tsx` | 273 | full sheet |
| `app/dev.tsx` | 255 | dev harness, imports `db/*` |
| `app/(tabs)/more.tsx` | 151 | screen |
| `app/settings/index.tsx` | 138 | screen, imports `db/retention` |

The three forms repeat the same shell: close/title/delete header, `KeyboardAvoidingView`, a double-tap
`useRef` guard, `saving` state, a "no longer exists" effect, and delete with an undo toast.

### A5 — No typography or form primitives; two styling systems

- NativeWind is installed and used for layout, but **text is styled inline**: 332
  `fontFamily: fonts.*` occurrences in 45 files, with font sizes as literals.
- `app/dev.tsx` uses Tailwind colour classes. Everything else uses `useColors()`.
- 30 files import `colors` from `lib/theme` and then shadow it with `const colors = useColors()`. This is
  harmless, but the imported name is dead, and linting would catch it.
- Redefined per file: `Label` (4), `RoundButton` (3), `ErrorText` (3), `Section` (3), `Figure` (4), `Chip` (2).
- Two components are both called `TrendChart` (`components/charts/` and `features/dashboard/components/`).

### A6 — Unsafe casts in place of types

`features/groups/queries.ts` does `as unknown as { all(): … }` six times to run async builders on the sync
handle. `categories/queries.ts` and `groups/mutations.ts` cast `db` to their own handle types.
The `BaseSQLiteDatabase<'sync' | 'async', any, …>` alias is declared four times (`AnalyticsDb`,
`GroupsDb`, `SyncDb`, `RetentionDb`). One `db/types.ts` would remove most of these.

### A7 — The DB layer mixes concerns

- `db/seed.ts` holds the `app_meta` helpers.
- `db/benchmark.ts` and `db/devSeed.ts` are dev tools that sit next to production boot code.
- `app/` imports `db/` directly in three files. That is allowed for `_layout`, but not for settings.

---

## 3. Repository and tooling problems

| ID | Problem | Evidence |
|---|---|---|
| **T1** | **No enforcement.** `lint` script with no ESLint installed; no Prettier; no CI; `__tests__` excluded from `tsc` (only ts-jest checks test types); `ts-jest@29` on `jest@30` | `package.json`, `tsconfig.json` |
| **T2** | **No human entry point.** No `README.md`, no `.nvmrc`, no `.editorconfig`, no `.gitattributes`. Every git command warns about LF→CRLF on 30 files | `git diff --stat` |
| **T3** | **Doc drift.** CLAUDE.md lists `react-native-reusables`, Sentry and "TypeScript 5.x" (6.0 is installed), a Phase Map with stale statuses, "dark-only v1" (the light theme shipped), and folders that don't exist (`features/sheets`, `features/backup`, `widget/`, `lib/notifications/`, `features/tracker/notifications.ts`). It omits folders that do exist (`features/categories`, `features/boot`, `features/settings`, `db/retention.ts`, `lib/calendar.ts`, `lib/motion.ts`) | CLAUDE.md vs tree |
| **T4** | **Stale comments that mislead.** `lib/icons.ts:10` cites a test in `components/ui/__tests__` that doesn't exist, so `MAPPED_ICON_NAMES` is never checked. `drizzle.studio.config.ts` says the device DB is encrypted (not true since F0). `lib/theme.ts:7` says to hand-sync `global.css` (it's generated now). The `dashboard/queries.ts` header cites `features/devtools/benchmark.ts` (doesn't exist) | files named |
| **T5** | **Three trackers.** TASKS.md (product phases), TASKS2.md (fix phases), plus two external artifact plans. Phases 1–5 and G are all "awaiting on-device check", and those open checks are spread across both files | — |
| **T6** | **Unused dependencies** that are still autolinked native modules or bundle weight: `date-fns`, `@gorhom/bottom-sheet`, `expo-crypto`, `expo-document-picker`, `expo-local-authentication` (0 imports each) | import scan |
| **T7** | **Relative-import depth.** `tsconfig` defines `@/*`, but every import is `../../../`. Moving a file breaks its imports | — |
| **T8** | **Branch hygiene.** Work happens on `master`, the default branch is `main`, and 32 files with the whole F5 batch are uncommitted | `git status` |
| **T9** | **Release observability.** No crash reporting in release builds (Sentry was dropped because it needs `INTERNET`, and no replacement was built) | — |

---

## 4. Target architecture

Same stack and same locked decisions: this is a reorganisation, not a rewrite.

```
app/                         ROUTES ONLY — read params, render one screen from a feature. ≤ ~20 lines.
features/<feature>/
  index.ts                   public surface: screens + hooks other routes may use
  screens/                   full screens and modal screens (moved out of app/)
  components/                pieces used only by this feature
  data/
    sql.ts                   read builders — take `db: AnyDb`, so tests run the shipped SQL
    writes.ts                write cores — take `db: SyncDb`, throw UserFacingError, use writeTx
    hooks.ts                 useDbQuery hooks binding sql.ts to readDb
    actions.ts               safeWrite-wrapped writes bound to the app db (what screens call). No toasts except safeWrite's.
  domain/                    pure logic (progress, renewal, split, debts, period…) — no db, no RN
  schema.ts                  zod form schemas
  __tests__/
data/                        SHARED data access, below features (NEW)
  ledger.ts                  income/expense sums, month trend, category totals, budget spend in windows
  categories.ts              live category list (+ hook), kind filtering
  meta.ts                    app_meta get/set (from db/seed.ts)
components/
  ui/                        Text (variants), Button, IconButton, Chip, Card, Field/Label/ErrorText,
                             FormModal (shell + useSubmitOnce), Section, StatFigure, CategoryIcon, …
  charts/                    presentational charts + geometry.ts
  layout/                    Screen, TabBar, ThemeProvider, glass
db/                          connection, client, read, tx, schema, migrations, boot, retention, files,
  types.ts                   ONE SyncDb / AnyDb alias (NEW)
  dev/                       devSeed.ts, benchmark.ts (dev-only tools, moved)
lib/                         pure utilities: money, dates, calendar, heap, identity, theme…; lib/db runtime
docs/                        architecture-review, design/, diagrams/, history/, runbooks
```

**Import direction:** `app → features → (components | data) → db → lib`. `data/` may use `db` and `lib`
only. ESLint `boundaries` enforces this, along with no sibling features, no `db/` from `app/` except
`_layout`, no `fetch`, no `parseFloat` outside `lib/money`, and no async `writeTx` callback.

**One styling rule:** layout and spacing through NativeWind classes; text through `<Text variant>`;
raw colours only through `useColors()` where a value is dynamic (charts, animated styles).

**One error rule:** writes throw `UserFacingError` for rules and raw errors for bugs. `actions.ts`
wraps each write in `safeWrite`, which is the only thing that toasts a failure. Screens toast success and
decide whether to close.

**Worked example (budgets, after R3):**
`app/budgets/index.tsx` → `features/budgets/screens/BudgetList.tsx` → `features/budgets/data/hooks.ts`
`useBudgets(today)` → `data/ledger.ts` `budgetSpend(db, windows)` + `features/budgets/domain/progress.ts`.
Home's budget card calls the same `data/ledger.ts` function, so there is one query and one threshold.

---

## 5. What is left to build

| Area | State |
|---|---|
| Phases 0–5, Groups | Code complete. **On-device verification outstanding for most of them** (see TASKS.md → *Device verification*) |
| TASKS2 F4 (smoothness) | 2 of 7 tasks done |
| TASKS2 F6 (tooling) | Not started. Folded into R2 |
| TASKS2 F7 (Sheets gate) | Not started. Kept as a gate before 6A |
| **Phase 7 Backup & restore** | Not started. Only the encrypted-copy primitive and backup rules exist. **This is the product's biggest risk: a factory reset loses everything today** |
| Phase 8 Native (notifications, widget, lock) | Not started |
| Phase 6A/6B Sheets | Designed ([`design/sheets.md`](design/sheets.md)), not started. Gated on the ExcelJS spike |
| Phase 9 Hardening & Play | Not started |

**Recommended order:** R0 → R1 → R2 → R3 → R4 → **Phase 7** → Phase 8 → R5/R6 → 6A → 6B → Phase 9.
Backup moves ahead of Sheets because it protects data the app already holds. Sheets adds new data
and the largest new code surface, so the refactor (R3/R4) should land first so that Sheets is written
in the target layout from day one.
