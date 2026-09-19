# Code review — 19 Sep 2026

> A full read of the repository on branch `refactor/r2-r3` at `84811f2` (plus the uncommitted `package.json`
> change), after R0–R3 were complete. Every source file was read line by line except the larger
> presentational components, which were skimmed.
>
> IDs continue the numbering in [`architecture-review-2026-09-17.md`](architecture-review-2026-09-17.md):
> new bugs start at **B21**, architecture problems at **A8**, tooling problems at **T10**. None of these are in
> [`TASKS.md`](../TASKS.md) or [`plan.md`](../plan.md) yet. Items that are already tracked are listed
> separately in §6.

## Verdict

**74 / 100.** Overall the engineering is well above most solo projects: strict types, layer boundaries
enforced by lint (with a self-test for the linter), money in integer paise end to end, migrations run with
foreign keys off and a snapshot first, and 568 tests that run the shipped SQL against the real migrations.

The score is held back by four things:

1. **A data-integrity bug in Groups (B21):** a balance can end up on someone who has left the group, and
   nothing in the app can then settle it.
2. **No user backup yet.** A factory reset still loses everything (Phase 7, already tracked).
3. **A UI layer and a docs set that haven't caught up with the rest.** Screens are styled inline, routes are
   still large, and there is about 430 KB of markdown next to about 20k lines of code.
4. **Release hygiene.** Dev tooling and an unused notification stack ship in the release build (A8, A9).

### What was checked

| Check                             | Result                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run typecheck` (app + tests) | Clean                                                                                           |
| `npm run lint`                    | Clean, 0 warnings                                                                               |
| `npx jest`                        | 42 suites, **568 tests pass**, ~408 s. One worker leaked a handle and was force-exited (T12)    |
| B21 reproduction                  | A temporary test on the real migrated schema reproduced it (see the appendix), then was removed |
| T10 evidence                      | `npx eslint --print-config` on a `components/` and a `lib/` file                                |

---

## 1. How the app works

- **Boot:** [`app/_layout.tsx`](../app/_layout.tsx) calls `bootDatabase()` in [`db/boot.ts`](../db/boot.ts),
  which runs these steps in order: legacy-encryption check → pragmas → integrity check and snapshot (only if a
  migration is pending and user data exists) → migrate with foreign keys off → `foreign_key_check` → seed →
  purge expired deletions. Nothing else mounts until it returns `ready`. Any other outcome shows
  `BootFailure`, which offers share, retry and start fresh.
- **Reads:** a screen calls a feature hook (`features/*/data/hooks.ts`). The hook calls `useDbQuery`
  ([`lib/db/useDbQuery.ts`](../lib/db/useDbQuery.ts)), which runs a builder from `data/sql.ts` through `readDb`
  ([`db/read.ts`](../db/read.ts)): the async sqlite-proxy handle, which does the SQL work on expo-sqlite's
  native worker thread. Queries re-run when any table they list changes; the change hub groups bursts of
  row events into one re-run, and changes that arrive while a screen is unfocused are applied once on focus.
- **Writes:** a screen calls `features/*/data/actions.ts`, which wraps each write in `safeWrite` (a failure
  becomes a toast plus `{ ok: false }`). The write cores in `data/writes.ts` take a sync `db`, use `writeTx`
  for anything multi-statement and throw `UserFacingError` for rule violations.
- **Shared data:** `data/ledger`, `data/categories` and `data/meta` sit below the features, so two features
  never copy a query.
- **Tests:** every builder and write core takes `db`, so Jest runs the same code on better-sqlite3 against
  the real migrations.

## 2. What is strong

- **Money and dates:** `parseAmountToPaise` never goes through a float; the manual Indian grouping has an ICU
  probe; cycle windows and renewals are clamped to month length and anchored to the original date.
- **Migration safety:** foreign keys are turned off outside the transaction, `foreign_key_check` runs
  afterwards, and a failure is remembered across launches (B8). Snapshots are taken with `VACUUM INTO`, and
  the "has user data" probe covers every feature.
- **`writeTx` refuses async callbacks** at runtime, and lint catches them before the code runs.
- **Group maths:** largest-remainder splits that always sum exactly; per-expense debts that stay exact with
  several payers; simplification with an exact-match pairing pass and two max-heaps.
- **Performance:** keyset paging with only the affected older pages refetched; aggregates bounded on both
  ends and served by partial indexes.
- **Tooling:** the linter self-test, the check that `global.css` matches the palettes, the release-policy
  check, and the permission allowlist in `verify:apk`.
- **Honest documentation** of known gaps, decisions and device checks.

---

## 3. New bugs

| ID      | Severity | Where                                                                                                                                                                                              | What happens                                                                                                                                                                 |
| ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B21** | **High** | [`groups/data/writes.ts:429`](../features/groups/data/writes.ts#L429), [`:552`](../features/groups/data/writes.ts#L552), [`ExpenseForm.tsx:97`](../features/groups/components/ExpenseForm.tsx#L97) | Deleting or editing an expense, or deleting a settlement, can leave a balance on someone who has **already left** the group. Nothing in the app can settle it.               |
| **B22** | Medium   | [`db/read.ts:72`](../db/read.ts#L72), [`db/connection.ts:74`](../db/connection.ts#L74)                                                                                                             | Reads and writes share **one SQLite connection**, so reads don't run alongside writes, multi-query loads aren't one snapshot, and reads can see rows that haven't committed. |
| **B23** | Medium   | [`BudgetList.tsx:199`](../features/budgets/components/BudgetList.tsx#L199), [`progress.ts:98`](../features/budgets/domain/progress.ts#L98)                                                         | The "resets" date shown is one day early, and the last day of a cycle is labelled "Resets today".                                                                            |
| **B24** | Low      | [`transactions/data/sql.ts:119`](../features/transactions/data/sql.ts#L119), [`RecentlyDeleted.tsx:61`](../features/transactions/components/RecentlyDeleted.tsx#L61)                               | "Empty" deletes at most 500 rows but tells the user everything goes.                                                                                                         |
| **B25** | Low      | [`db/retention.ts:30-39`](../db/retention.ts#L30)                                                                                                                                                  | A UTC timestamp is compared with a local date, so retention and "days left" are off by up to 5½ hours in IST.                                                                |
| **B26** | Low      | [`categories/data/writes.ts:124`](../features/categories/data/writes.ts#L124)                                                                                                                      | Merging ignores `kind`, so expense rows and a budget can land on an income-only category.                                                                                    |
| **B27** | Low      | [`db/boot.ts:198`](../db/boot.ts#L198)                                                                                                                                                             | "Share a copy of my data" copies only the main file, so data still in `-wal` is missing. The copies are never cleaned up.                                                    |
| **B28** | Low      | [`groups/data/hooks.ts:176`](../features/groups/data/hooks.ts#L176), [`:276`](../features/groups/data/hooks.ts#L276)                                                                               | Finding one group runs the query for all groups; `getGroupRow` does it on the JS thread, during render.                                                                      |
| **B29** | Low      | [`db/read.ts:74`](../db/read.ts#L74)                                                                                                                                                               | If two identical queries start together, one prepared statement is never finalized (a small leak).                                                                           |
| **B30** | Low      | [`transactions/domain/csv.ts:36`](../features/transactions/domain/csv.ts#L36)                                                                                                                      | The CSV formula-injection guard misses a leading tab or carriage return.                                                                                                     |

### B21 — Groups: a balance on someone who has left the group

**Reproduced.** B owes you ₹100 for an expense, settles it, and at zero balance is removed from the group.
You then delete the old expense:

```
nets after deleting the expense           [{personId: you, -10000}, {personId: B, +10000}]
nets after also deleting the settlement   []
```

B is no longer a member but is owed ₹100. Nothing in the app can clear it:

- `recordSettlement` and `recordSettlements` require both people to be live members.
- `deletePerson` refuses to remove B while B has a balance ("Settle up with B first").

The only way out is to re-add B to the group.

The same thing happens in three places:

- `deleteExpense` ([writes.ts:429](../features/groups/data/writes.ts#L429)) has no guard.
- `deleteSettlements` ([writes.ts:552](../features/groups/data/writes.ts#L552)) has no guard.
- **Editing** an expense: the form builds its draft from the current members only
  ([ExpenseForm.tsx:97](../features/groups/components/ExpenseForm.tsx#L97)). A former member's share or payment
  silently drops out, and an equal split is re-divided among the remaining members. `validateExpense` then
  passes, because everyone left in the draft is a member.

This is the mirror image of B14, which was fixed for **restore** only.

**Fix:**

1. Call `assertPeopleStillMembers(tx, groupId, peopleOnExpense(tx, id), 'expense')` in `deleteExpense`, and in
   `saveExpense` when `id` is set. Pass the settlement's two people in `deleteSettlements`. Make both
   transactional. The helpers already exist.
2. In `ExpenseForm`, refuse to open an expense that names a former member, with an explanation (or show that
   person read-only).
3. Turn the appendix test into a regression test for all three paths.

### B22 — One connection for reads and writes

`readDb` prepares its statements with `sqliteDb.prepareAsync`, and `sqliteDb` is the same proxy the write
handle uses ([db/client.ts](../db/client.ts)). WAL lets reads run alongside writes only across _separate_
connections. On one connection SQLite serialises every API call on the connection mutex, so:

- **A sync write waits on the JS thread** while a long aggregate runs. So does a sync point read, such as
  `getTransaction` when an edit form mounts. The work runs on the native thread, but the JS thread still
  waits on the connection mutex. This is partly the freeze `readDb` exists to remove.
- **Multi-query loads are not one consistent snapshot.** `loadHub` runs six queries with `Promise.all`, and
  `usePeriodStats` runs four. A write can land between them, so one render can mix before and after.
- **Reads can see uncommitted rows.** An async read can step between two statements of a `writeTx` and see its
  uncommitted state. The change event puts it right about 32 ms later, but the screen can briefly show rows
  that were then rolled back.

The comment at [connection.ts:74](../db/connection.ts#L74) says the opposite ("WAL gives concurrent reads while
a write is in flight").

**Fix (measure first on the 50k database):**

- Open a dedicated read connection, `openDatabaseAsync(DATABASE_NAME, { useNewConnection: true })` (check the
  SDK 57 `SQLiteOpenOptions`), and run `PRAGMA query_only = 1` on it.
- Close and reopen it inside `closeConnection()`, so boot's move-aside and swap still work.
- For loads that must be consistent, wrap the queries in `BEGIN`/`COMMIT` on that connection.
- Keep the change listener on the write connection.

### B23 — Budget reset date one day early

`getCycleWindow` returns an **inclusive** `end`. The budget resets the day after it. But:

- [BudgetList.tsx:199](../features/budgets/components/BudgetList.tsx#L199) renders `resets {formatDayMonth(cycleEnd)}`.
  For a budget that resets on the 1st, that reads "resets 30 Sep" when it resets on 1 Oct.
- [progress.ts:98](../features/budgets/domain/progress.ts#L98) returns "Resets today" when `daysLeft` is 0. That
  is the **last** day of the cycle, and the reset is tomorrow.
- `features/budgets/__tests__/progress.test.ts:121` pins the wrong label.

**Fix:** render `resets {formatDayMonth(addDays(cycleEnd, 1))}`, change the zero case to "Last day", and update
the test.

### B24 — "Empty" is capped at 500

`deletedTransactionsQuery` defaults to `limit = 500`, and "Empty" deletes `rows.map((r) => r.id)`. With more
than 500 deleted rows (a bulk delete from the ledger does that), the dialog promises "Everything in Recently
deleted will be gone for good" and leaves the rest.

**Fix:** add a `purgeAllDeletedTransactions(db)` write core with the same predicate as the query (no limit),
and show the real count from a `count(*)`.

### B25 — Retention compares UTC with local time

`deleted_at` is `nowISO()`, a **UTC** timestamp. `purgeCutoff` and `daysLeft` treat its first 10 characters
as a **local** date. In IST, a delete between 00:00 and 05:30 local time is dated to the previous day:

- the row is purged up to 5½ hours before the documented "kept for the whole of its final day";
- "days left" shows one less than it should.

`db/__tests__/retention.test.ts` only uses timestamps that happen to be safe in UTC, so this is untested.

**Fix:** compare instants with instants. The cutoff is
`fromISODate(addDays(today, -days)).toISOString()` (local midnight as a UTC instant). For `daysLeft`, take the
local date of the deletion, `toISODate(new Date(deletedAt))`. Add a test with a deletion at `T20:00:00.000Z`.

### B26 — Merge ignores `kind`

`mergeCategory` moves every transaction, subscription, group expense and budget without comparing kinds.
Merging "Freelance" (`expense`) into "Salary" (`income`) leaves expense rows and possibly a budget on an
income-only category. The transaction form's picker then hides that category, and
`budgetableCategoriesQuery` would never have offered it.

**Fix:** refuse unless `target.kind === 'both'` or the kinds match, with a `UserFacingError` that says why.
Alternatively, widen the target's kind to `both` inside the same transaction.

### B27 — The boot-failure share misses the WAL

`shareDatabaseCopy()` does `databaseFile().copySync(...)`, which is the main file only. After a failed
migration the latest committed pages may still be in `spendwise.db-wal`, so the "safe" copy the screen offers
can be missing recent data. Every share also leaves a full copy in `files/unreadable/`, and nothing ever
deletes those.

**Fix:**

- If the database opens, use `VACUUM INTO` a share file, as the snapshots already do.
- If it doesn't open (the `unreadable` outcome), share the main file with its `-wal` and `-shm` beside it,
  or zipped together.
- Delete old `spendwise-share-*` files at the next successful boot.

### B28 — Looking up one group runs the query for all groups

`useGroup(id)` and `getGroupRow(id)` both run `groupsQuery`, which is every group, each with three correlated
subqueries, and then `find()` one. `getGroupRow` is synchronous on the JS thread and is called **during
render** in `ExpenseForm` (`targetLabel`) whenever the hub hasn't loaded yet. `useGroup` also loads every
person to build its name map.

**Fix:** add `groupQuery(db, id)` (the same columns, `WHERE split_groups.id = ?`), call it once in a `useState`
initialiser, and fetch only the group's members' names.

### B29 — Statement-cache race

In [`db/read.ts`](../db/read.ts#L74), two identical queries that both miss the cache in the same tick both
`await prepareAsync`, and both `cache.set`. The first entry is overwritten while its query is still running,
and because it isn't `owned` its `finally` never finalizes it. `onBeforeClose` only finalizes what is still in
the cache, so the statement leaks until the process ends. It is small, but it happens every time the ledger
and its summary mount together.

**Fix:** keep a `Map<string, Promise<SQLiteStatement>>` of in-flight prepares and await the existing one.

### B30 — CSV formula-injection guard

[`csvCell`](../features/transactions/domain/csv.ts#L36) prefixes a leading `= + - @`. The OWASP guidance also
lists a leading tab (`\t`) and carriage return (`\r`). Change the pattern to `/^[=+\-@\t\r]/` and add the two
cases to `csv.test.ts`.

---

## 4. Architecture and structure problems

### A8 — Dev code ships in the release bundle

[`app/dev.tsx`](../app/dev.tsx) is a route, so Metro bundles it, and it imports `db/dev/devSeed.ts` (the 50k-row
seeder and the encrypted-copy round trip) and `db/dev/benchmark.ts`. Three features export their benchmark
lists from their **public** `index.ts`: `transactionBenchQueries`, `dashboardBenchQueries` and
`analyticsBenchQueries`. The `__DEV__` guards stop this code running in release, not shipping in it.

**Fix:** move the harness into `features/devtools/` and let Metro strip it:

```tsx
// app/dev.tsx — `__DEV__` is a compile-time constant, so the require is dropped from release bundles.
import { Redirect } from 'expo-router';

// eslint-disable-next-line @typescript-eslint/no-require-imports
export default __DEV__ ? require('@/features/devtools').DevHarness : () => <Redirect href="/" />;
```

Take the `*BenchQueries` exports out of the feature `index.ts` files; `features/devtools` imports each
`benchmark.ts` directly. That needs its own entry in the lint boundaries, like the current `db/dev` exception.

### A9 — A notification stack that is declared but unused

`expo-notifications` is installed and configured as a plugin, and `POST_NOTIFICATIONS`,
`RECEIVE_BOOT_COMPLETED` and `WAKE_LOCK` are declared ([`app.config.ts:30`](../app.config.ts#L30),
[`:172`](../app.config.ts#L172)). No code uses any of it until Phase 8, and `verify-apk.sh` even _requires_
these permissions to be present. The library also brings in FCM, Install Referrer and about 18 launcher-badge
permissions that the config then has to block one by one.

**Fix:** remove the dependency, the plugin, the three permissions, their blocklist entries and the
"must survive" check in `verify-apk.sh`. Re-add them all in Phase 8 together with the feature that needs them.
Play review is simpler, and so is the manifest.

### A10 — Subscription renewal logic in three places

- `lib/dates.ts` holds `getNextRenewal`, `getUrgency`, `toMonthlyPaise` and `toYearlyPaise`, which are
  subscription logic inside a date module.
- [`lib/renewals.ts`](../lib/renewals.ts) enriches subscriptions for the Home card (`upcomingRenewals`).
- [`features/tracker/domain/renewal.ts`](../features/tracker/domain/renewal.ts) enriches them again for the
  Tracker (`enrich`).

Both enrichers compute `nextDate`/`daysUntil`/`urgency` independently. **Fix:** move the domain into one place
below the features, such as `data/subscriptions/` or `lib/subscriptions.ts`, with a single `enrich()`. Keep
`lib/dates.ts` to dates.

### A11 — Duplicated types and helpers

| Duplicate                                                                                                                                                                       | Fix                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `{ month, incomePaise, expensePaise }`: `TrendPoint` in `components/charts/TrendChart.tsx` **and** `features/dashboard/data/hooks.ts`, and `MonthPoint` in `data/ledger/sql.ts` | One `MonthPoint` in `data/ledger`; charts accept it           |
| [`analytics/data/hooks.ts:2`](../features/analytics/data/hooks.ts#L2) imports a type **from a chart component**: the data layer depends on the UI                               | Import from `data/ledger`                                     |
| Two components named `TrendChart` (`components/charts/` and `features/dashboard/components/`)                                                                                   | Rename the feature one `IncomeExpenseCard` (already in R4)    |
| `quote()` in `db/migrate.ts:146` and `quoteSql()` in `db/files.ts:47`                                                                                                           | Keep one (migrate.ts must stay native-free, so keep it there) |
| The timestamp format in `snapshotName()` (`db/migrate.ts`) and in `timestampForFile()` (`db/files.ts`)                                                                          | One helper                                                    |
| `shiftMonth()` (`features/analytics/domain/period.ts`) and `shiftMonthKey()` (`lib/calendar.ts`)                                                                                | Use `shiftMonthKey`                                           |
| `fitsType()` in `data/categories` is re-implemented inline in `app/(modals)/transaction.tsx:107`                                                                                | Call `fitsType`                                               |
| `BillingCycle` in `lib/dates.ts` and `db/schema.ts`; weekday name arrays in `lib/calendar.ts` and `app/(modals)/transaction.tsx`                                                | One definition each                                           |

### A12 — Footguns

- `useBudgetsWithSpend(today = todayISO())` and `useSubscriptions(today = todayISO())`
  ([budgets](../features/budgets/data/hooks.ts#L23), [tracker](../features/tracker/data/hooks.ts#L14)) invite
  exactly what convention #14 forbids. Today's callers pass `useToday()`, but the default makes the mistake
  easy. **Make `today` required.**
- `dismissOnboarding()` ([dashboard/data/hooks.ts:196](../features/dashboard/data/hooks.ts#L196)) writes without
  `safeWrite`, which breaks convention #9. A failure throws out of an `onPress`.
- `emptyBudgetForm()` sets `categoryId: 0 as unknown as number`. Use a nullable field with a refine, or leave
  it `undefined` and let the resolver report "Pick a category".
- [`components/layout/glass.tsx`](../components/layout/glass.tsx) `require`s expo-blur only if the native
  module exists. That was for APKs built before expo-blur was added. It's a dependency now, so a static
  import is simpler and removes an ESLint disable.

### A13 — Comments narrate history and point to files that moved

Many comments explain the bug that used to be there ("B14", "R3-6", "before this existed…") rather than why
the code is the way it is now. Once the trackers are archived, those IDs point nowhere. Comments should
state the intent; the history belongs in git and in a decisions log.

These stale references mislead today:

| Where                                      | Says                                                 | Actually                                                          |
| ------------------------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------- |
| `features/transactions/data/filters.ts:12` | "`queries.ts` is where the expo-sqlite handle lives" | `data/hooks.ts` / `data/actions.ts`                               |
| `features/transactions/domain/pages.ts:71` | "KEY_LOOKUP_LIMIT in queries.ts"                     | `data/hooks.ts`                                                   |
| `features/groups/data/writes.ts:26,30`     | "wrapped by ./mutations.ts", "CLAUDE.md #19"         | `data/actions.ts`; convention #8                                  |
| `features/categories/data/writes.ts:15`    | "queries.ts binds these"                             | `data/actions.ts`                                                 |
| `db/schema.ts:375`, `lib/heap.ts:8`        | `features/groups/debts.ts`                           | `features/groups/domain/debts.ts`                                 |
| `lib/identity.ts:13`                       | `features/tracker/renewal.ts`                        | `features/tracker/domain/renewal.ts`                              |
| `db/seed.ts:13`                            | "db/meta.ts and data/meta.ts"                        | `data/meta/` only                                                 |
| `eslint.config.js:60`, `:345`              | layer rule is "CLAUDE.md #9"                         | #9 is `safeWrite`; the layering rules are under _Architecture_    |
| `scripts/lint-selftest.js:4`               | fixtures in `scripts/lint-fixtures`                  | `lint-fixtures/` (see §8: move them to match)                     |
| `lint-fixtures/README.md`                  | "The folder is in `ignores`"                         | Deliberately not; `npm run lint` skips it with `--ignore-pattern` |
| `jest.config.js:1-5`                       | "Pure-logic unit tests only"                         | Also SQL on better-sqlite3 and 50k-row migration fixtures         |
| `db/connection.ts:74`                      | WAL gives concurrent reads during a write            | One connection (B22)                                              |

Citing convention **numbers** in comments will keep drifting as CLAUDE.md is edited. Cite the convention's
name, or link a section, instead.

---

## 5. Tooling and repository problems

### T10 — ESLint overrides silently drop the global import rules

ESLint's flat config **replaces** a rule's options in a later config object; it does not merge them. Two
overrides therefore redefine `no-restricted-imports` wholesale:

- `lib/**/*.ts` ([`eslint.config.js:326`](../eslint.config.js#L326)) keeps only the React/React Native ban;
- `components/**` ([`:359`](../eslint.config.js#L359)) keeps only the `db/client`/`db/read` ban.

So in `lib/` and `components/` the `../../` alias rule, the `useLiveQuery` ban and the `@/db/dev/*` ban don't
apply. Confirmed with:

```bash
npx eslint --print-config components/ui/Card.tsx   # no-restricted-imports: only the db/client pattern
npx eslint --print-config lib/money.ts             # no-restricted-imports: only react / react-native
```

**Fix:**

1. Declare the shared `paths` and `patterns` once as constants.
2. Have every override spread them and add its own entries.
3. Make the self-test prove the rules still apply in `components/` and `lib/`. A fixture file can't simply
   sit in `lint-fixtures/components/`, because the override matches on the real path. Lint the fixture text
   **as if** it lived there, with ESLint's `lintText(code, { filePath: 'components/__fixture__.tsx' })`, the
   same technique T11 needs. The self-test missed this because every fixture is linted at its own path, where
   only the global rules apply.

### T11 — A test writes into the source tree

[`db/__tests__/boundaries.test.ts:25`](../db/__tests__/boundaries.test.ts#L25) writes fixture files to
`features/transactions/__lint_tmp__/` while the suite runs. During that window a sibling-feature import sits
inside a real feature. A `npm run lint`, a `tsc` watch or Metro started at the same moment picks it up, and a
crashed run leaves the folder behind. **Fix:** lint the fixture text with
`ESLint#lintText(code, { filePath })`, which needs a path but no file on disk (check that
eslint-plugin-boundaries classifies a virtual path the same way; it reads the filename it is given).

### T12 — Jest leaves a handle open, and Node warns about `shell: true`

Every full run ends with "A worker process has failed to exit gracefully and has been force exited". Find it
with `npx jest --detectOpenHandles`; better-sqlite3 handles that aren't closed and timers without `unref()` are
the usual causes. The run also prints Node's `DEP0190` warning ("Passing args to a child process with shell
option true"), which comes from spawning `npx` with `shell: true` on Windows. Spawn `process.execPath`
with ESLint's CLI path instead.

### T13 — Windows-only scripts

- [`scripts/verify-apk.sh`](../scripts/verify-apk.sh) looks only for `aapt2.exe`, falls back to
  `$LOCALAPPDATA` and calls `python`. It fails on macOS, on Linux and on the CI runner. Rewrite it in Node,
  as `check-release-policy.js` already is, looking for `aapt2` or `aapt2.exe` under `ANDROID_HOME`.
- The **uncommitted** `android:local` change runs `.\\gradlew`, which only works in cmd.exe. It also drops
  `expo run:android --device`, so the app is no longer launched after install. Either keep the Expo command,
  or use `gradlew` through a small Node wrapper and update README and `docs/run-on-phone.md` to match.
- The `build:*` scripts use `.\\gradlew` too.

### T14 — Small config issues

- The transform key `'^.+\.tsx?$'` in `jest.config.js` loses its backslash inside a JS string. It still
  matches, but by accident. Write `'^.+\\.tsx?$'`.
- `tsconfig.json` `paths` repeats `@/db/*`, `@/features/*` and the rest, which `@/*` already covers.
- `.gitignore` lists ten `*.log` files by name that the `*.log` rule already ignores.

---

## 6. Already tracked, and agreed

These are in `TASKS.md` already. This review only confirms the priority.

- **No git remote** (R0). It's the biggest risk to the code itself: one disk holds everything, and CI has
  never run.
- **Backup & restore** (Phase 7). A factory reset loses all data. When building restore, validate hard:
  the tables have no `CHECK` constraints (amount > 0, `reset_day` 1–31, the `type` enum), so the restore
  code is the only thing stopping bad values from a file.
- **R4 UI kit and thin routes:** 332 inline `fontFamily` styles; `RoundButton`/`Label`/`ErrorText` defined
  three or four times each; route files of 279–480 lines. NativeWind is mostly used for layout while colours and type
  come from inline styles; pick one approach per concern.
- **R5 performance:** `AnimatedAmount` is driven by React state; `formatINR` on the ICU path; `lower()` in
  search.
- **R6:** local crash log; remove `db/legacyEncryption.ts` and `expo-secure-store`.
- **Device verification** list: none of it has been run yet.

---

## 7. Score

| Area                     | Score        | Main reason                                                                                               |
| ------------------------ | ------------ | --------------------------------------------------------------------------------------------------------- |
| Architecture & layering  | 17 / 20      | Clean layers enforced by tools; loses points for the shared connection (B22) and dev code in release (A8) |
| Logic & correctness      | 15 / 20      | Money, date and split maths are excellent; B21, B23–B26                                                   |
| Data safety & durability | 10 / 15      | Top-tier migration safety; no user backup yet; B21                                                        |
| Testing                  | 13 / 15      | 568 tests on the real schema, running the shipped SQL; no component tests, and no device checks done yet  |
| Tooling & delivery       | 7 / 10       | `npm run verify` is excellent; no remote so CI has never run; Windows-only scripts (T13); lint gap (T10)  |
| UI layer                 | 6 / 10       | Inline styles, large route files, duplicated helpers (R4)                                                 |
| Docs & maintainability   | 6 / 10       | Very thorough but sprawling (about 430 KB of markdown); comments that narrate history (A13)               |
| **Total**                | **74 / 100** |                                                                                                           |

---

## 8. A production-ready repository

### 8.1 Docs don't affect the build

No `.md` file ends up in the APK. Metro bundles only what is reachable from `app/`. Moving or deleting docs
makes the repository cleaner but doesn't change the build. What does change the release artifact:

- the dev harness and the benchmark exports (A8);
- `expo-notifications` (A9) and `expo-secure-store` (R6), both native modules autolinked into every APK;
- the placeholder screens (`app/sheets`, `app/backup`) and the "Coming later" / "Arrives in Phase 6" copy.

### 8.2 Delete from disk (already gitignored)

These aren't in git; they're only clutter in the working folder:

```
build.log  bundle.log  gradle-arm.log  gradle-build.log  gradle-release.log
jest.log   metro.log   prebuild.log    ununsed_packages.txt (untracked)
```

`android/` and `.expo/` are generated and gitignored; delete them whenever you want a clean prebuild.

### 8.3 Delete from the repository

| Path                                                                                                                                   | Why                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pcref/`                                                                                                                               | The web app's AI context, including its auth internals. It's another system's document and nothing here needs it. Update the link in `CLAUDE.md` |
| `assets/favicon.png`                                                                                                                   | Web only; not referenced anywhere                                                                                                                |
| `db/legacyEncryption.ts` + `expo-secure-store` + the `SecureStore.xml` backup exclusion + the `USE_BIOMETRIC`/`USE_FINGERPRINT` blocks | The only device has already booted a converted build (R6's condition). This also removes `androidx.biometric` from the APK                       |
| `expo-notifications` + its plugin + `POST_NOTIFICATIONS`/`RECEIVE_BOOT_COMPLETED`/`WAKE_LOCK` + the badge/FCM blocklist                | A9. Re-add in Phase 8                                                                                                                            |
| `app/sheets/`, `app/backup/`, the Settings "Coming later" card, the "Arrives in Phase 6" badges                                        | Placeholders shouldn't be in a production build. Remove them, or show them only when `__DEV__` is true                                           |
| `plan.md` (after R4)                                                                                                                   | 130 KB, almost all completed task cards. Move open items to issues or `docs/roadmap.md`                                                          |
| `docs/history/` (optional)                                                                                                             | About 150 KB of archived trackers. Git history keeps them; record the commit hash in `docs/README.md`                                            |

### 8.4 Move

| From                                                                            | To                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `TASKS.md`                                                                      | `docs/roadmap.md`, open work only (or GitHub Issues/Projects once a remote exists)   |
| The Decisions log in `TASKS.md`                                                 | `docs/decisions.md`, one row or short entry per decision (the "why" for odd code)    |
| `CONTRIBUTING.md`                                                               | `docs/CONTRIBUTING.md` (GitHub still finds it there)                                 |
| `docs/architecture-review-2026-09-17.md` + CLAUDE.md _Architecture_ + this file | `docs/architecture.md` (the current architecture); archive the reviews once acted on |
| `docs/run-on-phone.md`                                                          | `docs/guides/run-on-phone.md`                                                        |
| The migration checklist and drizzle-kit bug list (CLAUDE.md, CONTRIBUTING)      | `docs/guides/migrations.md` (planned in R6)                                          |
| Release steps                                                                   | `docs/guides/release.md` (planned in R6)                                             |
| `lint-fixtures/`                                                                | `scripts/lint-fixtures/` (where the self-test already says it lives)                 |
| `app/dev.tsx` contents, `features/*/benchmark.ts`, `db/dev/`                    | `features/devtools/`, loaded only when `__DEV__` is true (A8)                        |

> ⚠️ **Don't move `CLAUDE.md` into `docs/`.** Claude Code only loads it automatically from the repo root or
> from `.claude/CLAUDE.md`; anywhere else it stops being read. Keep it where it is and cut it from 35 KB to
> about 5 KB: the locked decisions, the conventions and the gotchas, with links into `docs/` for the rest. It is
> loaded into every session, so every kilobyte is paid for each time.

### 8.5 Target layout

```
.github/workflows/ci.yml
app/            routes only — ≤ 20 lines each except _layout.tsx
assets/
components/     ui/ (the R4 kit) · charts/ · layout/
data/           ledger/ · categories/ · meta/ · subscriptions/ (A10)
db/             schema · connection (write + read, B22) · boot · migrate · migrations/
docs/
features/       analytics · boot · budgets · categories · dashboard · devtools (dev only) · groups ·
                settings · tracker · transactions
lib/
plugins/
scripts/        + lint-fixtures/
README.md  LICENSE  CLAUDE.md
package.json  package-lock.json  app.config.ts  eas.json
babel.config.js  metro.config.js  tailwind.config.js  global.css  nativewind-env.d.ts  globals.d.ts
eslint.config.js  jest.config.js  tsconfig.json  tsconfig.test.json  tsconfig.jest.json
drizzle.config.ts  drizzle.studio.config.ts
.editorconfig  .gitattributes  .gitignore  .nvmrc  .prettierrc  .prettierignore  .git-blame-ignore-revs
```

The config files have to stay at the root; each tool looks for its config there.

```
docs/
  README.md            index: what each document is for
  architecture.md      layers, data flow, the database, the target layout
  decisions.md         why things are the way they are
  roadmap.md           open work, in order
  CONTRIBUTING.md
  guides/              run-on-phone.md · migrations.md · release.md
  design/              sheets.md · backup-and-native.md
  diagrams/            01-debt-simplification.mmd
```

**Optional:** moving `app/ features/ data/ components/ db/ lib/` under `src/` would leave only config files at
the root. Expo Router supports `src/app`. It is a large mechanical change: the path alias, `boundaries/include`
and `boundaries/elements`, the Jest `moduleNameMapper`, Tailwind `content`, the Drizzle `schema`/`out` paths,
the `lib/**` lint override and the self-test paths all have to move with it. Do it as one commit on its own,
if at all.

---

## 9. Suggested order

1. **Add a git remote** (private GitHub) so CI runs on every push. (R0)
2. **Fix B21** with the regression test from the appendix, then **B23**, then **T10**, whose self-test cases
   stop it regressing.
3. **Release hygiene:** A8 (dev code), A9 (notifications), R6's legacy-encryption removal, and the placeholder
   screens. Then `rm -rf android` → prebuild → `npm run build:release-apk` → `verify:apk`, with its allowlist
   shrunk to match.
4. **Phase 7 backup & restore**, validating every restored row (no `CHECK` constraints protect you).
5. **B24–B30** and T11–T14: each is small, so batch them into one PR.
6. **R4** (UI kit and thin routes), then the docs restructure in §8.
7. **B22:** benchmark a dedicated read connection on the 50k database, and keep it if the numbers hold.
8. Tidy A10–A13 as the files are touched.

---

## Appendix — B21 reproduction

Run as `features/groups/__tests__/removed-member.test.ts`. Today it passes and prints the stuck balance. Once
B21 is fixed, turn the `console.log` lines into assertions that `deleteExpense` and `deleteSettlements` throw a
`UserFacingError`.

```ts
import { freshDb } from '@/db/__tests__/support';
import { allSync } from '@/db/types';
import { netsQuery } from '../data/sql';
import {
  createGroup,
  createPerson,
  deleteExpense,
  deleteSettlements,
  recordSettlement,
  saveExpense,
  selfId,
  updateGroup,
} from '../data/writes';

it('deleting an expense after a member left puts a balance on them', async () => {
  const { db, sqlite } = await freshDb();
  const me = selfId(db);
  const b = createPerson(db, 'B');
  const g = createGroup(db, { name: 'Trip', icon: null, simplifyDebts: true, memberIds: [b] });

  // You pay ₹100 for B only.
  const e = saveExpense(db, {
    groupId: g,
    description: 'x',
    amountPaise: 10000,
    date: '2026-09-10',
    categoryId: null,
    splitMethod: 'exact',
    note: null,
    payers: [{ personId: me, paise: 10000 }],
    shares: [{ personId: b, paise: 10000, input: 10000 }],
  });
  // B pays you back, so B is square and may leave.
  const s = recordSettlement(db, { groupId: g, from: b, to: me, amountPaise: 10000, date: '2026-09-11', note: null });
  updateGroup(db, g, { name: 'Trip', icon: null, simplifyDebts: true, memberIds: [] });

  deleteExpense(db, e);
  console.log(allSync(netsQuery(db, g))); // [{ personId: me, -10000 }, { personId: B, +10000 }]: B is owed ₹100

  deleteSettlements(db, [s]);
  console.log(allSync(netsQuery(db, g))); // []
  sqlite.close();
});
```
