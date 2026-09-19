# SpendWise Android — Task Tracker

> The **one** live tracker. **Full task cards (problem, code, fix, tests, done-when for every item):
> [`plan.md`](plan.md).** Context: [`CLAUDE.md`](CLAUDE.md) · Evidence for the R-phases:
> [`docs/architecture-review-2026-09-17.md`](docs/architecture-review-2026-09-17.md) (IDs like `B4`, `A2`, `T6` refer to it; `R0`–`R6` are phases in this file).
> `B21`–`B30` come from the second review, [`docs/code-review-2026-09-19.md`](docs/code-review-2026-09-19.md).
> History (read-only): [`docs/history/`](docs/history/). The old Phase 0–5 and Groups tracker and the
> TASKS2 fix tracker live there with all their ticks and _Discovered_ notes.

**How to use this file**

- Work **top to bottom in the recommended order**. One batch = one sitting = one PR.
- Tick `[x]` when the _Done when_ line is true, not before. Code complete and verified on the phone are
  separate ticks. Device checks live in one list (§ Device verification) so they can be run in one session.
- New problems found mid-task go in that phase's _Discovered_ list.
- Every task says **why**. If the why no longer holds, re-check the task before doing it.

---

## Status — 2026-09-19

| #         | Phase                         | Est.  | Status                                            |
| --------- | ----------------------------- | ----- | ------------------------------------------------- |
| 0–5       | Foundations → Analytics       | —     | ✅ Code complete · 🟡 device checks open          |
| G         | Groups — split expenses       | —     | ✅ Code complete · 🟡 device checks open          |
| F0–F3, F5 | Fix phases (TASKS2)           | —     | ✅ Code complete · 🟡 device checks open          |
| **R0**    | Stabilise the repo            | ½ d   | 🟡 all done; GitHub remote added; APK recheck due |
| **R1**    | Correctness bugs              | 1½ d  | ✅ done 2026-09-17 (550 tests)                    |
| **R2**    | Guard rails: lint, format, CI | 1½ d  | ✅ done 2026-09-19 (568 tests)                    |
| **R3**    | One data layer                | 3 d   | ✅ done 2026-09-19 (568 tests)                    |
| **RF**    | Review fixes B21–B30 + motion | —     | ✅ code 2026-09-19 · 🟡 `verify` + phone checks   |
| **R4**    | UI kit and thin routes        | 3 d   | ⬜                                                |
| **7**     | **Backup & restore**          | 3–4 d | ⬜ ← **most important remaining product work**    |
| 8         | Native layer                  | 3–4 d | ⬜                                                |
| R5        | Performance (was TASKS2 F4)   | 2 d   | 🟡 7 of 8 done; 2 slow queries to index           |
| R6        | Observability and release ops | 1 d   | ⬜                                                |
| 6A        | Sheets: import and workspaces | 7–8 d | ⬜ gated on the Sheets readiness gate             |
| 6B        | Linked sheets                 | 4–5 d | ⬜                                                |
| 9         | Hardening & Play Store        | 4–5 d | ⬜                                                |

**Recommended order:** R0 → R1 → R2 → R3 → R4 → 7 → 8 → R5 → R6 → 6A → 6B → 9.
_2026-09-19:_ the review fixes (RF) and most of R5 were done early, on branch `fix/review-b21-b28`. **Next: R4.**
_Why this order:_ a factory reset currently loses everything, so Backup (7) comes before any new data
surface. The refactor (R3/R4) comes before Backup and Sheets so that the two biggest new features are
written in the target layout, not ported into it afterwards. Guard rails (R2) come before the refactor so
the boundaries are enforced _while_ files move.

**Remaining: ~34–40 working days.** About 12½ days of that is R0–R6. Every R-phase ships behind a green
`npm test` and makes no schema change.

---

## R0 — Stabilise the repo

**Goal:** a clean starting point that someone else can clone and understand. **Est:** ½ day.

- [x] **Commit the F5 working tree; work on `main`** (T8) _(done 2026-09-17: `b29f79a` code, `173b303` docs,
      `ead7d44` R0. `main` did not exist and there is no remote, so `master` was renamed rather than merged.)_
      _Why:_ 32 modified files (date picker, recently deleted, generated theme CSS) existed only on one disk.
      ~~**Still open: no remote.**~~ **Closed 2026-09-19:** pushed to GitHub
      (`Saksham-Sharma23/SpendWise-Android`, public); CI passed on its first run.
- [x] **Add `.gitattributes` (`* text=auto eol=lf`), `.editorconfig`, `.nvmrc` (22)** (T2) _(done 2026-09-17)_
      _Why:_ every git command warned about LF→CRLF on 30 files. Line-ending churn hides real diffs in review.
      _(No renormalise commit was needed: the files were already stored as LF.)_
- [x] **Write `README.md`**: what the app is (3 lines), prerequisites, `npm ci`, run on a phone, test,
      build, where the docs are _(done 2026-09-19)_
      _Why:_ CLAUDE.md is an agent context file. A human needs a one-page entry point.
- [x] **Remove unused dependencies:** `date-fns`, `@gorhom/bottom-sheet`, `expo-crypto`, `expo-document-picker`,
      `expo-local-authentication` (T6) _(done 2026-09-19: 6 packages removed; typecheck clean)_. Re-add each in
      the phase that uses it (6A: document picker; 8: local auth)
      _Why:_ native ones are autolinked into every APK and pull in manifest entries that must then be blocked.
      **Discovered on the first rebuild:** `USE_BIOMETRIC` / `USE_FINGERPRINT` did **not** leave. They come from
      `androidx.biometric` via `expo-secure-store` (R6), not from `expo-local-authentication`. The same APK
      carried `SYSTEM_ALERT_WINDOW` from Expo's template. All three are now in `blockedPermissions`, and
      `verify:apk` has an allowlist so the next surprise fails the check (plan.md R0-4).
      **Still to do:** a clean **release** build passing `npm run verify:apk`.
- [x] **Fix the misleading comments** (T4) _(done 2026-09-17, `ead7d44`)_: `lib/icons.ts:10` (the test it cites doesn't exist, see R2),
      `drizzle.studio.config.ts` (the device DB is no longer encrypted), `lib/theme.ts:7` (global.css is generated),
      the `dashboard/queries.ts` header (`features/devtools` doesn't exist), `categories/mutations.ts:163` (see B15)
      _Why:_ a wrong comment costs a newcomer more than a missing one.
- [x] **Delete the empty folders** `features/backup/`, `features/import/`, `lib/notifications/` _(done 2026-09-17; they were untracked, so no commit shows them)_
- [x] **Consolidate trackers and move designs out of CLAUDE.md** _(done 2026-09-17: this file; `docs/history/`, `docs/design/`)_

**Done when:** `git status` is clean on `main`, `npm ci && npx tsc --noEmit && npx jest` pass on a fresh clone,
and the README gets a new person to a running dev build.

---

## R1 — Correctness bugs

**Goal:** every figure on screen is right. **Est:** 1½ days. **No schema change.** Every fix adds a test that fails without it.

### Batch R1-A — Wrong numbers

- [x] **[B1] Bound "top categories" to the month:** add `lt(date, nextMonthStart)` in `dashboard/queries.ts` `topCategoriesQuery`
      _Why:_ a future-dated expense counts in "Where it went" but not in the month total, so a share can exceed 100%.
- [x] **[B2] Bound analytics ranges at the current month:** `trendQuery`, `totalsQuery`, `biggestExpenseQuery` get `lte(month, currentMonth)`
      _Why:_ period cards count next month's rows while the chart drops them, so the screen disagrees with itself.
      (R3 then removes the duplication that caused B1/B2.)
- [x] **[B3] Yearly cost is exact:** compute `yearlyCostPaise` from the charge per cycle (`weekly ×52`, `monthly ×12`, `quarterly ×4`, `yearly ×1`), never `round(monthly) × 12`. Test that ₹1,499/yr → 149900
      _Why:_ a 4-paise drift on a plan's own price is exactly the class of bug integer paise exists to prevent.
- [x] **[B4] Category merge/delete also moves `split_expenses.category_id`**, and add a test in `categories/__tests__/mutations.test.ts` that creates a group expense first
      _Why:_ deleting "Food" makes group totals show "Food ⟨deleted #7⟩". Every table with a `category_id` FK must be in both functions. Add a test that lists them from `sqlite_master` so the next table can't be forgotten.
- [x] **[B5] One amount limit:** `MAX_AMOUNT_PAISE` in `lib/money.ts` (₹10 crore, as the comments say), used by all three form schemas and Groups
      _Why:_ the current value is ₹100 crore, 10× the documented guard, and features disagree.
- [x] **[B6] `formatINRCompact` rounds before choosing the unit** (₹99,960 → ₹1.0L). Test both boundaries

### Batch R1-B — Interactions

- [x] **[B7] Ledger "Try again" actually re-runs:** expose `refetch()` from `useDbQuery` (bump an internal counter) and call it from `useTransactionPages().retry`
      _Why:_ today the button is a no-op, because `reset()` doesn't change the query's deps.
- [x] **[B8] An FK violation after migrating stays a hard failure:** record `integrity_failed` in `app_meta` inside the check and refuse `ready` while it is set, or run `foreign_key_check` _before_ COMMIT by migrating through our own transaction wrapper. Test with a deliberately violating fixture
      _Why:_ today the failure screen appears once and the next launch silently accepts the broken state.
- [x] **[B9][B10] Theme switches repaint everything:** add `colors` to `Ledger` `renderItem` deps; resolve the _uncategorised_ colour at render (a stable token such as `subtle`), not at fetch
- [x] **[B11] `BootFailure` status bar follows the theme**
- [x] **[B12] `keysFor` chunks instead of truncating at 500 ids**

### Batch R1-C — Data safety

- [x] **[B13] Snapshot before migrating whenever _any_ user table has rows** (transactions, budgets, subscriptions, people other than self, split_groups, categories that aren't system)
      _Why:_ a Groups-only user gets no safety copy today.
- [x] **[B14] `deleteGroup` refuses when any member's net ≠ 0** (same message style as member removal). `restoreExpense` refuses if a payer or sharer is no longer a live member
- [x] **[B15] The merge no longer hard-deletes the target's soft-deleted budgets** (the index is partial since 0001)
- [x] **[B19] `deterministicIcon` matches whole words**, not substrings. Test "Petrol", "LinkedIn Premium", "Daily", "Card", "Parent"

**Done when:** each item has a failing-then-passing test, and `npx jest` is green.
✅ **Met 2026-09-17** (`ca9c46f` R1-A, `a7e18d2` R1-C, `3adb462` R1-B). 550 tests, tsc clean. Every fix was
verified in both directions: the test was run against the unfixed code and seen to fail. Five checks that
only the phone can settle are in § Device verification (DV-9, DV-10, DV-17, DV-18, DV-27).

**Discovered:** full notes in [`plan.md`](plan.md) → _R1 Discovered_. The two that change later work:

- `features/dashboard` had no seam between its SQL and the runtime, so B1 was untestable until the builders
  moved to `features/dashboard/sql.ts` — a piece of R3 pulled forward, and a concrete measure of A1's cost.
- `restorePerson` and `restoreGroup` may share the B14 shape that `restoreExpense` and `restoreSettlements`
  had. Look at them in R3-12.

---

## R2 — Guard rails

**Goal:** CLAUDE.md's conventions are enforced by tools. **Est:** 1½ days. (Supersedes TASKS2 F6.)

- [x] **ESLint (flat config) with `eslint-config-expo`, `eslint-plugin-boundaries`, `react-hooks`**
  - boundaries: `app → features → (components | data) → db → lib`; no sibling features; `app/` may import `db/` only from `app/_layout.tsx`
  - `no-restricted-globals`: `fetch`, `XMLHttpRequest`, `WebSocket`
  - `no-restricted-syntax`: `parseFloat` / `toLocaleString` outside `lib/money.ts`; async function passed to `writeTx`/`.transaction(`
  - `no-restricted-imports`: `drizzle-orm/expo-sqlite` `useLiveQuery`; `db/client` from any `components/`
  - `@typescript-eslint/no-unused-vars` (removes the 30 shadowed `colors` imports)
    _Why:_ `npm run lint` fails today because ESLint isn't installed, so every rule exists only in prose.
    **Done when:** `npm run lint` passes and a deliberate violation of each rule fails.
- [x] **Prettier** (print width 120, the code's existing style) + `npm run format`; format once in a dedicated commit
- [x] **Type-check tests:** `npm run typecheck` runs `tsc --noEmit` **and** `tsc -p tsconfig.test.json --noEmit`; align `ts-jest` with Jest 30 (or move to `jest-expo`'s Node preset)
- [x] **Add the icon-mapping test that `lib/icons.ts` claims exists:** `ICON_NAMES` and `CategoryIcon`'s map are the same set. Extract the map to `components/ui/iconMap.ts` so Node can import it
- [x] **Adopt the `@/` import alias** (`tsconfig` already declares it; Metro supports it) and codemod relative imports (T7)
      _Why:_ `../../../lib/theme` breaks on every move, and R3/R4 move a lot of files.
- [x] **GitHub Actions CI** on every PR: `npm ci` → typecheck → lint → jest → `EAS_BUILD_PROFILE=production npx expo config --json` asserts `INTERNET` ∈ `blockedPermissions` and `allowBackup: true`
- [x] **`CONTRIBUTING.md`:** branch naming, one batch = one PR, the migration checklist (convention #7/#8), the device-verification rule

**Done when:** CI is green on `main`, and a PR that adds `fetch`, a cross-feature import or `INTERNET` fails CI.

**Discovered (2026-09-19, first full run after R2/R3):** all three fixtures in
`db/__tests__/boundaries.test.ts` proved nothing. Each used a relative import, so `no-restricted-imports`
(rule 5) or `import/no-unresolved` fired first and `boundaries/dependencies` never judged them — the
rejection case asserted the wrong rule and failed, and the two "allowed" cases passed because a rule that
never ran stayed quiet. Fixed in `50dd0ef`: fixtures use the `@/` form real code uses, and the allowed
cases now assert the fixture is **clean** rather than merely un-flagged. Re-verified by renaming the rule
to the boundaries v6 name — the sibling case fails, which is the regression this file exists to catch.
The rule itself was never broken.

---

## R3 — One data layer

**Goal:** every feature has the same shape, and no query exists twice. **Est:** 3 days. Target layout: review §4.
Move files first, then change behaviour, in separate commits so review stays readable.

### Batch R3-A — Shared foundations

- [x] **`db/types.ts`: one `SyncDb` and one `AnyDb` type**; delete `AnalyticsDb`/`GroupsDb`/`SyncDb`/`RetentionDb`/`SeedDatabase` aliases and the `as unknown as { all() }` casts in `groups/queries.ts` (A6)
- [x] **`data/meta.ts`**: move `getMeta`/`setMeta` out of `db/seed.ts`; `dismissOnboarding` uses it (A7)
- [x] **`data/categories.ts`**: the live-category builder + `useCategories(kind?)`; delete the copy in `features/transactions/queries.ts`; update the subscription, filters and split-expense callers (A3)
- [x] **`data/ledger.ts`**: `incomeExpenseSums`, `monthTrend(db, from, to)` + `fillMonths`, `categoryTotals(db, from, to, limit?)`, `budgetSpend(db, windows)`. All take `db` and are **bounded on both ends** (locks in B1/B2)
      _Why:_ the dashboard, analytics and budgets each had their own copy, and two copies of "this month's expenses" already disagreed.
- [x] **Move dev tools to `db/dev/`** (`devSeed.ts`, `benchmark.ts`)

### Batch R3-B — Features onto the standard layout

For each of `transactions`, `dashboard`, `analytics`, `budgets`, `tracker`, `categories`, `groups`:
`data/sql.ts` (builders take `db`) · `data/writes.ts` (pure, throw `UserFacingError`) · `data/hooks.ts` · `data/actions.ts` (safeWrite-bound) · `domain/` (pure) · `index.ts`.

- [x] transactions _(also: export pages through `readDb` with keyset, not sync OFFSET [B17])_
- [x] dashboard + analytics onto `data/ledger.ts` (one threshold constant from `budgets/domain/progress.ts` via `data/`)
- [x] budgets (`budgetProgressForCategory` uses `data/ledger.budgetSpend`; `spend.test.ts` runs the shipped builder, not its hand-written copy)
- [x] tracker
- [x] categories: `CategoryError` becomes `UserFacingError`; screens drop their `try/catch` and branch on `WriteResult`
- [x] groups: `groupNetsSync` reuses `netsQuery`'s SQL fragment; move toasts out of `groups/mutations.ts` (actions return results, screens toast)
- [x] **`useDbQuery` gains `refetch()`**, and resets `status` to `pending` when `deps` change to a different entity (e.g. another group id) so one entity's data never renders under another's header

**Done when:** a grep for `readDb.select` finds hits only in `data/` and `features/*/data/sql.ts`; no SQL fragment appears in two files; lint boundaries pass; all tests are green.

---

**Status 2026-09-19:** code complete on branch `refactor/r2-r3`, one commit per task or batch.
`tsc` (app and tests) and `npm run lint` are clean after every commit. **The full `jest` suite has not
been run since R2-3**; run `npm run verify` before merging to `main`. New tests written in this phase and
not yet run: `data/__tests__/{meta,categories}.test.ts`, the reworked `budgets/__tests__/spend.test.ts`,
`transactions/__tests__/keyset.test.ts` and the summary test in `filters.test.ts`.
CI cannot run until the repo has a remote.

---

## RF — Review fixes and motion (2026-09-19)

From [`docs/code-review-2026-09-19.md`](docs/code-review-2026-09-19.md) (74/100). Branch `fix/review-b21-b28`.
How to test each fix, and the B22 phone steps: [`docs/review-fixes-b21-b28.md`](docs/review-fixes-b21-b28.md).
**Code complete; `npm run verify` has not been run on it yet.**

### Bugs — committed in `5b74e29`

- [x] **[B21] High:** deleting or editing a group expense, or deleting a settlement, is refused when it names someone who left the group; the expense form explains and closes. Undoing a group delete is refused if a member was removed as a friend (8 tests)
- [x] **[B22] Medium:** screen reads run on their own `query_only` connection, so a read never sees an uncommitted write; `closeConnection()` closes both
- [x] **[B23] Medium:** budgets show the real reset day (the day after the cycle ends); the last day reads "Last day" (3 tests)
- [x] **[B24]** "Empty" in Recently deleted removes every row, not just the 500 listed; the dialog shows the real total (3 tests)
- [x] **[B25]** retention and "days left" count local days, not UTC dates (up to 5½ h off in IST) (4 tests)
- [x] **[B26]** a category merge refuses to put expenses, subscriptions, group expenses or a budget on an income-only category, or income on an expense-only one (6 tests)
- [x] **[B27]** boot-failure "Share a copy" uses `VACUUM INTO`, so WAL changes are included; old share copies are cleaned up (1 test)
- [x] **[B28]** a group's screen queries only that group and its people; the expense form looks its group up once (2 tests)

### Bugs — not committed yet

- [x] **[B29]** two identical reads starting together no longer leak a prepared statement: the loser is a throwaway and is finalized (`db/read.ts`; new `db/__tests__/read.test.ts`, 2 tests)
- [x] **[B30]** the CSV formula guard also covers a leading tab or carriage return (2 tests)

### Motion — committed in `5b74e29`

- [x] **No overshoot:** Reanimated 4's default mass (4) made every spring that set only damping and stiffness bounce 28–64%. `springs` in `lib/theme.ts` are now critically damped, plus `curves` (enter · exit · standard)
- [x] **Group form sheets** (`groups/components/kit.tsx`) slide on a timed curve instead of a bouncy spring; the tab droplet stretches less (20%) and its two edges travel at closer speeds
- [x] **Kept bouncy on purpose** (your call): the tab icon pop, the Home trend bars, the Insights scrubber line
- [x] **[A2] iOS-style screen transitions:** pushed screens slide in from the right (`ios_from_right`); full-screen forms rise from the bottom (`MODAL` in `app/_layout.tsx`); formSheets and tab switches unchanged
- [x] **[C9] One set of shared animations:** `rise` / `appear` / `leave` / `reflow` in `lib/motion.ts` replace ~80 hand-tuned entering/exiting/layout animations in 31 files (14 durations → one per role; 10 px rise, not 25; staggers capped at 360 ms)

### Still to do

- [ ] `npm run verify` green on the branch (typecheck, lint, format, jest, release policy)
- [ ] B22 phone check (steps in `docs/review-fixes-b21-b28.md`)
- [ ] Look over the motion on the phone: screen pushes, modals, group sheets, tab droplet, Home count-up, a crore-scale total fitting
- [ ] Commit B29/B30, push the branch, open a PR, CI green, merge
- [ ] The rest of the review: T10–T14, A8, A9 and the smaller items (see the review's §5 order)

---

## R4 — UI kit and thin routes

**Goal:** a screen is composed from primitives, and a route file is a one-liner. **Est:** 3 days.

- [ ] **`components/ui/Text`** with variants (`display`, `title`, `heading`, `body`, `bodyStrong`, `caption`, `label` (uppercase section label), `amount`) + `tone` (`default`/`muted`/`subtle`/`primary`/`income`/`expense`)
      _Why:_ 332 inline `fontFamily` styles in 45 files; each screen re-derives the type scale.
- [ ] **`Button`, `IconButton` (the round header button), `Chip`, `Section`, `StatFigure`, `Field` (`Label` + `ErrorText` + input)**; delete the per-file copies (A5)
- [ ] **`FormModal` + `useSubmitOnce`**: header (close · title · optional delete), keyboard handling, sticky primary button, the double-tap guard, the "no longer exists" redirect
- [ ] **Move screens out of `app/`** into `features/*/screens/`: transaction, budget and subscription forms; the filters sheet; More; Settings; the dev harness (`features/devtools/`) (A4). Routes become ≤ 20 lines
- [ ] **Rename** `features/dashboard/components/TrendChart` → `IncomeExpenseCard`; unify the tab label "Activity" vs the screen title "Transactions" (B20)
- [ ] **Migrate screens to the kit**, one feature per commit; remove the dead `colors` imports
- [ ] **Subscription anchor date and group expense date use `DatePickerSheet`** (TASKS2 F5 discovered)

**Done when:** no `app/` file exceeds 20 lines except `_layout.tsx`; a grep for `fontFamily: fonts.` outside `components/ui` and `components/charts` returns nothing; the phone looks identical before and after (screenshot pass of every screen, both themes).

---

## Phase 7 — Backup & restore

**Goal:** the feature that makes a standalone app responsible rather than reckless. **Est:** 3–4 days.
**Design:** [`docs/design/backup-and-native.md`](docs/design/backup-and-native.md). Already built: `db/encryptedCopy.ts`, `plugins/withBackupRules.js`, WAL checkpoint on background.

> **The highest-stakes phase.** Every other failure is an annoyance. A backup failure permanently loses data someone typed in by hand.

- [ ] **Export `.db`** via `VACUUM INTO` a temp file + `expo-sharing`; record `last_backup_at`
      _Why:_ a byte-exact, consistent single file (no WAL) is the most reliable restore.
- [ ] **Optional passphrase** (`writeEncryptedCopy`) with an explicit "a forgotten passphrase means this backup is gone" warning
- [ ] **Export `.json`** with `format_version`, `schema_migration_idx`, and every user table keyed by `uid` (Groups included; `split_debts` may be omitted and rebuilt)
      _Why:_ readable, and restorable across schema versions.
- [ ] **Restore: validate first, change nothing on failure** — header/passphrase, `integrity_check`, migration index ≤ bundled, row counts
- [ ] **Snapshot the current DB before swapping**; swap through `closeConnection` → move → reopen → `bootDatabase()` (the reopenable connection already supports it)
- [ ] **Restore from the boot-failure screen too** (the recovery path D5 promised)
- [ ] **Settings: database + WAL size, last backup date, warn near the 25 MB auto-backup quota**
- [ ] **Backup history** (`app_meta` or a small table) — "did I ever back this up?"
- [ ] **Tests:** JSON round-trip on the migrated 50k fixture (row counts and paise totals per table identical); restore refuses a newer migration index; a wrong passphrase changes nothing
- [ ] _(Monthly reminder ships with Phase 8 channels)_

**Exit criterion (on the phone):** populate → export → **uninstall** → reinstall → restore → row counts and totals match exactly. Repeat with an encrypted export and with the JSON export.

---

## Phase 8 — Native layer

**Goal:** reminders and quick add, the reasons to be a native app. **Est:** 3–4 days. Design in `docs/design/backup-and-native.md`.

- [ ] Create the channels `Renewals`, `Budget alerts`, `Backup` at boot (Android drops posts to a missing channel silently)
- [ ] Ask for `POST_NOTIFICATIONS` in context (first subscription save), never at launch
- [ ] Reschedule all renewal reminders after any subscription write: cancel all, then schedule (never diff). Uses `reminder_days_before`, which is stored but unused today
- [ ] Budget alerts at 75% / 100% after each transaction write, using the shared `budgetSpend` (R3) so the alert and the bar agree
- [ ] Monthly backup nudge only when `last_backup_at` is more than 30 days old
- [ ] `RECEIVE_BOOT_COMPLETED`; verify reminders survive a reboot and a force-stop
- [ ] Home-screen widget (`react-native-android-widget`) reading an MMKV snapshot written after each write; tap deep-links to the add form
- [ ] FAB long-press menu (add · import · settle up)
- [ ] Optional biometric lock (`expo-local-authentication`, re-added here)
- [ ] Haptics on add/delete

**Exit criterion:** a reminder fires on the right morning after a reboot; the widget adds a transaction in two taps.

---

## R5 — Performance (carried from TASKS2 F4)

**Goal:** 50k rows scroll end to end; a save causes no dropped frames. **Est:** 2 days.

- [x] Keyset ledger pages, page 1 live _(TASKS2 4A)_
- [x] Row memo on drawn fields; sticky month headers _(TASKS2 4A)_
- [x] **[B16] `AnimatedAmount` off React state** — shared value + `withTiming` → read-only animated `TextInput` `text` via the worklet `formatINR`; one React render per change; jumps (no count) while unfocused or with reduced motion. Shrink-to-fit is done by measuring (TextInput has no `adjustsFontSizeToFit`) _(2026-09-19, needs a look on the phone)_
- [x] **[B18] `formatINR` always uses manual Indian grouping** — integer-only and a worklet; no `toLocaleString`. The ICU probe is now a test: 10,000 seeded random amounts must equal Node's `en-IN` output _(2026-09-19)_
- [x] **Search:** `lower()` dropped, `ESCAPE` kept; the pattern is no longer lowered in JS either (it made `É` search for `é`). **FTS5 trigram: not evaluated**, because notes are ASCII-dominant; reopen only if the "search page" row below goes over 50 ms on the phone _(2026-09-19)_
- [x] **Measure, then decide:** swipeable per row vs on touch; tab-bar blur during ledger scroll. **Decided 2026-09-19: keep both as they are.** Turning the swipeable off cut janky frames from ~8.5% to ~6.4% and p90 from 31 to 27 ms (dev build); that is inside run-to-run noise, and mounting on touch would cost the first swipe, so rows keep it. Blur off made no consistent difference, so there is no "Reduce transparency" setting. Numbers: plan.md R5-4
- [x] **Record on-device query timings** and close the rollup-table decision. **Closed 2026-09-19: rollup tables not needed.** The 24-month trend takes 19.5 ms on the phone at 50k rows (≤ 50 ms), indexed. Two queries are over 50 ms for other reasons; they are the follow-up below. Table: plan.md R5-5
- [ ] **Follow-up from the timings:** "top category (24 months)" 99.7 ms (TEMP B-TREE) and "biggest expense (24 months)" 67.9 ms are both over 50 ms. Check their plans for a missing covering index (this is not a rollup problem)

**Exit criterion:** Perf Monitor shows no dropped frames scrolling the 50k DB end to end and while saving from the ledger.

---

## R6 — Observability and release ops

**Est:** 1 day.

- [ ] **Local crash log** (`lib/crashlog.ts`): global error handler + unhandled rejections → rotating `files/logs/crash.log`, last 200 entries, **no amounts or notes**; Settings → "Share crash log" (T9)
      _Why:_ release builds have no crash reporting, and Sentry is ruled out by the no-`INTERNET` rule.
- [ ] **`docs/runbooks/release.md`**: version bump, `rm -rf android` → prebuild → `build:release-apk` → `verify:apk` → backup drill → migration drill → tag
- [ ] **`docs/runbooks/migrations.md`**: the drizzle-kit bug list, generate → read SQL → populated test → phone copy
- [ ] **Remove `db/legacyEncryption.ts` and `expo-secure-store`** once no installed build can hold a keyed DB (all testers upgraded past 2026-09-14)

---

## Sheets readiness gate (before 6A)

Carried from TASKS2 F7. All must be true before the first 6A task.

- [ ] `writeTx` is lint-enforced (R2)
- [ ] `money_rows` consumers list `transactions`, `sheets`, `sheet_rows` as base tables; `data/ledger.ts` reads the view so dashboard, analytics and budgets change once
- [ ] `sheet_row_links` keys through `uid` or ids that JSON restore remaps (Phase 7 format)
- [ ] Backup covers `files/sheets/` (rules are exclude-only, so it does by default; the manual export must add it)
- [ ] Parsing/export chunk explicitly (≈250 rows then yield) with an input size cap; `InteractionManager` alone doesn't split work
- [ ] SheetJS installed from the vendor tarball (npm `xlsx` is stuck at 0.18.5 with advisories); the ExcelJS spike criteria include JS-thread blocking time for a 5k-row styled workbook

## Phase 6A — Sheets: import and workspaces · Phase 6B — Linked sheets

**Est:** 7–8 d + 4–5 d. **Design, tasks, risks and exit criteria:** [`docs/design/sheets.md`](docs/design/sheets.md).
The task list is unchanged from the original tracker ([`docs/history/TASKS-phases-0-5-and-groups-2026-09.md`](docs/history/TASKS-phases-0-5-and-groups-2026-09.md) → Phase 6A/6B). Copy it here when the gate passes, rewritten for the R3 layout (`features/sheets/{data,domain,screens}`).
First task, as before: **collect five genuinely different real spreadsheets, then the one-day ExcelJS spike (go/no-go).**

## Phase 9 — Hardening & Play Store

- [ ] Full backup drill and migration drill on the phone (repeat before every schema-touching release)
- [ ] Delete-all-data with a typed confirmation
- [ ] Release APK/AAB has no `INTERNET` (`verify:apk` on the artifact)
- [ ] Privacy policy; Data Safety form (nothing collected or transmitted)
- [ ] Upload key generated **and backed up**; EAS signing; AAB
- [ ] Second physical device on a different Android version
- [ ] Internal testing track with a tester who is not you

**Exit criterion:** a tester who is not you installs from Play, adds and imports data, gets a renewal reminder, exports a backup and restores it on another device.

---

## Device verification

Everything below is **code complete and tested in Node**, and still needs the real phone. Run them together
with a fresh dev build (several need one: backup rules, splash colours). Tick here, with the date.

**Data safety (highest priority)**

- [ ] Auto-backup drill: `adb shell bmgr backupnow com.spendwise.android` → uninstall → reinstall → data present _(blocked 2026-09-15 by "Size quota exceeded"; dev bundle now excluded — needs rebuild)_
- [ ] Dev harness → encrypted backup-file round trip: counts match, header is not `SQLite format 3`
- [ ] Deliberately corrupted `spendwise.db` → "can't open your data" screen; Share and Start fresh both work
- [ ] A pending migration leaves a `files/snapshots/pre-migration-*.db` that opens in Drizzle Studio
- [ ] Forced constraint error keeps a form open with a specific toast (dev and release)
- [ ] Hammer Save → exactly one row
- [ ] `npm run build:release-apk` fails if `INTERNET` is present (exercise `verify:apk` on a real release build)
- [ ] Release build passes the new `verify:apk` allowlist: `rm -rf android` → `npm run prebuild` → `npm run build:release-apk`. Expect exactly `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE` and `…DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; no `USE_BIOMETRIC`, `USE_FINGERPRINT` or `SYSTEM_ALERT_WINDOW` (all three reached the 2026-09-19 dev APK)
- [ ] A row with `deleted_at` 31 days ago is purged at launch; one on its last day survives

**Review fixes and motion (RF, 2026-09-19)**

- [ ] B22: a save on one screen shows up on another only after it commits (steps in `docs/review-fixes-b21-b28.md`)
- [ ] Motion: screen push/back, modal rise, group Add-expense sheet, tab droplet, no overshoot anywhere
- [ ] `AnimatedAmount`: Home counts up after an add; a crore-scale total still fits on one line; TalkBack reads the figure once

**Correctness**

- [ ] Change the phone's date while backgrounded → Home and a "Last 7 days" filter update on resume
- [ ] Rename a category → Home and ledger update; a 500-row bulk delete re-runs each mounted query once (`readQueryCount`)
- [ ] Groups: the Goa example shows "Chirag owes Aarav ₹2,250" and "1 payment instead of 3"; "3 pairwise payments" with simplify off
- [ ] Budget cycles and renewals across a month end on the calendar (spot check against the tests)
- [ ] First-week script: backdate an expense to last quarter (≤ 3 taps), Expense/Income switch drops an invalid category, delete → restore from Recently deleted, cold start in light and dark
- [ ] Keyboard: note field and Save both visible while typing (edge-to-edge, gesture nav)

**Performance** (50k seeded DB)

- [x] Dev harness benchmark: 24-month trend ≤ 50 ms; record every row in R5 _(2026-09-19: 19.5 ms; table in plan.md R5-5)_
- [ ] A 500 ms artificial `SELECT` does not freeze the tab-bar droplet
- [ ] Home paints in one frame; adding a transaction from Home causes no droplet stutter
- [ ] Ledger scrolls 2,000 rows; adding a transaction then transfers ≤ one page (dev row-count log)
- [ ] Switching Insights to 24 months is visually instant

---

## Backlog (v1.1+)

| Item                                                              | Est.       | Why deferred                                                          |
| ----------------------------------------------------------------- | ---------- | --------------------------------------------------------------------- |
| Category `kind` editable in the category editor                   | ½ d        | User categories are always `both` today, so they appear on both forms |
| Import-batch undo UI                                              | 1 d        | Needs Phase 6 imports first; `import_batches` exists                  |
| Groups: exact minimum-payments solver (≤ 12 members)              | 1 d        | Greedy + pairing is ≤ n − 1 and what Splitwise ships                  |
| Groups: share a reminder via the share sheet                      | ½ d        | No `INTERNET` needed                                                  |
| Groups: recurring group expenses; copy your share into the ledger | 1–2 d each | Groups stay separate from the ledger by decision                      |
| Component tests (`jest-expo` + Testing Library) for forms         | 2 d        | Logic is covered in Node; UI is verified on device                    |
| Multi-device sync                                                 | weeks      | No server by design; `uid` columns already exist                      |
| Rollup tables                                                     | 2 d        | Closed 2026-09-19: phone trend 19.5 ms at 50k (see Decisions)         |
| Multi-currency                                                    | 3 d        | The web app is INR-only                                               |
| Receipt photos                                                    | 3 d        | Storage and the 25 MB backup quota                                    |
| Live Google Sheets sync · bank SMS capture                        | —          | Need `INTERNET` / `READ_SMS`; break the privacy promise               |

---

## Decisions log

Newest first. Full reasoning for older rows: `docs/history/`.

| Date       | Decision                                                                                                            | Reason                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 2026-09-19 | **Motion: timed curves and critically damped springs; no overshoot by default**                                     | The Reanimated 4 default mass made springs bounce 28–64%, which read as cheap. Three bouncy spots were kept by choice |
| 2026-09-19 | **iOS-style navigation on Android**                                                                                 | A push slides from the right and forms rise from the bottom, so direction says where you are                          |
| 2026-09-19 | **No rollup tables**                                                                                                | Phone, 50k rows: the 24-month trend takes 19.5 ms, indexed, against a 50 ms bar (plan.md R5-5)                        |
| 2026-09-19 | **Swipeable stays mounted per row; no "Reduce transparency" setting**                                               | Phone A/B scrolling 50k rows: both costs were within run-to-run noise (plan.md R5-4)                                  |
| 2026-09-17 | **Refactor (R0–R4) before Backup and Sheets; Backup (7) before Sheets (6A)**                                        | Durability is the top product risk; the two largest new features should be written once, in the target layout         |
| 2026-09-17 | **Shared `data/` layer below features** for queries 2+ features need                                                | "No sibling imports" without a shared layer produced copied queries that drifted (B1/B2)                              |
| 2026-09-17 | **One tracker**: TASKS.md; TASKS2.md and the Phase 0–5 detail archived to `docs/history/`                           | Open items were spread across four places                                                                             |
| 2026-09-17 | JS date picker (`lib/calendar.ts`), not a native module                                                             | Ships over the air; paints in the app's theme, not the system's                                                       |
| 2026-09-17 | `global.css` generated from `lib/theme.ts` (`npm run theme:css`, test-enforced)                                     | Two hand-synced palettes drift                                                                                        |
| 2026-09-17 | Soft-deleted transactions purged after 30 days (import-batch rows exempt)                                           | Deleted rows were kept forever                                                                                        |
| 2026-09-15 | Light theme + System/Light/Dark toggle shipped; `userInterfaceStyle: 'automatic'`                                   | Supersedes "dark-only v1"                                                                                             |
| 2026-09-15 | Groups built, separate from the ledger; friends are typed names                                                     | No contacts permission                                                                                                |
| 2026-09-15 | Charts stay on react-native-svg + Reanimated (no Skia)                                                              | ≤ 24 points; no native rebuild                                                                                        |
| 2026-09-14 | Main DB unkeyed; SQLCipher only for passphrase-encrypted backup files                                               | Keystore keys made auto-backup restores unopenable                                                                    |
| 2026-09-14 | `useDbQuery` + `readDb` replace `useLiveQuery`                                                                      | Per-row re-runs, missed joins, races, swallowed errors                                                                |
| 2026-09-14 | Keyset ledger pages; `categories.kind`; `is_recurring` dropped; `uid` on every user table; one ISO timestamp format | Migrations 0001–0006                                                                                                  |
| 2026-09-14 | Imports become Sheets (separate workspaces); app edits its own copy; per-sheet "include in totals" via `money_rows` | User's model                                                                                                          |
| 2026-09-11 | Standalone, offline-only; SQLite + Drizzle; aggregation in SQL; three backup layers                                 | The founding decisions                                                                                                |
