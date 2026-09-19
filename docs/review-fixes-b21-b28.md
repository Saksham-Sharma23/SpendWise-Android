# Review fixes B21–B28: status and how to test

Branch `fix/review-b21-b28`, 26 files changed, **not committed**. The bugs are described in
[`code-review-2026-09-19.md`](code-review-2026-09-19.md).

## Status

Already passed (`npm run verify`, 19 Sep, before the session ended):

| Check                     | Result               |
| ------------------------- | -------------------- |
| Typecheck (app and tests) | ✅ Clean             |
| Lint                      | ✅ Clean, 0 warnings |
| Lint self-test            | ✅ 5/5 rules fire    |
| Formatting (Prettier)     | ✅ Clean             |
| Tests (Jest)              | ⬜ **Not run yet**   |
| Release permission policy | ⬜ **Not run yet**   |
| Phone check for B22       | ⬜ **Not done yet**  |

## What changed

| Bug     | Fix                                                                                                                                                                                                                                      | New tests |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **B21** | Deleting or editing a group expense, or deleting a settlement, is refused when it names someone who has left the group. The expense form explains why and closes. Undoing a group delete is refused if a member was removed as a friend. | 8         |
| **B22** | Screen reads use their own read-only (`query_only`) connection to the database file. `closeConnection()` closes both connections.                                                                                                        | —         |
| **B23** | Budgets show the real reset day (the day after the cycle ends). The last day reads "Last day", not "Resets today".                                                                                                                       | 3         |
| **B24** | "Empty" in Recently deleted removes every row, not just the 500 listed. The dialog shows the real total.                                                                                                                                 | 3         |
| **B25** | Retention and "days left" count local days, not UTC dates (fixes up to 5½ hours off in IST). Tests use local times, so they pass in any timezone.                                                                                        | 4         |
| **B26** | A category merge is refused if it would put expenses, subscriptions, group expenses or a budget on an income-only category, or income on an expense-only one.                                                                            | 6         |
| **B27** | The boot-failure "Share a copy" uses `VACUUM INTO`, so recent changes still in the WAL are included. Old share copies are deleted at the next good launch.                                                                               | 1         |
| **B28** | One group's screen queries only that group and its people. The expense form looks up its group once, not on every render.                                                                                                                | 2         |
| **B29** | When two identical screen reads start together, the second one's prepared statement is now thrown away and finalized, instead of overwriting (and leaking) the first one's cached statement.                                             | 2         |
| **B30** | The CSV formula guard also covers a leading tab or carriage return (OWASP list).                                                                                                                                                         | 2         |

## Commands

Run from `D:\Projects\SpendWise_Android`, in PowerShell or Git Bash.

### 1. Only the tests for these fixes (under a minute)

Covers B21, B23, B24, B25, B26, B28, B29 and B30:

```bash
npx jest features/groups/__tests__/writes.test.ts features/budgets/__tests__/progress.test.ts features/transactions/__tests__/recentlyDeleted.test.ts db/__tests__/retention.test.ts features/categories/__tests__/mutations.test.ts db/__tests__/read.test.ts features/transactions/__tests__/csv.test.ts
```

### 2. The full test suite (about 7 minutes)

Includes the B27 test in `db/__tests__/migrations.test.ts`, which is slow because it builds 50k-row fixtures:

```bash
npx jest
```

### 3. Everything CI runs (about 8 minutes)

Typecheck, lint, lint self-test, formatting, all tests and the release policy:

```bash
npm run verify
```

### Lower memory use

On 8 GB of RAM, add `--maxWorkers=2` to either Jest command. It's slower but runs 2 workers instead of 7:

```bash
npx jest --maxWorkers=2
```

## Phone check for B22

The tests can't cover B22, because they run without Android's SQLite module. With a dev build on the phone:

- [ ] Open Home, Transactions, Insights and a group; each loads normally
- [ ] Add a transaction, then delete it; the screens update each time
- [ ] Dev harness → run the benchmark; it completes
- [ ] (Optional) Boot-failure screen → "Start fresh" still works

## When it all passes

```bash
git add -A
git commit -m "Fix B21–B28 from the 2026-09-19 review"
git push -u origin fix/review-b21-b28
```

Then open a pull request into `main` on GitHub and merge it once CI is green.
