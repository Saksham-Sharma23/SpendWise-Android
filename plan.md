# SpendWise Android — Improvement Plan

> **What this is:** the complete, task-by-task plan for turning SpendWise Android from a working personal
> project into a codebase that someone else can pick up and work on safely. Every bug, architecture
> problem and repo problem found in the 17 Sep 2026 review is here, split into tasks you can do one at a
> time. Each task card holds **everything you need to do that task**, so you don't have to cross-reference.
>
> **Related docs:** [`TASKS.md`](TASKS.md) is the short status board (tick there too) ·
> [`docs/architecture-review-2026-09-17.md`](docs/architecture-review-2026-09-17.md) has the evidence ·
> [`CLAUDE.md`](CLAUDE.md) has the conventions.
>
> **Written:** 2026-09-17, against commit `7f69c5c` plus the uncommitted F5 batch in the working tree.
> Line numbers are from that state; they will shift as tasks land, so search for the quoted code.

---

## Contents

1. [How to use this plan](#1-how-to-use-this-plan)
2. [Where the project stands](#2-where-the-project-stands)
3. [The target architecture](#3-the-target-architecture)
4. [Task index](#4-task-index)
5. [Phase R0 — Stabilise the repo](#phase-r0--stabilise-the-repo)
6. [Phase R1 — Correctness bugs](#phase-r1--correctness-bugs)
7. [Phase R2 — Guard rails](#phase-r2--guard-rails)
8. [Phase R3 — One data layer](#phase-r3--one-data-layer)
9. [Phase R4 — UI kit and thin routes](#phase-r4--ui-kit-and-thin-routes)
10. [Phase 7 — Backup & restore](#phase-7--backup--restore)
11. [Phase 8 — Native layer](#phase-8--native-layer)
12. [Phase R5 — Performance](#phase-r5--performance)
13. [Phase R6 — Observability and release ops](#phase-r6--observability-and-release-ops)
14. [Gate — Sheets readiness](#gate--sheets-readiness)
15. [Phase 6A / 6B — Sheets](#phase-6a--6b--sheets)
16. [Phase 9 — Hardening & Play Store](#phase-9--hardening--play-store)
17. [Device verification (DV)](#device-verification-dv)
18. [Backlog](#backlog-v11)
19. [Appendix — rules every task follows](#appendix--rules-every-task-follows)

---

## 1. How to use this plan

- **Work in the order of the task index.** The order is deliberate (see §2, *Why this order*).
- **One task = one commit. One batch (e.g. R1-A) = one PR.** Don't mix a file move with a behaviour
  change in the same commit.
- **Each task card has the same fields:**

  | Field | Meaning |
  |---|---|
  | **ID / Review ref** | Task ID in this plan · the review's ID (`B` bug, `A` architecture, `T` tooling) |
  | **Priority** | P0 must do now · P1 before new features · P2 before release · P3 nice to have |
  | **Est.** | Working time, including tests |
  | **Depends on** | Tasks that must land first |
  | **Problem** | What is wrong today, with file, line and the current code |
  | **Why it matters** | The concrete user- or developer-visible failure |
  | **Fix** | The steps |
  | **Tests** | The test that must fail before the fix and pass after it |
  | **Done when** | The checkable finish line |

- **Ticking:** change `⬜` to `✅` in the index (§4) and in the card heading when *Done when* is true.
  "Code complete" and "verified on the phone" are separate: device checks go in [DV](#device-verification-dv).
- **Found something new mid-task?** Add it to that phase's *Discovered* list, don't silently fix it in an
  unrelated commit.
- **Before every commit:** `npx tsc --noEmit && npx jest` (≈5 min; 478 tests today). From R2 on, also
  `npm run lint`.

---

## 2. Where the project stands

### Verdict

**The foundations are strong.** `db/` is careful (typed boot outcomes, snapshot before migrating,
migrations with foreign keys off, a test against a populated 50k-row database, a reopenable connection,
`writeTx` that refuses async callbacks). Money is integer paise end to end. The risky arithmetic
(cycle windows, renewals, splits, debt simplification) is pure and heavily tested. `tsc` is clean, 478
tests in 35 suites pass, and no feature imports another.

**What stops it being hand-over ready:**

| # | Problem | Review ref | Fixed by |
|---|---|---|---|
| 1 | Every feature is structured differently: four data-access patterns; routes from 5 to 469 lines | A1, A4 | R3, R4 |
| 2 | The same query exists in 2–3 places, and copies have drifted (that's what caused B1/B2) | A2, A3 | R3 |
| 3 | No UI kit: 332 inline `fontFamily` styles in 45 files; `Label`/`RoundButton`/`ErrorText` redefined per form | A5 | R4 |
| 4 | Rules are enforced by memory: no ESLint installed (`npm run lint` fails), no CI, no README, no formatter | T1, T2 | R0, R2 |
| 5 | Docs drifted from code; three trackers | T3, T5 | Done 2026-09-17 |
| 6 | 20 correctness bugs; none destroys data, several show wrong numbers | B1–B20 | R1, R3, R4, R5 |
| 7 | **No backup/restore: a factory reset loses everything** | — | Phase 7 |

### What is built vs left

| Area | State |
|---|---|
| Phases 0–5 (foundations → analytics), Groups, fix phases F0–F3, F5 | ✅ Code complete · 🟡 device checks open ([DV](#device-verification-dv)) |
| Performance (old TASKS2 F4) | 🟡 2 of 7 done → R5 |
| Tooling (old TASKS2 F6) | ⬜ → R2 |
| Backup & restore (7) | ⬜ only `db/encryptedCopy.ts` and backup rules exist |
| Native layer (8) | ⬜ |
| Sheets (6A/6B) | ⬜ designed in [`docs/design/sheets.md`](docs/design/sheets.md) |
| Hardening & Play (9) | ⬜ |

### Why this order

**R0 → R1 → R2 → R3 → R4 → 7 → 8 → R5 → R6 → Gate → 6A → 6B → 9**

1. **R0 first:** 32 modified files exist only on one disk. Commit them before anything else.
2. **R1 before refactoring:** fix bugs while the code is where the review found it, with tests that lock
   the right behaviour in. The refactor then has to keep those tests green.
3. **R2 before R3/R4:** lint boundaries and the `@/` alias make the big file moves safe.
4. **R3/R4 before 7 and 6A:** Backup and Sheets are the two largest new features. Write them once, in the
   target layout, instead of porting them afterwards.
5. **7 before 6A:** a factory reset loses everything today. Protect the data the app already holds
   before adding a new way to bring data in.

**Remaining effort: ~34–40 working days.** R0–R6 ≈ 12½ days; 7 ≈ 3–4; 8 ≈ 3–4; 6A ≈ 7–8; 6B ≈ 4–5; 9 ≈ 4–5.
No R-phase changes the database schema.

---

## 3. The target architecture

Same stack, same locked decisions. **This is a reorganisation, not a rewrite.**

### Layers and import direction

```
app/  →  features/  →  components/ | data/  →  db/  →  lib/
```

| Layer | May import | Must never import |
|---|---|---|
| `app/` (routes) | `features/*` (via `index.ts`), `components/layout` | `db/` (except `app/_layout.tsx` for boot), SQL |
| `features/<x>/` | `components/`, `data/`, `db/`, `lib/` | any other `features/<y>/` |
| `data/` (shared queries) | `db/`, `lib/` | `features/`, `components/`, React Native UI |
| `components/` | `lib/`, `components/` | `features/`, `data/`, `db/client` |
| `db/` | `lib/` | `features/`, `components/`, `data/` |
| `lib/` | `lib/` | everything above; keep pure modules free of React Native so Node tests load them |

### Folder layout

```
app/                         ROUTES ONLY. Read params, render one screen. ≤ ~20 lines each.
features/<feature>/
  index.ts                   public surface: screens + hooks routes may use
  screens/                   full screens and modal screens (moved out of app/)
  components/                pieces only this feature uses
  data/
    sql.ts                   read builders: take `db: AnyDb` → tests run the shipped SQL
    writes.ts                write cores: take `db: SyncDb`, use writeTx, throw UserFacingError
    hooks.ts                 useDbQuery hooks binding sql.ts to readDb
    actions.ts               safeWrite-wrapped writes bound to the app db (what screens call)
  domain/                    pure logic: no db, no React Native
  schema.ts                  zod form schemas
  __tests__/
data/                        NEW: shared data access below features
  ledger.ts                  income/expense sums, month trend, category totals, budget spend
  categories.ts              live category list + useCategories(kind?)
  meta.ts                    app_meta get/set
components/
  ui/                        Text, Button, IconButton, Chip, Field, FormModal, Section, StatFigure, Card…
  charts/                    presentational charts + geometry.ts
  layout/                    Screen, TabBar, ThemeProvider, glass
db/
  types.ts                   NEW: one SyncDb / AnyDb type
  dev/                       devSeed.ts, benchmark.ts (moved)
  …                          connection, client, read, tx, schema, migrations, boot, retention, files
lib/                         pure utilities + lib/db runtime (useDbQuery, safeWrite, errors)
```

### Three rules that remove most of the inconsistency

1. **One data rule:** SQL lives only in `data/*.ts` or `features/*/data/sql.ts` + `writes.ts`. Builders take
   `db` as a parameter.
2. **One error rule:** writes throw `UserFacingError` for rule violations and raw errors for bugs.
   `actions.ts` wraps each write in `safeWrite`, **the only thing that toasts a failure**. Screens toast
   success and decide whether to close.
3. **One styling rule:** layout and spacing through NativeWind classes; text through `<Text variant>`; raw
   colours only via `useColors()` where a value is dynamic (charts, animated styles).

### Worked example (budgets, after R3/R4)

`app/budgets/index.tsx` (3 lines) → `features/budgets/screens/BudgetList.tsx` →
`features/budgets/data/hooks.ts` `useBudgets(today)` → `data/ledger.ts` `budgetSpend(db, windows)` +
`features/budgets/domain/progress.ts`. Home's budget card calls the **same** `budgetSpend` and the same
`WARNING_RATIO`, so there is one query and one threshold.

---

## 4. Task index

Status: ⬜ not started · 🟡 in progress · ✅ done

| ID | Task | Ref | Pri | Est | Status |
|---|---|---|---|---|---|
| **R0** | **Stabilise the repo** | | | **½ d** | 🟡 4 of 7 |
| R0-1 | Commit the F5 batch, move to `main` | T8 | P0 | 1 h | ✅ |
| R0-2 | `.gitattributes`, `.editorconfig`, `.nvmrc` | T2 | P1 | 30 m | ✅ |
| R0-3 | Write `README.md` | T2 | P1 | 1 h | ⬜ |
| R0-4 | Remove unused dependencies | T6 | P1 | 1 h + build | ⬜ |
| R0-5 | Fix misleading comments | T4 | P1 | 30 m | ✅ |
| R0-6 | Delete empty placeholder folders | T3 | P2 | 5 m | ✅ |
| R0-7 | Consolidate trackers, move designs out of CLAUDE.md | T3, T5 | — | — | ✅ |
| **R1** | **Correctness bugs** | | | **1½ d** | ✅ done 2026-09-17 |
| R1-1 | Bound "top categories" (and Home trend) to the month | B1 | P0 | 1 h | ✅ |
| R1-2 | Bound analytics ranges at the current month | B2 | P0 | 1½ h | ✅ |
| R1-3 | Exact yearly subscription cost | B3 | P0 | 1 h | ✅ |
| R1-4 | Category merge/delete handles `split_expenses` | B4 | P0 | 2 h | ✅ |
| R1-5 | One amount limit (₹10 crore) | B5 | P1 | 1 h | ✅ |
| R1-6 | `formatINRCompact` rounds before choosing a unit | B6 | P1 | 45 m | ✅ |
| R1-7 | Ledger "Try again" actually re-runs | B7 | P1 | 1½ h | ✅ |
| R1-8 | FK violation after migrating stays a hard failure | B8 | P0 | 3 h | ✅ |
| R1-9 | Ledger month headers repaint on theme change | B9 | P2 | 15 m | ✅ |
| R1-10 | Uncategorised colour resolved at render | B10 | P2 | 1 h | ✅ |
| R1-11 | Boot-failure status bar follows the theme | B11 | P2 | 15 m | ✅ |
| R1-12 | `keysFor` chunks instead of truncating | B12 | P2 | 45 m | ✅ |
| R1-13 | Pre-migration snapshot for any user data | B13 | P0 | 1 h | ✅ |
| R1-14 | Group delete/restore respects balances and membership | B14 | P1 | 2 h | ✅ |
| R1-15 | Merge stops hard-deleting budget history | B15 | P2 | 45 m | ✅ |
| R1-16 | `deterministicIcon` matches whole words | B19 | P3 | 1 h | ✅ |
| **R2** | **Guard rails** | | | **1½ d** | |
| R2-1 | ESLint with boundaries and project rules | T1 | P1 | 4 h | ⬜ |
| R2-2 | Prettier + one formatting commit | T1 | P2 | 1 h | ⬜ |
| R2-3 | Type-check tests; align ts-jest with Jest 30 | T1 | P1 | 1½ h | ⬜ |
| R2-4 | Icon-mapping test (the one `lib/icons.ts` cites) | T4 | P2 | 1 h | ⬜ |
| R2-5 | Adopt the `@/` import alias | T7 | P1 | 2 h | ⬜ |
| R2-6 | GitHub Actions CI | T1 | P1 | 2 h | ⬜ |
| R2-7 | `CONTRIBUTING.md` | T2 | P2 | 1 h | ⬜ |
| **R3** | **One data layer** | | | **3 d** | |
| R3-1 | `db/types.ts`: one `SyncDb` / `AnyDb` | A6 | P1 | 2 h | ⬜ |
| R3-2 | `data/meta.ts` | A7 | P1 | 1 h | ⬜ |
| R3-3 | `data/categories.ts` + `useCategories` | A3 | P1 | 2 h | ⬜ |
| R3-4 | `data/ledger.ts` shared aggregates | A2 | P1 | 4 h | ⬜ |
| R3-5 | Move dev tools to `db/dev/` | A7 | P2 | 30 m | ⬜ |
| R3-6 | `useDbQuery`: `refetch()` and entity-change reset | B7, A1 | P1 | 2 h | ⬜ |
| R3-7 | transactions → standard layout (+ keyset export) | A1, B17 | P1 | 4 h | ⬜ |
| R3-8 | dashboard + analytics → `data/ledger.ts` | A1, A2 | P1 | 3 h | ⬜ |
| R3-9 | budgets → standard layout | A1, A2 | P1 | 2 h | ⬜ |
| R3-10 | tracker → standard layout | A1 | P2 | 1½ h | ⬜ |
| R3-11 | categories → standard layout, `UserFacingError` | A1 | P1 | 2 h | ⬜ |
| R3-12 | groups → standard layout, no toasts in data | A1, A2, A6 | P1 | 3 h | ⬜ |
| **R4** | **UI kit and thin routes** | | | **3 d** | |
| R4-1 | `Text` with variants and tones | A5 | P1 | 3 h | ⬜ |
| R4-2 | `Button`, `IconButton`, `Chip`, `Section`, `StatFigure`, `Field` | A5 | P1 | 4 h | ⬜ |
| R4-3 | `FormModal` + `useSubmitOnce` | A4, A5 | P1 | 3 h | ⬜ |
| R4-4 | Move screens out of `app/` | A4, A7 | P1 | 4 h | ⬜ |
| R4-5 | Renames: `TrendChart` card; "Activity" label; dev harness number format | A5, B20 | P2 | 1 h | ⬜ |
| R4-6 | Migrate every screen to the kit | A5 | P1 | 1 d | ⬜ |
| R4-7 | `DatePickerSheet` for subscription and group expense dates | — | P2 | 1½ h | ⬜ |
| **7** | **Backup & restore** | | | **3–4 d** | |
| P7-1 … P7-9 | Export `.db`, passphrase, `.json`, validated restore, snapshot + swap, restore from boot failure, storage info, history, tests | — | P0 | | ⬜ |
| **8** | **Native layer** | | | **3–4 d** | |
| P8-1 … P8-10 | Channels, permission, renewals, budget alerts, backup nudge, reboot, widget, FAB menu, biometric lock, haptics | — | P1 | | ⬜ |
| **R5** | **Performance** | | | **2 d** | |
| R5-1 | `AnimatedAmount` off React state | B16 | P2 | 3 h | ⬜ |
| R5-2 | `formatINR` always manual grouping | B18 | P2 | 1 h | ⬜ |
| R5-3 | Search without `lower()` | — | P3 | 1 h | ⬜ |
| R5-4 | Measure swipeables and tab-bar blur | — | P2 | 3 h | ⬜ |
| R5-5 | Record on-device timings; close the rollup decision | — | P2 | 2 h | ⬜ |
| **R6** | **Observability and release ops** | | | **1 d** | |
| R6-1 | Local crash log | T9 | P1 | 4 h | ⬜ |
| R6-2 | Release runbook | — | P2 | 1 h | ⬜ |
| R6-3 | Migrations runbook | — | P2 | 1 h | ⬜ |
| R6-4 | Remove `legacyEncryption` + `expo-secure-store` | — | P3 | 1 h | ⬜ |
| **Gate** | **Sheets readiness** (6 checks) | — | P1 | — | ⬜ |
| **6A / 6B** | **Sheets** | — | P2 | 11–13 d | ⬜ |
| **9** | **Hardening & Play Store** (P9-1 … P9-7) | — | P2 | 4–5 d | ⬜ |

---

## Phase R0 — Stabilise the repo

**Goal:** a clean starting point that someone else can clone and understand. **Est:** ½ day.
**Done when:** `git status` is clean on `main`; `npm ci && npx tsc --noEmit && npx jest` pass on a fresh
clone; the README gets a new person to a running dev build.

### ✅ R0-1 — Commit the F5 batch and move work to `main`  *(done 2026-09-17)*
**Ref:** T8 · **Priority:** P0 · **Est:** 1 h · **Depends on:** nothing

**Problem.** Work happens on `master`, the default branch is `main`, and the entire F5 batch is
uncommitted: 32 modified files plus new ones (`db/retention.ts`, `lib/calendar.ts`, `lib/motion.ts`,
`lib/themeCss.ts`, `components/ui/DatePickerSheet.tsx`, `components/ui/Swap.tsx`,
`features/transactions/components/RecentlyDeleted.tsx`, `app/settings/recently-deleted.tsx`,
`scripts/gen-theme-css.ts` and their tests). `AGENTS.md` is deleted in the working tree but not staged.
The docs rewrite from 2026-09-17 is staged.

**Why it matters.** That work exists on one disk only. A branch diverging from the default is how work
gets lost or merged wrongly.

**Fix.**
1. Run `npx tsc --noEmit && npx jest` on the working tree. Must be green.
2. Decide on `AGENTS.md`: it holds an "Expo has changed — read the v57 docs" note. Either restore it
   (`git restore AGENTS.md`) or fold that line into CLAUDE.md *Read this first* and delete it deliberately.
3. Commit in **two commits** so history stays readable:
   - `F5: date picker, recently deleted + 30-day purge, generated theme CSS, motion` (code)
   - `Docs: architecture review, one tracker, design docs, history archive` (docs + this plan)
4. Bring `master` into `main`: `git checkout main && git merge --ff-only master` (or a normal merge if
   `main` has diverged; inspect `git log main..master` and `git log master..main` first).
5. Push `main`. From now on: branch per batch (`r1-a-wrong-numbers`), PR into `main`.
6. Delete `master` locally and on the remote once `main` contains everything.

**Tests.** Existing suite green before and after.

**Done when:** `git status` is clean, `git log main` contains both commits, and no work happens on `master`.

**Outcome (2026-09-17).** `main` did **not** exist and the repo has **no remote**, so steps 4–6 became a
plain `git branch -m master main`. Committed as three commits, not two (`b29f79a` F5 code, `173b303` docs,
`ead7d44` R0-2/R0-5/R0-6). `AGENTS.md` was deleted and its one instruction (read the versioned Expo docs)
moved into CLAUDE.md *Read this first*. Tests green before and after (478 in 35 suites).
**Still open — not covered by this task:** the repo is local-only. A disk failure loses all history. Add a
remote (a private GitHub repo) before R2-6, which needs one for CI anyway.

### ✅ R0-2 — Line endings, editor settings and Node version  *(done 2026-09-17)*
**Ref:** T2 · **Priority:** P1 · **Est:** 30 m · **Depends on:** R0-1

**Problem.** No `.gitattributes`, `.editorconfig` or `.nvmrc`. Every git command warns
`LF will be replaced by CRLF` on ~30 files (Windows checkout).

**Why it matters.** Line-ending churn produces whole-file diffs that hide real changes in review. A new
contributor doesn't know which Node version to use.

**Fix.**
1. `.gitattributes`:
   ```
   * text=auto eol=lf
   *.png binary
   *.jpg binary
   *.ttf binary
   *.db binary
   *.jar binary
   ```
2. `.editorconfig`: `root = true`; `[*]` `charset = utf-8`, `end_of_line = lf`, `indent_style = space`,
   `indent_size = 2`, `insert_final_newline = true`, `trim_trailing_whitespace = true`; `[*.md]`
   `trim_trailing_whitespace = false`.
3. `.nvmrc`: `22`. Add `"engines": { "node": ">=22 <23" }` to `package.json`.
4. Renormalise in its **own** commit: `git add --renormalize . && git commit -m "Normalise line endings"`.

**Done when:** `git status` after a fresh checkout shows no CRLF warnings, and the renormalise commit
contains no content changes (`git diff --ignore-all-space HEAD~1` is empty).

**Outcome (2026-09-17).** Step 4 was a no-op: `git add --renormalize .` staged **zero** files, because the
repository already stored LF and only the Windows *working copy* had CRLF. `.gitattributes` stops that
drift from reaching the index in future. Also added `engines: { node: ">=22 <23" }` to `package.json`.

### ⬜ R0-3 — Write `README.md`
**Ref:** T2 · **Priority:** P1 · **Est:** 1 h · **Depends on:** R0-1

**Problem.** There is no README. `CLAUDE.md` is an agent context file (long and dense), and
`docs/run-on-phone.md` is detailed troubleshooting. A human has no one-page entry point.

**Fix.** A README of about one screen with these sections:
1. **What it is** (3 lines): offline Android expense tracker; all data in SQLite on the phone; zero network.
2. **Prerequisites:** Node 22, JDK 17, Android SDK + `adb`, one physical Android phone with wireless
   debugging. Expo Go does not work (SQLCipher, MMKV).
3. **Quick start:** `npm ci` → `adb connect <ip>:<port>` → `npm run android:local` → `npm start`.
   Link `docs/run-on-phone.md` for problems.
4. **Test:** `npx tsc --noEmit && npx jest` (~5 min; migration tests build 50k-row fixtures).
5. **Build a release APK:** `rm -rf android` → `npm run prebuild` → `npm run build:release-apk` (runs `verify:apk`).
6. **Project map:** the layer diagram from §3 in 6 lines, and a link to CLAUDE.md *Architecture*.
7. **Docs:** a table linking TASKS.md, plan.md, the review, `docs/design/`, `docs/history/`.
8. **Licence** (a `LICENSE` file exists).

**Done when:** someone who has never seen the repo can get a dev build on a phone using only the README
and the linked run-on-phone doc.

### ⬜ R0-4 — Remove unused dependencies
**Ref:** T6 · **Priority:** P1 · **Est:** 1 h + a native build · **Depends on:** R0-1

**Problem.** These packages have **zero imports** in `app/`, `features/`, `components/`, `db/`, `lib/`:

| Package | Kind | Re-add in |
|---|---|---|
| `date-fns` | JS | never (`lib/dates.ts` covers it) |
| `@gorhom/bottom-sheet` | JS (depends on Reanimated/GH) | never (`formSheet` + `DatePickerSheet` cover it) |
| `expo-crypto` | native, autolinked | Phase 7 only if hashing is needed |
| `expo-document-picker` | native, autolinked | Phase 7 restore / 6A import |
| `expo-local-authentication` | native, autolinked | Phase 8 biometric lock |

**Why it matters.** Native modules are autolinked into every APK, add size, and can contribute manifest
permissions (`USE_BIOMETRIC`, `USE_FINGERPRINT`) that end up in the release unless blocked.

**Fix.**
1. Re-verify zero imports: search for each package name in `app features components db lib scripts plugins`.
2. `npm uninstall date-fns @gorhom/bottom-sheet expo-crypto expo-document-picker expo-local-authentication`.
3. Remove any matching config-plugin entries from `app.config.ts`, and any now-unneeded `blockedPermissions`
   entries that only existed for them (keep the list otherwise).
4. Update CLAUDE.md *Stack* (drop the "Unused" row).
5. **This is a native change:** `rm -rf android` → `npm run prebuild:dev` → `npm run android:local`; then
   a release build and `npm run verify:apk`.

**Tests.** `npx tsc --noEmit && npx jest`; the app launches on the phone; `verify:apk` passes.

**Done when:** none of the five appear in `package.json`, and the release APK's permission list is
unchanged or smaller.

### ✅ R0-5 — Fix misleading comments  *(done 2026-09-17)*
**Ref:** T4 · **Priority:** P1 · **Est:** 30 m · **Depends on:** R0-1

**Problem.** Comments that state things that aren't true:

| File | Says | Truth | Change to |
|---|---|---|---|
| `lib/icons.ts:10` | a test in `components/ui/__tests__` keeps `MAPPED_ICON_NAMES` in sync | that test doesn't exist | "Kept in sync by `lib/__tests__/icons.test.ts`" once R2-4 lands; until then "NOT checked by a test yet (R2-4)" |
| `drizzle.studio.config.ts` | the device DB is encrypted | unkeyed since 2026-09-14 | "The main DB is unkeyed; open the pulled file directly" |
| `lib/theme.ts:7` | hand-sync `global.css` | generated by `npm run theme:css`, test-enforced | "Run `npm run theme:css` after changing a palette" |
| `features/dashboard/queries.ts` header, `features/transactions/queries.ts` (`transactionQueries` comment) | builders are shared with `features/devtools/benchmark.ts` | the file is `db/benchmark.ts` | point at `db/benchmark.ts` (and `db/dev/benchmark.ts` after R3-5) |
| `features/categories/mutations.ts:163` | a soft-deleted budget holds the unique slot | the index is partial since migration 0001 | removed by R1-15; leave a note until then |

**Done when:** each row is corrected; grep for `features/devtools` returns only planned-future references.

### ✅ R0-6 — Delete empty placeholder folders  *(done 2026-09-17)*
**Ref:** T3 · **Priority:** P2 · **Est:** 5 m

**Problem.** `features/backup/`, `features/import/` and `lib/notifications/` exist but hold nothing
(git doesn't track empty folders, so they're local noise that suggests code that isn't there).

**Fix.** Delete them. Recreate `features/backup/` in Phase 7, `features/sheets/` in 6A, and
`features/notifications/` (not `lib/`) in Phase 8.

**Done when:** the folders are gone and CLAUDE.md's layout no longer lists them.

### ✅ R0-7 — Consolidate trackers and move designs out of CLAUDE.md
**Ref:** T3, T5 · Done 2026-09-17. TASKS.md is the one tracker; `TASKS2.md` and the old Phase 0–5 tracker
are in `docs/history/`; Sheets and Backup/Native designs are in `docs/design/`; CLAUDE.md rewritten to
match the code.

**R0 Discovered:** *(add here)*

---

## Phase R1 — Correctness bugs

**Goal:** every figure on screen is right. **Est:** 1½ days. **No schema change.**
**Rule for every task:** write the test first, watch it fail, then fix.
**Done when:** each task has a failing-then-passing test and `npx jest` is green.

Batches (one PR each): **R1-A wrong numbers** (R1-1 … R1-6) · **R1-B interactions** (R1-7 … R1-12) ·
**R1-C data safety** (R1-13 … R1-16).

---

### Batch R1-A — Wrong numbers

### ✅ R1-1 — Bound "top categories" (and the Home trend) to the month
**Ref:** B1 · **Priority:** P0 · **Est:** 1 h · **Depends on:** nothing

**Problem.** `features/dashboard/queries.ts` (~line 182), `topCategoriesQuery` filters only a lower bound:
```ts
.where(and(isNull(transactions.deletedAt), eq(transactions.type, 'expense'),
           gte(transactions.date, startOfMonth(today))))
```
The month overview on the same screen bounds by `nextStart` (the first day of next month). The date
picker allows dates up to a year ahead. The Home `trendQuery` just above it has the same shape
(`gte(transactions.month, firstKey)` with no upper bound).

**Scenario.** Add a ₹5,000 expense dated next month. Home's "Where it went" and the Insight banner's
share (`lib/insight.ts`) count it, but "Spent this month" doesn't. A category's share can exceed 100%.

**Fix.**
1. In `topCategoriesQuery` add `lt(transactions.date, addMonthsClamped(startOfMonth(today), 1))`
   (use the same helper the month overview uses to compute `nextStart`, so both agree by construction).
2. In the Home `trendQuery` add `lte(transactions.month, today.slice(0, 7))`.
3. Better still (and this is what R3-4 does): make both queries filter on the generated `month` column
   (`eq(transactions.month, currentMonth)`) so they use the `tx_month_idx` partial index.

**Tests.** The dashboard builders currently close over `readDb`, so they can't be run on better-sqlite3.
Either (a) do the R3 change for just these two builders now (take `db` as a parameter), or (b) add a test
in `features/dashboard/__tests__/` after R3-8. **Preferred: (a).** Test: seed an expense this month
(₹1,000) and one next month (₹5,000) → top categories total = ₹1,000; the month overview's expense = ₹1,000;
sum of shares ≤ 100%.

**Done when:** a future-dated expense changes neither Home number until its month arrives.

### ✅ R1-2 — Bound analytics ranges at the current month
**Ref:** B2 · **Priority:** P0 · **Est:** 1½ h · **Depends on:** nothing

**Problem.** `features/analytics/sql.ts`:
- `trendQuery(db, firstMonth)`, line 34: `.where(and(live, gte(transactions.month, firstMonth)))`
- `totalsQuery(db, firstMonth)`, line 48: same
- `biggestExpenseQuery(db, firstMonth)`, line 83: same plus `type = 'expense'`
- `categoryTotalsQuery(db, fromMonth, toMonth, limit?)`, line 92: **already** bounded, which is why the
  screen disagrees with itself.

**Scenario.** A transaction dated next month is counted in the period totals, avg/day, savings rate and
"biggest expense", but the trend chart's gap-filling drops that month. The cards and the chart disagree.

**Fix.**
1. Change the three signatures to `(db, fromMonth, toMonth)` and add `lte(transactions.month, toMonth)`.
2. Update the callers in `features/analytics/queries.ts` to pass `currentMonth` (derived from `useToday()`).
3. Update the dev benchmark (`db/benchmark.ts`) calls.
4. Check `earliestDateQuery` (line 55): it's used for "days in range" in avg/day; confirm it ignores future
   rows too (`lte(date, today)`), or avg/day's denominator is also wrong.

**Tests.** In `features/analytics/__tests__/sql.test.ts`: seed rows in the window plus one next month →
`totalsQuery`, `trendQuery` and `biggestExpenseQuery` all exclude it; the sum of `trendQuery` months
equals `totalsQuery`. That second assertion is the one that prevents drift in future.

**Done when:** for any data, the sum of trend points equals the totals card.

### ✅ R1-3 — Exact yearly subscription cost
**Ref:** B3 · **Priority:** P0 · **Est:** 1 h · **Depends on:** nothing

**Problem.** `features/tracker/renewal.ts:52-61`:
```ts
const monthlyCostPaise = toMonthlyPaise(row.amountPaise, row.billingCycle); // yearly: Math.round(amount / 12)
// ×12 of the monthly equivalent, not ×12 of the charge: a yearly
// subscription's yearly cost is the charge itself.
yearlyCostPaise: monthlyCostPaise * 12,
```
and `summarise` (~line 134): `yearlyTotalPaise: monthlyTotalPaise * 12`.
`toMonthlyPaise` (`lib/dates.ts:258`) rounds: yearly `/12`, quarterly `/3`, weekly `×52/12`.

**Scenario.** ₹1,499/year = 149900 paise → `round(149900/12)` = 12492 → ×12 = **149904** → shows
₹1,499.04/year. The comment says the opposite of what the code does. This is float-style drift in an app
that stores integer paise precisely to avoid it.

**Fix.**
1. Add `toYearlyPaise(amountPaise, cycle)` to `lib/dates.ts` next to `toMonthlyPaise`:
   `weekly → amount × 52`, `monthly → amount × 12`, `quarterly → amount × 4`, `yearly → amount`. No rounding.
2. `enrich`: `yearlyCostPaise: toYearlyPaise(row.amountPaise, row.billingCycle)`; fix the comment.
3. `summarise`: `yearlyTotalPaise` = **sum of each active row's `yearlyCostPaise`**, not `monthlyTotal × 12`.
4. The monthly figure stays rounded (it is a display equivalent); document that "monthly = rounded
   equivalent; yearly = exact".

**Tests.** `lib/__tests__/dates.test.ts`: `toYearlyPaise` for all four cycles.
`features/tracker/__tests__/renewal.test.ts`: ₹1,499/yr → `yearlyCostPaise === 149900`; ₹199/quarter →
79600; ₹99/week → 514800; summary of those three → the exact sum.

**Done when:** a yearly plan's yearly cost equals its charge, to the paisa.

### ✅ R1-4 — Category merge and delete also update `split_expenses.category_id`
**Ref:** B4 · **Priority:** P0 · **Est:** 2 h · **Depends on:** nothing

**Problem.** `features/categories/mutations.ts`:
- `mergeCategory` (line 138) moves `transactions` (148), `subscriptions` (149) and `budgets` (158–166).
- `deleteCategory` (line 178) nulls `transactions` (184) and `subscriptions` (185) and soft-deletes budgets (186).

Neither touches **`split_expenses.category_id`**, because Groups was added after this file. The retired
category gets a tombstone name (`tombstoneName` → `"Food ⟨deleted #7⟩"`), and `groupCategoryQuery` in
`features/groups/sql.ts` joins categories **without** a `deleted_at` filter.

**Scenario.** Add a group expense in "Food" → delete "Food" in Categories → group totals show
**"Food ⟨deleted #7⟩"**. Merge "Food" into "Groceries" → the group expense still points at the retired row.

**Fix.**
1. `mergeCategory`: `tx.update(splitExpenses).set({ categoryId: targetId }).where(eq(splitExpenses.categoryId, sourceId)).run();`
2. `deleteCategory`: `tx.update(splitExpenses).set({ categoryId: null }).where(eq(splitExpenses.categoryId, id)).run();`
3. Make sure the "moved/uncategorised" counts shown in the confirm dialog either include group expenses
   or say "transactions" precisely.
4. Defensive: `groupCategoryQuery` should treat a deleted category as uncategorised
   (`leftJoin(categories, and(eq(...), isNull(categories.deletedAt)))`).
5. Check the **restore** path (if a category delete can be undone): whatever it restores, it must restore for
   `split_expenses` too, or it must be documented that undo only restores the category row.

**Tests.** `features/categories/__tests__/mutations.test.ts`:
1. Create a group + expense in category A → delete A → the expense's `category_id` is `null`.
2. Merge A into B → the expense's `category_id` is B.
3. **The guard test:** read every table with a `category_id` column from the schema
   (`SELECT m.name FROM sqlite_master m, pragma_table_info(m.name) p WHERE m.type='table' AND p.name='category_id'`)
   and assert the set equals a list the test keeps next to `mergeCategory`/`deleteCategory`. Adding a new
   table with `category_id` then fails this test until the mutations handle it (CLAUDE.md convention #11).

**Done when:** no screen can show a tombstone name, and the guard test exists.

### ✅ R1-5 — One amount limit: ₹10 crore
**Ref:** B5 · **Priority:** P1 · **Est:** 1 h · **Depends on:** nothing

**Problem.** Four constants, two values:

| File | Constant | Value |
|---|---|---|
| `features/transactions/schema.ts:20` | `MAX_PAISE = 100_00_00_000 * 100` | ₹100 crore |
| `features/budgets/schema.ts:15` | same | ₹100 crore |
| `features/tracker/schema.ts:15` | same | ₹100 crore |
| `features/groups/split.ts:19` | `MAX_EXPENSE_PAISE = 10_00_00_000 * 100` | ₹10 crore |

Comments say the guard catches "a missed decimal point" at ₹10 crore. `100_00_00_000` rupees is 100 crore.

**Why it matters.** The typo guard is 10× looser than documented and differs between the ledger and Groups.

**Fix.**
1. `lib/money.ts`: `export const MAX_AMOUNT_PAISE = 10_00_00_000 * 100; // ₹10 crore — a typo guard, not a business rule`.
2. Replace all four constants with the import. In Groups keep `MAX_EXPENSE_PAISE` only as a re-export if
   removing it causes churn; better to delete it.
3. One message everywhere: `'That amount looks too large'` (budgets currently says "limit"; fine to keep per field).

**Tests.** `lib/__tests__/money.test.ts`: the constant equals 1_000_000_000 paise. Each schema test:
`'100000000'` (₹10 crore) passes, `'100000000.01'` fails.

**Done when:** grep for `MAX_PAISE` and `MAX_EXPENSE_PAISE` finds only `lib/money.ts` (or nothing but `MAX_AMOUNT_PAISE`).

### ✅ R1-6 — `formatINRCompact` rounds before choosing the unit
**Ref:** B6 · **Priority:** P1 · **Est:** 45 m · **Depends on:** nothing

**Problem.** `lib/money.ts:153-161`:
```ts
if (rupees >= 1_00_00_000) return `${sign}₹${(rupees / 1_00_00_000).toFixed(1)}Cr`;
if (rupees >= 1_00_000)    return `${sign}₹${(rupees / 1_00_000).toFixed(1)}L`;
if (rupees >= 1_000)       return `${sign}₹${(rupees / 1_000).toFixed(1)}K`;
```
The unit is picked from the raw value, then `toFixed(1)` rounds up across the boundary.

**Scenario.** ₹99,960 → 99.96K → **"₹100.0K"** instead of "₹1.0L". ₹99,96,000 → **"₹100.0L"** instead of
"₹1.0Cr". ₹999.6 → goes to `formatINR(whole)` → "₹1,000" (acceptable, but should be "₹1.0K" for consistency).

**Fix.** Round to one decimal in the candidate unit first, then promote if it reaches the next unit:
```ts
const units = [[1_00_00_000, 'Cr'], [1_00_000, 'L'], [1_000, 'K']] as const;
for (let i = 0; i < units.length; i++) {
  const [size, suffix] = units[i]!;
  const tenths = Math.round((rupees / size) * 10);
  if (tenths >= 10) {
    const bigger = units[i - 1];
    if (bigger && tenths >= (bigger[0] / size) * 10) return `${sign}₹${(Math.round((rupees / bigger[0]) * 10) / 10).toFixed(1)}${bigger[1]}`;
    return `${sign}₹${(tenths / 10).toFixed(1)}${suffix}`;
  }
}
```
(Or simpler: iterate from smallest unit up and promote while the rounded value ≥ the next unit's ratio.)
Also decide about the ₹999.5–₹999.99 range: round-to-whole gives "₹1,000"; either accept it or treat
`Math.round(rupees) >= 1000` as K.

**Tests.** `lib/__tests__/money.test.ts`: ₹99,949 → "₹99.9K"; ₹99,950 → "₹1.0L"; ₹99,960 → "₹1.0L";
₹99,94,999 → "₹99.9L"; ₹99,96,000 → "₹1.0Cr"; negatives mirror; ₹999 → "₹999".

**Done when:** no output ever reads "100.0" followed by a unit.

---

### Batch R1-B — Interactions

### ✅ R1-7 — Ledger "Try again" actually re-runs the query
**Ref:** B7 · **Priority:** P1 · **Est:** 1½ h · **Depends on:** nothing (R3-6 generalises it)

**Problem.** `features/transactions/components/Ledger.tsx:353`:
`action={{ label: 'Try again', onPress: onRefresh }}`; `onRefresh` (line 123) calls `resetPages()`, which
is `useTransactionPages().reset` (`features/transactions/queries.ts:164`): it bumps `generation`, clears
`older` pages and sets `hasMore`. Page 1 is a `useDbQuery` whose deps are `filterKey`. **If no older pages
were loaded, nothing changes, so nothing re-runs.** `useDbQuery` (`lib/db/useDbQuery.ts:74`) has an
internal `refresh` but doesn't return it.

**Scenario.** The ledger query fails (e.g. a DB hiccup) → error state → "Try again" → nothing happens.
Pull-to-refresh on a loaded ledger has the same no-op for page 1.

**Fix.**
1. `useDbQuery` returns `refetch` (the existing `refresh` callback) in `DbQueryResult<T>`. Keep the
   `latestOnly` ticket so an old answer can't overwrite a newer one.
2. `useTransactionPages` returns `retry = () => { reset(); live.refetch(); }`.
3. `Ledger.tsx`: the error action and pull-to-refresh call `retry`.

**Tests.** `lib/db/__tests__/useDbQuery` has no React test harness today (no component tests). Test the
logic you can in Node: extract the "refresh → latest wins" behaviour if it isn't already covered by
`latestOnly` tests. **Device check:** add to [DV](#device-verification-dv): force a query error in dev
(throw in the builder behind a dev flag) → "Try again" recovers once the flag is off.

**Done when:** "Try again" re-executes page 1 in every state.

### ✅ R1-8 — A foreign-key violation after migrating stays a hard failure
**Ref:** B8 · **Priority:** P0 · **Est:** 3 h · **Depends on:** nothing

**Problem.** `db/migrate.ts:53-65`:
```ts
export async function migrateWithForeignKeysOff(conn, migrate) {
  conn.exec('PRAGMA foreign_keys = OFF');
  try {
    await migrate();                                   // drizzle COMMITS here
    const violations = conn.all('PRAGMA foreign_key_check');
    if (violations.length > 0) throw new ForeignKeyViolationError(violations.length);
  } finally { conn.exec('PRAGMA foreign_keys = ON'); }
}
```
The check runs **after** drizzle has committed. `db/boot.ts` turns the throw into `migration-failed`, but
the migrations are recorded as applied in `__drizzle_migrations`.

**Scenario.** A migration leaves an orphan row → the failure screen appears once → the user taps "Try
again" or relaunches → `pendingMigrations` is empty → boot returns `ready` → the broken state is silently
accepted forever.

**Fix (choose A; B is the stronger long-term option).**
- **A. Persist the failure.** In `migrateWithForeignKeysOff`, on violations write
  `app_meta('integrity_failed', '<count>@<nowISO>')` before throwing. In `bootDatabase`, before returning
  `ready`, check that key: if set, re-run `PRAGMA foreign_key_check`; if violations remain, return
  `migration-failed` again (with the snapshot path); if they are gone (e.g. a later fix migration cleaned
  them), delete the key and continue. Add `integrity_failed` to `META_KEYS`.
- **B. Check before commit.** Run pending migrations inside our own `BEGIN … foreign_key_check … COMMIT`
  (reading the bundled SQL and journal the way `pendingMigrations` already does) and `ROLLBACK` on
  violations. More code, but the database is never left migrated-but-broken.

Either way, the boot-failure screen must offer: share a copy, restore the pre-migration snapshot
(Phase 7 builds the restore), start fresh.

**Tests.** `db/__tests__/migrate.test.ts`: a fixture with an orphan that the migration exposes (e.g. insert
a transaction with a `category_id` that doesn't exist while FKs are off) → first boot → `migration-failed`;
**second boot → still `migration-failed`**; delete the orphan → third boot → `ready` and the meta key is gone.

**Done when:** the second-launch test passes.

### ✅ R1-9 — Ledger month headers repaint on theme change
**Ref:** B9 · **Priority:** P2 · **Est:** 15 m

**Problem.** `features/transactions/components/Ledger.tsx:169-195`: `renderItem` uses
`colors.background` and `colors.muted` for month headers, but its deps are
`[openRow, deleteOne, toggleSelect, selected, selectionMode]`, **without `colors`**.

**Scenario.** With the ledger mounted, switch Settings → Appearance → Light: month headers keep the dark
background and text colour until something else re-creates `renderItem`.

**Fix.** Add `colors` to the deps. (R2-1's `react-hooks/exhaustive-deps` would have caught this; R4-6
replaces the inline styles with `<Text variant="label" tone="muted">`, which reads the theme itself.)

**Done when:** a theme switch repaints headers immediately (add to DV).

### ✅ R1-10 — Uncategorised colour resolved at render, not at fetch
**Ref:** B10 · **Priority:** P2 · **Est:** 1 h

**Problem.** `lib/categoryColor.ts:14`: `if (!name) return colors.muted;` imports the **static** `colors`
from `lib/theme` (whichever palette that module exports), not the active theme. `Ledger.tsx:58`
(`withMonthHeaders`) bakes the result into each row object once per fetch.

**Scenario.** Switch theme → uncategorised rows keep the previous theme's grey dot/icon until the page is
re-fetched.

**Fix.**
1. `colorForCategory(null)` returns `null` (meaning "use the theme's neutral"), not a colour.
2. Renderers (`LedgerRow`, `CategoryIcon`) resolve `color ?? colors.subtle` via `useColors()` at render.
3. Named-but-uncoloured categories still get the deterministic `PALETTE` colour (theme-independent), so
   baking those at fetch is fine.
4. Remove `import { colors } from './theme'` from `lib/categoryColor.ts`; `lib/` then has one fewer
   dependency on theme state.

**Tests.** `lib/__tests__/categoryColor.test.ts`: `colorForCategory(null) === null`; same name → same colour.

**Done when:** no function in `lib/` returns a theme-dependent colour.

### ✅ R1-11 — Boot-failure status bar follows the theme
**Ref:** B11 · **Priority:** P2 · **Est:** 15 m

**Problem.** `features/boot/components/BootFailure.tsx:51`: `<StatusBar style="light" />`. The screen
background is `colors.background`, which is off-white in the light theme.

**Scenario.** Light theme + a boot failure → white status-bar icons on an off-white background (unreadable).

**Fix.** `<StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />` using the resolved scheme from the
theme store. Note the boot screen can render before the DB is ready, so read the theme from MMKV (it
already is: theme preference is a synchronous MMKV read), never from the DB.

**Done when:** the status bar is readable in both themes on the failure screen (DV).

### ✅ R1-12 — `keysFor` chunks instead of truncating at 500 ids
**Ref:** B12 · **Priority:** P2 · **Est:** 45 m

**Problem.** `features/transactions/queries.ts:324-327`:
```ts
keysFor: (ids: number[]) => readDb.select({ date, id }).from(transactions)
  .where(inArray(transactions.id, ids.slice(0, 500))),
```
Used by `useTransactionPages` (line 194) to find which loaded pages contain changed rows. The slice
silently drops ids 501+.

**Scenario.** Scroll deep → bulk-delete 2,000 rows → Undo → rows beyond the first 500 changed ids don't
mark their pages stale → those pages show deleted/missing rows until a filter change.

**Fix.** Chunk into groups of 500 (SQLite's bound-parameter limit is 999 on old builds, 32766 on new; 500
is safe), run them in sequence, concatenate. Or: when `ids.length > 500`, skip key lookup and mark every
loaded page stale (a bulk change is rare and a full refresh is correct).
**Preferred:** the second; it's simpler and bulk changes are rare.

**Tests.** `features/transactions/__tests__/pages.test.ts` (pure `stalePages`): with `unknownKeys`
omitted and an `overflow: true` flag → every page is stale.

**Done when:** no code path silently ignores changed ids.

---

### Batch R1-C — Data safety

### ✅ R1-13 — Pre-migration snapshot whenever any user data exists
**Ref:** B13 · **Priority:** P0 · **Est:** 1 h

**Problem.** `db/boot.ts:62-69`:
```ts
function hasUserData(): boolean {
  // … checks the transactions table exists …
  const rows = sqliteDb.getFirstSync('SELECT count(*) AS n FROM (SELECT 1 FROM transactions LIMIT 1)');
  return (rows?.n ?? 0) > 0;
}
```
`snapshotBeforeMigrating` only runs when this is true.

**Scenario.** Someone who uses only Groups, Budgets or the Tracker (no ledger transactions) gets **no
safety copy** before a migration. If that migration fails, there's nothing to restore.

**Fix.** Check every user table that exists (tables may not exist yet on old schemas, so check
`sqlite_master` per table):
- `transactions`, `budgets`, `subscriptions`, `split_groups`, `split_expenses`, `settlements` → any row
- `people` → any row with `is_self = 0`
- `categories` → any row with `is_system = 0`

Build one `SELECT EXISTS(…) OR EXISTS(…)` from the tables that exist. Move the table list into
`db/migrate.ts` as a pure function (`userDataProbeSql(existingTables)`) so it's testable in Node.

**Tests.** `db/__tests__/migrate.test.ts`: empty DB → false; only a group → true; only a user category → true;
only seeded system categories and the self person → false.

**Done when:** a Groups-only database gets a snapshot.

### ✅ R1-14 — Group delete and expense restore respect balances and membership
**Ref:** B14 · **Priority:** P1 · **Est:** 2 h

**Problem.** `features/groups/writes.ts`:
- `deleteGroup` (line 205): `db.update(splitGroups).set({ deletedAt: now() })…` with no checks. Compare
  member removal (~line 149): "a member with a balance in this group cannot be removed — settle them first",
  implemented with `groupNetsSync`.
- `restoreExpense` (line 376): `db.update(splitExpenses).set({ deletedAt: null })…` with no checks.

**Scenario.**
1. Group has unsettled balances → delete group → balances vanish from the hub, and **friend totals
   change** with no settlement recorded.
2. Delete an expense → remove a member who's now at zero → undo the expense delete → the expense references
   a removed member; balances now include someone not in the group.

**Fix.**
1. `deleteGroup` in `runWriteTx`: compute `groupNetsSync(tx, groupId)`; if any net ≠ 0 →
   `throw new UserFacingError('Settle up everyone in this group before deleting it')`.
2. `restoreExpense` in `runWriteTx`: load payer and share `person_id`s for the expense; load live members;
   if any is missing → `throw new UserFacingError('Someone on this expense has left the group, so it can't be restored')`.
3. Same check in `restoreSettlements` (line 440): both people on each settlement must still be live
   members. Also check `restorePerson` (line 108) and `restoreGroup` (line 209) for the same class of problem.
4. The UI already goes through `safeWrite`, so the message is toasted and the undo toast just fails cleanly.

**Tests.** `features/groups/__tests__/writes.test.ts`: delete with balance → throws; after settling →
succeeds; restore expense after its payer was removed → throws; restore with all members present → succeeds.

**Done when:** no group operation changes a balance without a settlement.

### ✅ R1-15 — Category merge stops hard-deleting budget history
**Ref:** B15 · **Priority:** P2 · **Est:** 45 m

**Problem.** `features/categories/mutations.ts:162-166`:
```ts
// A soft-deleted budget still holds the target's slot in the unique
// index, so it has to go before the source's budget can take it.
tx.delete(budgets).where(and(eq(budgets.categoryId, targetId), isNotNull(budgets.deletedAt))).run();
```
Since migration 0001 the budgets unique index is **partial** (`WHERE deleted_at IS NULL`), so soft-deleted
rows don't hold the slot. This permanently deletes history for no reason and contradicts the file header
("soft delete everywhere").

**Fix.** Delete that line and the comment. Keep the `update … set categoryId = targetId`.

**Tests.** `mutations.test.ts`: target has a soft-deleted budget; source has a live budget → merge →
both rows exist, the target now has exactly one live budget, the soft-deleted one is untouched.
Also run it against the migrated schema to prove the partial index allows it.

**Done when:** merge never issues a `DELETE`.

### ✅ R1-16 — `deterministicIcon` matches whole words
**Ref:** B19 · **Priority:** P3 · **Est:** 1 h

**Problem.** `lib/identity.ts` `KNOWN` list is matched as a lowercased **substring** ("so 'Netflix (family
plan)' still finds it"). Short needles hit inside unrelated words:

| Name | Needle hit | Wrong icon |
|---|---|---|
| Petrol | `pet` | paw-print |
| LinkedIn Premium | `emi` | landmark |
| Maid, Daily | `ai` | sparkles |
| Card | `car` | car |
| Parent | `rent` | house |

**Fix.** Tokenise the name into words (`name.toLowerCase().split(/[^a-z0-9]+/)`) and match a needle
against **whole tokens**; allow a prefix match only for needles ≥ 5 characters (`netflix`, `spotify`,
`insurance`, so "Netflixfamily" still works). Multi-word needles (`'vi '`) become exact token `vi`.
Keep the list order (first match wins).

**Tests.** `lib/__tests__/identity.test.ts`: Petrol ≠ paw-print; LinkedIn Premium ≠ landmark; Daily, Maid ≠
sparkles; Card ≠ car; Parent ≠ house; still: "Netflix (family plan)" → clapperboard, "Home loan EMI" →
landmark, "ChatGPT Plus" → sparkles, "Vi postpaid" → smartphone, "Car insurance" → first match per list order.

**Done when:** every row in the table above gets a sensible or neutral icon.

**R1 Discovered:**
- **The dashboard builders had to move to `features/dashboard/sql.ts` to be testable at all.** `queries.ts`
  imports `db/seed` → `db/client` → native `expo-sqlite`, which Jest cannot require, so B1 could not have a
  test while the builders lived there. That is a small piece of R3 pulled forward, and it is the concrete
  cost of A1: the feature had no seam between its SQL and its runtime.
- **`features/dashboard` had no tests before this.** Neither did `lib/identity.ts`. Both held bugs (B1, B19).
- **`colorForName('')` returned null**, because an empty string is falsy — found by a property-style test,
  not by the bug list. `Avatar` and the Tracker both reach it with a possibly-empty name.
- **No test asserted the amount limit anywhere**, which is why ₹100 crore survived in three schemas (B5).
- **The old summary test used ₹1,200/year**, which divides evenly by 12 and therefore could never have
  caught B3. A fixture chosen for convenience hid the bug it was closest to.
- **`earliestDateQuery` was unbounded too** (not in the review): it is the denominator of "average per day",
  so a future-dated row stretched the window. Fixed with B2.
- **`restoreSettlements`, `restorePerson` and `restoreGroup`** have the same shape as the B14
  `restoreExpense` bug. `restoreSettlements` is fixed here; the other two are worth a look in R3-12.

---

## Phase R2 — Guard rails

**Goal:** CLAUDE.md's conventions are enforced by tools, not memory. **Est:** 1½ days.
(Supersedes TASKS2 F6.) **Done when:** CI is green on `main`, and a PR that adds `fetch`, a cross-feature
import or the `INTERNET` permission fails CI.

### ⬜ R2-1 — ESLint with boundaries and project rules
**Ref:** T1 · **Priority:** P1 · **Est:** 4 h · **Depends on:** R0-1

**Problem.** `package.json` has a `lint` script, but ESLint isn't installed, so it fails. Every convention
in CLAUDE.md is enforced only by review. Hook dependency bugs like B9 slip through.

**Fix.** `npx expo install eslint eslint-config-expo` then `npm i -D eslint-plugin-boundaries`. Flat config
`eslint.config.js`:

| Rule | Enforces | Setting |
|---|---|---|
| `boundaries/element-types` | layer direction (§3) | elements: `app`, `feature` (captures name), `data`, `components`, `db`, `lib`; `feature` may not import a `feature` with a different name; `app` → `db` only from `app/_layout.tsx` |
| `no-restricted-globals` | convention #1 (no network) | `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` |
| `no-restricted-syntax` | convention #2 (money) | `CallExpression[callee.name='parseFloat']` and `[callee.property.name='toLocaleString']`, with an override that allows them in `lib/money.ts` |
| `no-restricted-syntax` | convention #8 (sync writeTx) | `CallExpression[callee.name=/^(writeTx|runWriteTx)$/] > :function[async=true]` and `CallExpression[callee.property.name='transaction'] > :function[async=true]` |
| `no-restricted-imports` | convention #6 | `drizzle-orm/expo-sqlite` import name `useLiveQuery`; `**/db/client` from `components/**` |
| `react-hooks/exhaustive-deps` | B9-class bugs | `error` |
| `@typescript-eslint/no-unused-vars` | dead `colors` imports (30 files) | `error`, `argsIgnorePattern: '^_'` |
| `no-restricted-syntax` | colours from tokens | hex literal strings in `components/charts/**` and `features/**/components/**` (complements `tokens.test.ts`) |

Steps: add the config → `npm run lint` → fix violations (the 30 unused `colors` imports, hook deps; each
hook-dep fix is a potential behaviour change, so check each one) → set `lint` to `eslint . --max-warnings 0`.

**Tests.** A `scripts/lint-fixtures/` folder (ignored by the main lint run) with one file per rule that
must fail; a small script `npm run lint:selftest` runs ESLint on it and asserts each file errors.

**Done when:** `npm run lint` passes, and each fixture fails with the expected rule.

### ⬜ R2-2 — Prettier and one formatting commit
**Ref:** T1 · **Priority:** P2 · **Est:** 1 h · **Depends on:** R2-1

**Fix.** `npm i -D prettier eslint-config-prettier`; `.prettierrc`: `{ "printWidth": 120, "singleQuote": true,
"trailingComma": "all" }` (matches the existing code; check a few files first and adjust so the diff is small).
`.prettierignore`: `db/migrations`, `android`, `global.css`, `pcref`. Scripts `format` and `format:check`.
Run once, commit alone as `Format with Prettier`. Add that commit's hash to `.git-blame-ignore-revs`.

**Done when:** `npm run format:check` passes and blame skips the formatting commit.

### ⬜ R2-3 — Type-check tests; align ts-jest with Jest 30
**Ref:** T1 · **Priority:** P1 · **Est:** 1½ h

**Problem.** `tsconfig.json` excludes `__tests__`, so `tsc --noEmit` never checks test files; only ts-jest
does, per file, at test time. `ts-jest@29` is paired with `jest@30`.

**Fix.**
1. `tsconfig.test.json` (exists) includes all `**/__tests__/**` and extends the main config with Jest types.
2. `package.json`: `"typecheck": "tsc --noEmit && tsc -p tsconfig.test.json --noEmit"`.
3. Upgrade `ts-jest` to the release that supports Jest 30 (`npm i -D ts-jest@latest`, check its peer
   range), or switch to `jest-expo`'s Node preset if it type-checks equivalently. Set
   `isolatedModules: true` in ts-jest to speed up runs now that types are checked separately.
4. Consider splitting the slow migration fixtures behind `jest --selectProjects` (`fast` vs `migrations`)
   so the everyday loop is quick; CI runs both.

**Done when:** `npm run typecheck` checks tests, `npm i` shows no peer-dependency warnings for Jest, and
test time is recorded here.

### ⬜ R2-4 — Icon-mapping test (the one `lib/icons.ts` claims exists)
**Ref:** T4 · **Priority:** P2 · **Est:** 1 h

**Problem.** `lib/icons.ts:10` says a test keeps `ICON_NAMES`/`MAPPED_ICON_NAMES` in sync with
`components/ui/CategoryIcon`'s map. No such test exists. `lib/identity.ts` also uses names from that set.
A mistyped icon name renders a fallback silently.

**Fix.**
1. Extract the name → component map from `CategoryIcon.tsx` to `components/ui/iconMap.ts`. It imports
   `lucide-react-native` components; if Node can't load those, keep the map as `Record<string, true>` of
   names in `iconMap.ts` and have `CategoryIcon` assert against it.
2. `lib/__tests__/icons.test.ts`: `ICON_NAMES` (as a set) equals the map's keys; every icon used in
   `lib/identity.ts` `KNOWN` and in `db/seedCore.ts` system categories is in the set.
3. Fix the comment in `lib/icons.ts` (R0-5).

**Done when:** renaming one icon in either place fails the test.

### ⬜ R2-5 — Adopt the `@/` import alias
**Ref:** T7 · **Priority:** P1 · **Est:** 2 h · **Depends on:** R2-1

**Problem.** `tsconfig.json` declares `@/*` but every import is relative (`../../../lib/theme`). R3/R4
move many files, and each move breaks relative imports.

**Fix.**
1. Confirm Metro resolves `@/` (Expo SDK 50+ supports tsconfig paths; check `metro.config.js`/babel
   don't override). Add `moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' }` to `jest.config.js`.
2. Codemod: replace any import that climbs out of its top-level folder (`../` crossing
   `app|features|components|data|db|lib`) with `@/…`. Keep same-folder imports (`./x`) relative.
3. Add an ESLint `no-restricted-imports` pattern `../../*` to stop regressions.
4. Commit alone: `Use @/ imports`.

**Done when:** no import contains `../../`, the app builds in Metro, and tests pass.

### ⬜ R2-6 — GitHub Actions CI
**Ref:** T1 · **Priority:** P1 · **Est:** 2 h · **Depends on:** R2-1, R2-3

**Fix.** `.github/workflows/ci.yml`, on `pull_request` and `push` to `main`, `ubuntu-latest`, Node from `.nvmrc`:
1. `npm ci` (cache npm)
2. `npm run typecheck`
3. `npm run lint` and `npm run format:check`
4. `npx jest --ci` (note `better-sqlite3` needs a prebuilt binary; it has one for Linux x64)
5. **Permission policy:** `EAS_BUILD_PROFILE=production npx expo config --json` piped to a small Node
   script that asserts `android.blockedPermissions` includes `android.permission.INTERNET` and
   `android.allowBackup === true`. (The real proof stays `verify:apk` on a built artifact, run in the release
   runbook; CI can't build the APK cheaply.)
6. `npm run theme:css && git diff --exit-code global.css` (generated file up to date; the test also covers it).

Protect `main`: require CI green and one PR.

**Done when:** CI runs on a PR; a test PR that adds `fetch('x')` fails the lint job.

### ⬜ R2-7 — `CONTRIBUTING.md`
**Ref:** T2 · **Priority:** P2 · **Est:** 1 h

**Fix.** Sections: branch naming (`r1-a-wrong-numbers`, `p7-backup-export`); one batch = one PR; commit
message style (imperative subject, the *why* in the body); before pushing (`typecheck`, `lint`, `jest`);
**the schema-change checklist** (edit `db/schema.ts` → `npm run db:generate` → read the SQL for the three
drizzle-kit bugs → populated migration test → run on a phone copy → never hand-edit generated migrations);
**the device-verification rule** (a UI or native change isn't done until its DV line is ticked); where
new code goes (§3 of this plan).

**Done when:** it's linked from the README.

**R2 Discovered:** *(add here)*

---

## Phase R3 — One data layer

**Goal:** every feature has the same shape, and no query exists twice. **Est:** 3 days.
**Rules:** move files first, change behaviour in a separate commit. Every builder takes `db`. No schema change.
**Done when:** a search for `readDb.select` / `readDb\n.select` finds hits only in `data/` and
`features/*/data/sql.ts` (hooks call builders with `readDb`); no SQL fragment exists in two files; lint
boundaries pass; all tests green.

### The four patterns today (A1)

| Feature | Read builders | Hooks | Writes | Errors |
|---|---|---|---|---|
| transactions, dashboard, budgets, tracker | close over `readDb` in `queries.ts` | `queries.ts` | `queries.ts`, sync `db` | `safeWrite` |
| analytics | take `db`, in `sql.ts` | `queries.ts` | — | — |
| categories | inline in `queries.ts` | `queries.ts` | `mutations.ts` takes `db` | throws `CategoryError`; each screen try/catches |
| groups | take `db`, in `sql.ts` | `queries.ts` | `writes.ts` (pure) → `mutations.ts` (safeWrite **and toasts**) | `UserFacingError` |

Only analytics and groups let tests run the **shipped** SQL. The budgets spend test keeps a hand-written
copy of its query.

### Batch R3-A — Shared foundations

### ⬜ R3-1 — `db/types.ts`: one `SyncDb` and one `AnyDb`
**Ref:** A6 · **Priority:** P1 · **Est:** 2 h · **Depends on:** R2-5

**Problem.** `BaseSQLiteDatabase<'sync' | 'async', any, typeof schema>` is re-declared as `AnalyticsDb`
(`features/analytics/sql.ts`), `GroupsDb`/`GroupsWriteDb` (`features/groups`), `SyncDb`
(`features/categories/mutations.ts`), `RetentionDb` (`db/retention.ts`) and `SeedDatabase` (`db/seed.ts`).
`features/groups/queries.ts` casts `as unknown as { all(): … }` six times to run async builders on the
sync handle; `groups/writes.ts:172` casts `tx as unknown as GroupsWriteDb`; `categories/mutations.ts`
casts `tx as SyncDb`.

**Fix.**
1. `db/types.ts`:
   ```ts
   import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
   import type * as schema from './schema';
   export type SyncDb = BaseSQLiteDatabase<'sync', any, typeof schema>;
   export type AsyncDb = BaseSQLiteDatabase<'async', any, typeof schema>;
   export type AnyDb = SyncDb | AsyncDb;
   /** What a writeTx callback receives. */
   export type TxDb = Parameters<Parameters<SyncDb['transaction']>[0]>[0];
   ```
2. Replace every local alias with these imports. Where a function accepts a transaction, type it `SyncDb | TxDb`
   (or make `runWriteTx` hand the callback a `SyncDb`-typed handle, so no casts are needed).
3. Remove the `as unknown as` casts; where a builder needs `.all()` on the sync handle, call the builder
   with `db` (sync) instead of casting the async one.

**Done when:** a search for `as unknown as` in `features/` and `db/` returns zero (or only commented,
justified exceptions), and no other file declares a `BaseSQLiteDatabase` alias.

### ⬜ R3-2 — `data/meta.ts`
**Ref:** A7 · **Priority:** P1 · **Est:** 1 h · **Depends on:** R3-1

**Problem.** `getMeta`/`setMeta` for the `app_meta` table live in `db/seed.ts`. `features/dashboard/queries.ts`
imports the **seeder** just to dismiss onboarding.

**Fix.** Create `data/meta.ts` with `META_KEYS`, `getMeta(db, key)`, `setMeta(db, key, value)`, and
`useMeta(key)` (a `useDbQuery` over `app_meta`). `db/seed.ts` and `db/boot.ts` import from it
(`data/` is below features; `db/` importing `data/` would break direction, so **keep the raw SQL helpers
in `db/meta.ts`** and have `data/meta.ts` re-export them plus the hook). Update `dismissOnboarding`.

**Tests.** Move existing meta tests; add get/set round-trip.

**Done when:** nothing outside `db/` imports `db/seed.ts` except boot.

### ⬜ R3-3 — `data/categories.ts` and `useCategories`
**Ref:** A3, A2 · **Priority:** P1 · **Est:** 2 h · **Depends on:** R3-1

**Problem.** `useCategories` lives in `features/transactions/queries.ts` and is imported by
`app/(modals)/subscription.tsx`, `app/(modals)/filters.tsx`, `app/(modals)/split-expense.tsx` and
`app/(modals)/transaction.tsx`. `features/categories/queries.ts` has its own live-category query. The
ledger feature has become the category provider by accident.

**Fix.**
1. `data/categories.ts`: `liveCategoriesQuery(db, kind?: 'expense' | 'income')` (kind filter means
   `kind IN (kind, 'both')`, ordered as today) and `useCategories(kind?)` with tables `['categories']`.
2. Delete both old copies; update the four routes, `CategoryList`, `CategoryEditor`, `Ledger`.
3. `features/categories` keeps only what's specific to managing categories (usage counts, etc.).

**Tests.** `data/__tests__/categories.test.ts`: soft-deleted excluded; `kind` filter includes `both`;
order stable.

**Done when:** one definition of "live categories" exists.

### ⬜ R3-4 — `data/ledger.ts`: the shared aggregates
**Ref:** A2 · **Priority:** P1 · **Est:** 4 h · **Depends on:** R3-1, R1-1, R1-2

**Problem.** The same queries are written in several places, and copies have already drifted (B1/B2):

| Query | Copies today |
|---|---|
| income/expense `CASE` sums | `transactions/queries.ts` (`summary`), `dashboard/queries.ts`, `analytics/sql.ts` (`totalsQuery`) |
| monthly trend + gap filling | `dashboard/queries.ts` `trendQuery`, `analytics/sql.ts` `trendQuery` + fill in `analytics/queries.ts` |
| expense per category | `dashboard` `topCategoriesQuery`, `analytics` `categoryTotalsQuery` |
| budget spend in cycle windows + 75% threshold | `dashboard` `useDashboardBudgets` (literal `0.75` at line 384), `budgets` `budgetQueries.spend`, `budgets` `budgetProgressForCategory`; the constant is `WARNING_RATIO` in `budgets/progress.ts:44` |

**Fix.** `data/ledger.ts`, every function takes `db` and is bounded on both ends:
- `incomeExpenseCase` — the two `sql` fragments, exported once
- `incomeExpenseTotals(db, { fromMonth, toMonth })`
- `monthTrend(db, { fromMonth, toMonth })` + pure `fillMonths(rows, fromMonth, toMonth)` (moved from analytics)
- `categoryTotals(db, { fromMonth, toMonth, type = 'expense', limit? })` (filters on `month`, joins live categories)
- `budgetSpend(db, windows: { categoryId, from, toExclusive }[])` → `Map<categoryId, paise>`
- `data/budgetState.ts` (pure): `WARNING_RATIO` and `budgetState(spent, limit, isActive)` →
  `'paused' | 'under' | 'warning' | 'over'`, moved from `budgets/progress.ts` so dashboard and budgets share it.

Filter by `transactions.month` for month ranges (uses `tx_month_idx`) and repeat `deleted_at IS NULL`
(partial index rule). Behaviour moves in R3-8/R3-9; this task only creates and tests the module.

**Tests.** `data/__tests__/ledger.test.ts` on better-sqlite3 with migrations: bounds on both ends;
soft-deleted excluded; `sum(monthTrend) === incomeExpenseTotals` for the same range; `fillMonths` fills gaps
and never adds months outside the range; `budgetSpend` respects `toExclusive`; `budgetState` at 74.9%, 75%,
100% and paused. Re-run `db/benchmark.ts` for `monthTrend` at 50k and confirm no `SCAN`/`TEMP B-TREE`.

**Done when:** the module exists with tests; nothing uses it yet (next tasks switch callers).

### ⬜ R3-5 — Move dev tools to `db/dev/`
**Ref:** A7 · **Priority:** P2 · **Est:** 30 m

**Fix.** `git mv db/devSeed.ts db/dev/devSeed.ts` and `git mv db/benchmark.ts db/dev/benchmark.ts`; update
imports (`app/dev.tsx`) and comments. Both keep their `__DEV__` refusal (convention #17). ESLint: forbid
importing `db/dev/**` from anything except the dev harness.

**Done when:** production boot code and dev tools live in different folders.

### ⬜ R3-6 — `useDbQuery`: `refetch()` and reset on entity change
**Ref:** B7, A1 · **Priority:** P1 · **Est:** 2 h

**Problem.** (1) No `refetch` (see R1-7; if R1-7 already added it, this task just documents and generalises).
(2) When deps change to a **different entity** (group 3 → group 5), the previous group's data stays
visible with `status: 'ok'` until the new query resolves, so one group's numbers can briefly render
under another group's header.

**Fix.**
1. Return `refetch` in `DbQueryResult<T>`.
2. Add an optional `key` parameter (or `options: { resetOn?: unknown }`): when it changes, set
   `{ data: fallback, status: 'pending', error: null }` synchronously before the new run. Use it in group
   detail, friend detail, and form prefill hooks.
3. Document in the hook's JSDoc: deps = re-run, key = new entity.

**Done when:** group → group navigation never shows the previous group's balances (DV).

### Batch R3-B — Features onto the standard layout

Each task follows the same recipe:
1. `git mv` into `data/sql.ts`, `data/writes.ts`, `data/hooks.ts`, `data/actions.ts`, `domain/`, `screens/`
   (later), `index.ts`. Commit: `Move <feature> to standard layout (no behaviour change)`.
2. Convert builders to take `db`; hooks pass `readDb`; actions bind `db` + `safeWrite`. Commit.
3. Switch to `data/ledger.ts` / `data/categories.ts` where applicable. Commit.
4. Tests run the shipped builders; delete any hand-written query copies.

### ⬜ R3-7 — transactions → standard layout, keyset export
**Ref:** A1, B17 · **Priority:** P1 · **Est:** 4 h · **Depends on:** R3-1, R3-3

**Problem.** `features/transactions/queries.ts` mixes hooks, builders (closing over `readDb`), writes and
a sync OFFSET export page. `getTransactionsPage(filters, limit, offset)` (~line 271) runs
`db.select … .limit(limit).offset(offset).all()` on the **sync** handle; `features/transactions/export.ts:34`
loops `for (let offset = 0; ; offset += PAGE)`. That's O(n²) (each page re-scans the skipped rows) and
blocks the JS thread for a 50k-row export (B17).

**Fix.**
- `data/sql.ts`: `buildWhere` (from `filters.ts`, keep it pure), `ledgerPage(db, filters, limit, after?: LedgerKey)`,
  `atOrNewer`, `keysFor` (chunked, R1-12), `summary` (uses `incomeExpenseCase` from `data/ledger.ts`).
- `data/writes.ts`: create/update/delete/restore/bulk delete (pure, `writeTx`, `UserFacingError`).
- `data/hooks.ts`: `useTransactionPages`, `useTransactionSummary`, `useTransaction(id)`.
- `data/actions.ts`: safeWrite-bound writes.
- `domain/`: `pages.ts` (keyset maths), `csv.ts`.
- **Export:** `export.ts` pages through `readDb` with the keyset `(date, id) <` last key, 1,000 rows per page,
  yielding between pages; writes CSV chunks to the file incrementally.
- `index.ts` exports `Ledger`, `RecentlyDeleted`, hooks and actions routes need.

**Tests.** Existing tests move with the files. New: export of 2,500 rows returns every row exactly once
in order (run the builder on better-sqlite3).

**Done when:** no OFFSET remains in the feature and export doesn't use the sync handle.

### ⬜ R3-8 — dashboard + analytics onto `data/ledger.ts`
**Ref:** A1, A2 · **Priority:** P1 · **Est:** 3 h · **Depends on:** R3-4

**Fix.**
- Dashboard: month overview → `incomeExpenseTotals`; trend → `monthTrend` + `fillMonths`; top categories →
  `categoryTotals({ fromMonth: m, toMonth: m, limit })`; budgets card → `budgetSpend` + `budgetState`
  (removes the literal `0.75`); onboarding → `data/meta.ts`.
- Analytics: `trendQuery`/`totalsQuery`/`categoryTotalsQuery` → the shared functions; keep
  `biggestExpenseQuery` and `earliestDateQuery` in `features/analytics/data/sql.ts` (only analytics uses them);
  `period.ts` → `domain/period.ts`.
- `db/dev/benchmark.ts` benchmarks the shared functions.

**Tests.** Dashboard gets builder tests for the first time (it had none that ran shipped SQL).

**Done when:** Home and Insights compute month totals, trends and category totals with the same functions.

### ⬜ R3-9 — budgets → standard layout
**Ref:** A1, A2 · **Priority:** P1 · **Est:** 2 h · **Depends on:** R3-4

**Fix.** `progress.ts`, `dial.ts` → `domain/`; `budgetQueries.spend` and `budgetProgressForCategory` →
`budgetSpend` from `data/ledger.ts`; writes to `data/writes.ts`. **`features/budgets/__tests__/spend.test.ts`
runs the shipped `budgetSpend`**; delete its hand-written copy of the query.

**Done when:** one budget-spend query exists and its test runs that query.

### ⬜ R3-10 — tracker → standard layout
**Ref:** A1 · **Priority:** P2 · **Est:** 1½ h · **Depends on:** R3-1

**Fix.** `renewal.ts` → `domain/renewal.ts`; builders take `db` in `data/sql.ts`; writes to `data/writes.ts`
with `UserFacingError`; `index.ts`.

**Done when:** tracker matches the recipe.

### ⬜ R3-11 — categories → standard layout, `UserFacingError`
**Ref:** A1 · **Priority:** P1 · **Est:** 2 h · **Depends on:** R3-3

**Problem.** `mutations.ts` throws a custom `CategoryError`; `CategoryEditor`/`CategoryList` each wrap calls
in `try/catch` and toast themselves, unlike every other feature. A private `now()` duplicates `nowISO`.

**Fix.** `mutations.ts` → `data/writes.ts`, throwing `UserFacingError`; private `now()` → `nowISO()` from
`lib/dates.ts`; `data/actions.ts` wraps in `safeWrite`; screens branch on `WriteResult.ok` and drop try/catch.
Keep `normalizeCategoryName`/`tombstoneName` in `domain/names.ts`.

**Done when:** no `CategoryError` and no `try/catch` around category writes in components.

### ⬜ R3-12 — groups → standard layout, no toasts in the data layer
**Ref:** A1, A2, A6 · **Priority:** P1 · **Est:** 3 h · **Depends on:** R3-1

**Problem.** `features/groups/mutations.ts` wraps writes in `safeWrite` **and** raises success toasts,
so toasts come from three layers (data, routes, components). `groupNetsSync` in `writes.ts` duplicates
`netsQuery` in `sql.ts`. Private `now()` again.

**Fix.** `split.ts`, `debts.ts`, `balances.ts`, `draft.ts`, `wording.ts` → `domain/`; `sql.ts` → `data/sql.ts`;
`writes.ts` → `data/writes.ts` with `groupNetsSync` built from the **same** SQL fragment/builder as
`netsQuery` (the builder takes `db`, so call it with the sync tx handle); `mutations.ts` → `data/actions.ts`
returning `WriteResult` only; success toasts move to the screens; `now()` → `nowISO()`.

**Tests.** A test that `groupNetsSync` and `netsQuery` return identical nets on the same fixture.

**Done when:** a search for `toast` in `features/*/data/` returns nothing, and one nets query exists.

**R3 Discovered:** *(add here)*

---

## Phase R4 — UI kit and thin routes

**Goal:** screens are composed from primitives; route files are one-liners. **Est:** 3 days.
**Done when:** no `app/` file exceeds 20 lines except `_layout.tsx`; a search for `fontFamily: fonts.`
outside `components/ui` and `components/charts` returns nothing; a screenshot pass of every screen in both
themes looks identical before and after.

**Before starting:** take screenshots of every screen in light and dark (the "before" set). Store them
outside the repo.

### ⬜ R4-1 — `Text` with variants and tones
**Ref:** A5 · **Priority:** P1 · **Est:** 3 h

**Problem.** 332 inline `fontFamily: fonts.*` styles in 45 files, with font sizes as literals; each screen
re-derives the type scale.

**Fix.** `components/ui/Text.tsx`:
- Before writing variants, **inventory the existing combinations** (grep `fontFamily: fonts.` with the
  `fontSize` next to it) and collapse them into the scale below; note any outliers.
- `variant`: `display` (big amounts), `title` (screen title), `heading` (section/card title), `body`,
  `bodyStrong`, `caption`, `label` (uppercase, letter-spaced section label, like the ledger month header),
  `amount` (tabular-nums).
- `tone`: `default`, `muted`, `subtle`, `primary`, `income`, `expense`, `danger`, resolved via `useColors()`.
- Passes through `numberOfLines`, `adjustsFontSizeToFit`, `style` (last wins), `className`.

**Done when:** `Text` exists, is used in one screen as a pilot, and that screen looks identical.

### ⬜ R4-2 — `Button`, `IconButton`, `Chip`, `Section`, `StatFigure`, `Field`
**Ref:** A5 · **Priority:** P1 · **Est:** 4 h · **Depends on:** R4-1

**Problem.** Redefined per file: `Label` ×4, `RoundButton` ×3, `ErrorText` ×3, `Section` ×3, `Figure` ×4, `Chip` ×2.

**Fix.** In `components/ui/`:
- `Button` (`primary` / `secondary` / `destructive` / `ghost`, `loading`, `disabled`; built on `PressableScale`)
- `IconButton` (the round header button: close, delete, back)
- `Chip` (selectable and removable; used by filters and group forms)
- `Section` (label + children + optional action)
- `StatFigure` (label + amount + optional delta)
- `Field` = `Label` + input slot + `ErrorText`, wired to react-hook-form's `fieldState`

Delete the per-file copies as each screen migrates (R4-6).

**Done when:** each component exists with a JSDoc example.

### ⬜ R4-3 — `FormModal` and `useSubmitOnce`
**Ref:** A4, A5 · **Priority:** P1 · **Est:** 3 h · **Depends on:** R4-2

**Problem.** `transaction.tsx` (469 lines), `subscription.tsx` (451) and `budget.tsx` (343) each repeat:
close/title/delete header; `KeyboardAvoidingView`; a double-tap `useRef` guard; `saving` state; a "this
no longer exists" effect for edits of deleted rows; delete with an undo toast.

**Fix.**
- `useSubmitOnce(fn)` → `{ submit, busy }`: ignores re-entry while a submit runs (the "hammer Save →
  one row" guarantee), resets on `WriteResult.ok === false`.
- `FormModal` props: `title`, `onClose`, `onDelete?`, `primary: { label, onPress, busy }`, `missing?: boolean`
  (renders nothing and navigates back with a toast when an edited entity no longer exists), children.
  It owns `KeyboardAvoidingView behavior="padding"` (the one source of keyboard padding) and a sticky
  primary button above the keyboard.

**Tests.** `useSubmitOnce` logic is extractable to a pure function (a promise gate); test re-entry in Node.

**Done when:** the transaction form uses `FormModal` and still passes the DV "hammer Save" and keyboard checks.

### ⬜ R4-4 — Move screens out of `app/`
**Ref:** A4, A7 · **Priority:** P1 · **Est:** 4 h · **Depends on:** R4-3, R3-B

**Problem.** Fat routes:

| Route | Lines | Moves to |
|---|---|---|
| `app/(modals)/transaction.tsx` | 469 | `features/transactions/screens/TransactionForm.tsx` |
| `app/(modals)/subscription.tsx` | 451 | `features/tracker/screens/SubscriptionForm.tsx` |
| `app/(modals)/budget.tsx` | 343 | `features/budgets/screens/BudgetForm.tsx` |
| `app/(modals)/filters.tsx` | 273 | `features/transactions/screens/FiltersSheet.tsx` |
| `app/dev.tsx` | 255 | `features/devtools/screens/DevHarness.tsx` (keeps the `__DEV__` redirect in the route **and** a refusal in the screen) |
| `app/(tabs)/more.tsx` | 151 | `features/settings/screens/More.tsx` |
| `app/settings/index.tsx` | 138 | `features/settings/screens/Settings.tsx` (its `db/retention` import moves to `features/settings/data/`) |

Also check `split-expense`, `settle-up`, `category`, `group`, `friend`, `balances` modals and move any over 20 lines.

**Fix.** Each route becomes:
```tsx
import { TransactionForm } from '@/features/transactions';
export default function Route() { return <TransactionForm />; }
```
Screens read params with `useLocalSearchParams` themselves (or the route passes them in; pick one and use
it everywhere, **recommended: the route reads params and passes typed props**, so screens stay testable).

**Done when:** no route file except `_layout.tsx` exceeds 20 lines, and `app/` imports `db/` only in `_layout.tsx`.

### ⬜ R4-5 — Renames and labels
**Ref:** A5, B20 · **Priority:** P2 · **Est:** 1 h

**Problem.**
1. Two components named `TrendChart`: `components/charts/TrendChart.tsx` (the chart) and
   `features/dashboard/components/TrendChart.tsx` (the Home card that contains it).
2. `components/layout/TabBar.tsx:29`: `transactions: { icon: Receipt, label: 'Activity', slot: 1 }`, while
   the route, screen title and every doc say "Transactions".
3. `app/dev.tsx:93,141,174` use `toLocaleString()` (breaks the money/number formatting convention; without
   ICU it falls back to US grouping).

**Fix.** Rename the Home card to `IncomeExpenseCard`. Pick **one** word for the tab and screen (recommended:
"Transactions" to match the code and docs; if "Activity" is the preferred product label, rename the screen
title instead and note it in CLAUDE.md). Use `formatCount` from `lib/money.ts` in the dev harness.

**Done when:** one name per concept; no `toLocaleString` outside `lib/money.ts` (lint enforces it).

### ⬜ R4-6 — Migrate every screen to the kit
**Ref:** A5 · **Priority:** P1 · **Est:** 1 day · **Depends on:** R4-1 … R4-4

**Fix.** One feature per commit: transactions → dashboard → analytics → budgets → tracker → categories →
groups → settings → boot → devtools. In each: inline text styles → `<Text variant tone>`; per-file
`Label`/`RoundButton`/`ErrorText`/`Section`/`Figure`/`Chip` → kit components; remove dead
`import { colors } from 'lib/theme'` (30 files shadow it with `useColors()`); `app/dev.tsx`'s Tailwind colour
classes → tokens. Screenshot each feature in both themes and compare with the "before" set.

**Done when:** the phase's *Done when* holds.

### ⬜ R4-7 — `DatePickerSheet` for subscription and group expense dates
**Ref:** TASKS2 F5 discovered · **Priority:** P2 · **Est:** 1½ h

**Problem.** The transaction form uses the JS `DatePickerSheet` (5 years back, 1 year ahead, themed).
The subscription anchor date and group expense/settlement dates still use the older input.

**Fix.** Use `DatePickerSheet` in `SubscriptionForm` (anchor date; allow future dates) and the split-expense
and settle-up forms. Respect the in-form sheet back-handling rule (`groups/components/kit.tsx`: in-form
sheets close before the screen).

**Done when:** every date field in the app opens the same picker (DV: back gesture closes the sheet first).

**R4 Discovered:** *(add here)*

---

## Phase 7 — Backup & restore

**Goal:** make a standalone app responsible rather than reckless. **Est:** 3–4 days. **Priority: P0.**
**Design:** [`docs/design/backup-and-native.md`](docs/design/backup-and-native.md).
**Already built:** `db/encryptedCopy.ts` (SQLCipher passphrase copy), `plugins/withBackupRules.js`
(auto-backup exclusions), WAL checkpoint on background, the reopenable connection, pre-migration snapshots.
**New code goes in:** `features/backup/{screens,data,domain}` (target layout).

> **The highest-stakes phase.** Every other failure is an annoyance. A backup failure permanently loses
> data someone typed in by hand. Test every path on the real phone.

**Exit criterion (on the phone):** populate → export → **uninstall** → reinstall → restore → row counts
and paise totals match exactly. Repeat with an encrypted export and with the JSON export.

### ⬜ P7-1 — Export a `.db` file
**Est:** 3 h. **Why:** a byte-exact, consistent single file (no WAL) is the most reliable restore.
**Fix.** Checkpoint → `VACUUM INTO` a temp file under `cacheDirectory` → `expo-sharing` share sheet
(the user picks Drive, Files, etc.) → delete the temp file → `setMeta('last_backup_at', nowISO())` **only
after** the share completes without error. File name `spendwise-YYYY-MM-DD.db`.
**Tests.** Node: the VACUUM INTO copy of the 50k fixture opens and has identical row counts.
**Done when:** a shared `.db` opens in Drizzle Studio with all data.

### ⬜ P7-2 — Optional passphrase
**Est:** 2 h. **Depends on:** P7-1.
**Fix.** Toggle "Protect with a passphrase" → passphrase + confirm → `writeEncryptedCopy`. A blocking warning
the user must acknowledge: "If you forget this passphrase, this backup cannot be opened by anyone,
including us." Minimum 8 characters. Never store the passphrase.
**Done when:** the encrypted file's header is not `SQLite format 3`, and it opens only with the passphrase.

### ⬜ P7-3 — Export `.json`
**Est:** 4 h. **Why:** readable, and restorable across schema versions.
**Fix.** `{ format_version: 1, app_version, schema_migration_idx, exported_at, tables: { categories: [...], … } }`.
Every user table (categories, transactions, budgets, subscriptions, import_batches, app_meta whitelist,
people, split_groups, group_members, split_expenses, split_expense_payers, split_expense_shares,
settlements) with rows keyed by `uid`; foreign keys exported as the referenced row's **uid**, not its id.
`split_debts` may be omitted (derived; rebuilt on restore). Money stays integer paise. Stream to the file by
table and page; don't build one giant string for 50k rows.
**Done when:** the JSON for the 50k fixture is produced without a UI freeze longer than a frame per page.

### ⬜ P7-4 — Restore: validate first, change nothing on failure
**Est:** 4 h. **Depends on:** P7-1, P7-3.
**Fix.** Pick a file (re-add `expo-document-picker`, R0-4) → copy to a temp path → detect type (SQLite header,
SQLCipher, JSON) → ask for the passphrase if encrypted → validate: `PRAGMA integrity_check` = `ok`;
migration index ≤ the bundled latest (refuse newer: "This backup is from a newer version of SpendWise.
Update the app first."); required tables present; row counts readable. Show a summary ("1,204 transactions,
12 budgets, 3 groups, last entry 12 Sep") and a confirm. **Nothing is touched before confirm.**
For JSON: build a fresh DB from migrations, insert by uid mapping, rebuild `split_debts`, then treat that DB
like a `.db` restore.
**Done when:** a wrong passphrase, a truncated file, a newer-schema file and a random PDF all leave the
current data untouched with a specific message.

### ⬜ P7-5 — Snapshot, then swap
**Est:** 3 h. **Depends on:** P7-4.
**Fix.** Snapshot the current DB (same mechanism as pre-migration, prefix `pre-restore-`) → `closeConnection`
→ move the validated file into place (delete stale `-wal`/`-shm`) → reopen → `bootDatabase()` (migrates
an older backup forward). On any failure, move the snapshot back and reopen. Invalidate every
`useDbQuery` (emit a change for all tables).
**Done when:** a restore of an older-schema backup migrates and opens; a forced failure mid-swap leaves the
previous data intact.

### ⬜ P7-6 — Restore from the boot-failure screen
**Est:** 1½ h. **Depends on:** P7-5, R1-8.
**Fix.** `BootFailure` gets "Restore from a backup" (the recovery path promised in decision D5) and, when a
`pre-migration-*` snapshot exists, "Restore the copy from before the update". Both use the P7-4/P7-5 path
without needing a booted DB.
**Done when:** a deliberately corrupted DB can be replaced from a backup file without reinstalling.

### ⬜ P7-7 — Storage information in Settings
**Est:** 1½ h.
**Fix.** Settings → Backup section: database + WAL size; last backup date (or "Never" in warning tone);
a warning when the DB passes ~20 MB ("Android's automatic backup stops at 25 MB, so export manually").
**Done when:** sizes match `ls -l` on the device.

### ⬜ P7-8 — Backup history
**Est:** 1 h.
**Fix.** Keep the last 10 exports in `app_meta` as JSON (`[{at, kind: 'db'|'db-encrypted'|'json', rows}]`) or a
small table if a migration is warranted (prefer `app_meta`; no schema change). Show them under Settings → Backup.
**Done when:** "did I ever back this up?" is answerable in one screen.

### ⬜ P7-9 — Backup tests
**Est:** 3 h.
**Fix.** In Node on the migrated 50k fixture: JSON export → import into a fresh DB → per-table row counts
and `sum(amount_paise)` identical; uids identical; group nets identical. Restore refuses a newer migration
index. Wrong passphrase changes nothing. A `.db` from migration 0004 restores and migrates to latest.
**Done when:** all pass in CI.

*(The monthly backup reminder ships with Phase 8 channels: P8-5.)*

---

## Phase 8 — Native layer

**Goal:** reminders and quick add, the reasons to be a native app. **Est:** 3–4 days.
**Design:** [`docs/design/backup-and-native.md`](docs/design/backup-and-native.md). New code in `features/notifications/`.
**Exit criterion:** a reminder fires on the right morning after a reboot; the widget adds a transaction in two taps.

| ID | Task | Detail | Why |
|---|---|---|---|
| ⬜ P8-1 | Create channels at boot | `Renewals`, `Budget alerts`, `Backup`, before any post | Android silently drops posts to a missing channel |
| ⬜ P8-2 | Ask `POST_NOTIFICATIONS` in context | On the first subscription save with a reminder, never at launch; handle "denied" by showing reminders as off in the form | Permission prompts at launch get denied |
| ⬜ P8-3 | Renewal reminders | After **any** subscription write: cancel all scheduled renewal notifications, then schedule each active subscription's next renewal minus `reminder_days_before` at 09:00 local. Never diff | Diffing drifts; `reminder_days_before` is stored but unused today |
| ⬜ P8-4 | Budget alerts at 75% / 100% | After each transaction write, compute via `budgetSpend` + `budgetState` (R3-4); fire once per budget per cycle per threshold (remember in `app_meta`) | The alert and the progress bar must agree |
| ⬜ P8-5 | Monthly backup nudge | Only when `last_backup_at` is more than 30 days old; tap opens Settings → Backup | Durability decision: export + auto-backup + reminder |
| ⬜ P8-6 | Survive reboot and force-stop | `RECEIVE_BOOT_COMPLETED` (not blocked); reschedule on boot and on app start | Scheduled alarms are cleared on reboot |
| ⬜ P8-7 | Home-screen widget | `react-native-android-widget`: this month's spend + "Add" button; reads an MMKV snapshot written after each write (never opens SQLite from the widget); tap deep-links to `/(modals)/transaction` | Quick add in two taps |
| ⬜ P8-8 | FAB long-press menu | add · import (6A, hidden until then) · settle up | Faster paths |
| ⬜ P8-9 | Optional biometric lock | Re-add `expo-local-authentication`; lock on cold start and after N minutes in background; verify its permissions with `verify:apk` | Privacy on a shared phone |
| ⬜ P8-10 | Haptics on add and delete | `expo-haptics`; honour "Remove animations"/reduced motion setting where relevant | Feedback |

Every P8 item that adds a native module is a native change: rebuild and run `verify:apk`.

---

## Phase R5 — Performance

**Goal:** 50k rows scroll end to end; a save causes no dropped frames. **Est:** 2 days. (Carried from TASKS2 F4.)
**Already done:** ✅ keyset ledger pages with page 1 live · ✅ row memo on drawn fields and sticky month headers.
**Exit criterion:** Perf Monitor shows no dropped frames scrolling the 50k DB end to end and while saving from the ledger.

### ⬜ R5-1 — `AnimatedAmount` off React state
**Ref:** B16 · **Priority:** P2 · **Est:** 3 h · **Depends on:** R5-2

**Problem.** `components/ui/AnimatedAmount.tsx:30-57`: a `requestAnimationFrame` loop calls
`setShown(next)` **every frame for 700 ms**, re-rendering the component (and running `formatINR`) ~42
times per change. Home mounts ~six instances, so an add from Home re-renders ~250 times.

**Fix.** Reanimated shared value animated with `withTiming(paise, { duration, easing: Easing.out(Easing.cubic) })`;
an `AnimatedTextInput` (`editable={false}`) whose `text` prop is set in `useAnimatedProps` from a worklet
formatter (`formatINRWorklet`, from R5-2). Keep `adjustsFontSizeToFit` behaviour (check that TextInput supports
it; if not, measure width once and scale). Skip animation while the screen is unfocused and when reduced motion
is on (`useMotion()`).

**Done when:** React DevTools shows one render per value change; the digits still animate (DV).

### ⬜ R5-2 — `formatINR` always uses manual Indian grouping
**Ref:** B18 · **Priority:** P2 · **Est:** 1 h

**Problem.** `lib/money.ts:130-137`: when `HAS_INDIAN_ICU` is true, `formatINR` calls
`rupees.toLocaleString('en-IN', …)` on every call (slow on Hermes), although `groupIndianManually` is
already correct and tested.

**Fix.** Always use `groupIndianManually`; keep the ICU probe only as a **test** that asserts both give the
same output for a range of values. Make the formatter worklet-safe (`'worklet'` directive, no closures over
non-shareable values) for R5-1.

**Tests.** Property-style test: for 10,000 random paise values (including negatives, 0, crore-scale),
manual === ICU output in Node.

**Done when:** `formatINR` has no `toLocaleString` call.

### ⬜ R5-3 — Search without `lower()`
**Priority:** P3 · **Est:** 1 h
**Problem.** Ledger search (`features/transactions/filters.ts:127-128`) wraps note and category name in `lower()` before `LIKE`, which prevents any index
use and costs per row. SQLite `LIKE` is already case-insensitive for ASCII.
**Fix.** Drop `lower()`; keep the `ESCAPE` clause for `%`/`_` in user input. Only evaluate FTS5 trigram if
realistic notes (non-ASCII names) show a need; record the measurement.
**Done when:** search results are unchanged for ASCII (test) and the benchmark row is recorded.

### ⬜ R5-4 — Measure, then decide: swipeables and tab-bar blur
**Priority:** P2 · **Est:** 3 h
**Fix.** Measure with Perf Monitor on the 50k DB: (1) swipeable mounted per row vs mounted on touch;
(2) the glass tab-bar blur during ledger scroll. If blur drops frames, add Settings → "Reduce transparency".
Record the numbers in this card **either way**.
**Done when:** numbers are recorded and a decision is written.

### ⬜ R5-5 — Record on-device query timings; close the rollup decision
**Priority:** P2 · **Est:** 2 h
**Fix.** Dev harness benchmark on the phone at 50k rows: median time and plan flags for every shipped builder.
If the 24-month trend ≤ 50 ms (desktop was 3.5 ms; plans verified 2026-09-15), close "rollup tables" as
**not needed** in the decisions log.
**Done when:** the timings table is filled in here.

| Query | Median (ms) | Plan flags | Date |
|---|---|---|---|
| *(fill on device)* | | | |

---

## Phase R6 — Observability and release ops

**Est:** 1 day.

### ⬜ R6-1 — Local crash log
**Ref:** T9 · **Priority:** P1 · **Est:** 4 h

**Problem.** Release builds have no crash reporting. Sentry is ruled out because it needs `INTERNET`.
When a tester hits a crash, there is nothing to look at.

**Fix.** `lib/crashlog.ts`: install `ErrorUtils.setGlobalHandler` (chain the previous handler) and an
unhandled-promise-rejection hook; append entries `{ at, appVersion, message, stack (first 20 lines), route }`
to `files/logs/crash.log` as JSON lines; keep the last 200 entries (rotate on write). **Never log amounts,
notes, category names or person names.** Also record `bootDatabase` failures. Settings → "Share crash log"
(expo-sharing) and "Clear". Exclude `files/logs/` from auto-backup (`plugins/withBackupRules.js` + its test).

**Tests.** Node: rotation keeps 200; a message containing `₹` or digits after "note:" is not written
(a simple redaction guard); `withBackupRules` test includes the new exclusion.

**Done when:** a forced crash in a release build appears in the shared log.

### ⬜ R6-2 — `docs/runbooks/release.md`
**Priority:** P2 · **Est:** 1 h
**Content.** Version bump (`app.config.ts` version + `versionCode`) → changelog → `rm -rf android` →
`npm run prebuild` → `npm run build:release-apk` → `verify:apk` output pasted → backup drill (P9-1) →
migration drill on a copy of the phone DB → tag `vX.Y.Z` → upload.
**Done when:** a release can be cut by following it without asking anyone.

### ⬜ R6-3 — `docs/runbooks/migrations.md`
**Priority:** P2 · **Est:** 1 h
**Content.** Edit `db/schema.ts` → `npm run db:generate` → **read the SQL** against the three drizzle-kit
0.31 bugs (new column + rebuild in one generate copies the new column; rebuild copies VIRTUAL generated
columns, so drop/re-add `transactions.month`; partial expression index emitted as a backticked column →
`--custom`) → never migrate with FKs on → `db/__tests__/migrations.test.ts` on the populated fixture →
`npm run db:pull` → run the migration on a copy → data fixes via `drizzle-kit generate --custom` → never
hand-edit a generated migration.
**Done when:** linked from CONTRIBUTING and CLAUDE.md.

### ⬜ R6-4 — Remove `db/legacyEncryption.ts` and `expo-secure-store`
**Priority:** P3 · **Est:** 1 h · **Depends on:** every installed build is past 2026-09-14
**Problem.** One-time conversion code for pre-2026-09-14 Keystore-keyed databases.
**Fix.** Confirm no tester has an older build → delete the module, its boot step, `expo-secure-store`,
the `legacy` backup-rule exclusion (update its test), and the `convertedLegacy` field of the boot outcome.
Native change → rebuild + `verify:apk`.
**Done when:** grep for `legacyEncryption` and `secure-store` returns nothing.

---

## Gate — Sheets readiness

All must be ✅ before the first 6A task. (Carried from TASKS2 F7.)

| ID | Check | Why |
|---|---|---|
| ⬜ G-1 | `writeTx` async callbacks are lint-enforced (R2-1) | Imports are the largest multi-statement writes |
| ⬜ G-2 | A `money_rows` view (transactions + included sheet rows) exists in the design; consumers list `transactions`, `sheets`, `sheet_rows` as base tables; `data/ledger.ts` reads the view, so dashboard, analytics and budgets change once | "Include in totals" per sheet without touching three features |
| ⬜ G-3 | `sheet_row_links` keys through `uid` (or ids that JSON restore remaps, P7-3) | Restores must not break links |
| ⬜ G-4 | Backup covers `files/sheets/` (auto-backup rules are exclude-only, so it does by default; the manual `.db`/JSON export must add the files) | Sheets are user data |
| ⬜ G-5 | Parsing and export chunk explicitly (~250 rows, then yield) with an input size cap | `InteractionManager` alone doesn't split work |
| ⬜ G-6 | SheetJS installed from the vendor tarball (npm `xlsx` is stuck at 0.18.5 with advisories); the ExcelJS spike measures JS-thread blocking for a 5k-row styled workbook | Security and responsiveness |

---

## Phase 6A / 6B — Sheets

**Est:** 6A 7–8 d · 6B 4–5 d. **Design, tasks, risks and exit criteria:** [`docs/design/sheets.md`](docs/design/sheets.md).
The detailed task list is in [`docs/history/TASKS-phases-0-5-and-groups-2026-09.md`](docs/history/TASKS-phases-0-5-and-groups-2026-09.md)
→ Phase 6A/6B. **When the gate passes, copy those tasks into this file as task cards, rewritten for the
target layout (`features/sheets/{data,domain,screens}`).**

First tasks, in order:
1. ⬜ **6A-0:** collect five genuinely different real spreadsheets (bank export, hand-made budget, Splitwise
   export, a messy one with merged cells, a large one).
2. ⬜ **6A-1:** one-day ExcelJS spike, go/no-go on: parses all five, styled 5k-row workbook export blocking time,
   bundle size.

---

## Phase 9 — Hardening & Play Store

**Est:** 4–5 days. **Exit criterion:** a tester who is not you installs from Play, adds and imports data,
gets a renewal reminder, exports a backup and restores it on another device.

| ID | Task | Detail |
|---|---|---|
| ⬜ P9-1 | Backup drill and migration drill | Full P7 exit criterion + a migration on a copy of a real DB; repeat before every schema-touching release |
| ⬜ P9-2 | Delete all data | Settings → typed confirmation ("DELETE"); offers an export first; snapshot kept until next launch |
| ⬜ P9-3 | No `INTERNET` in the release artifact | `verify:apk` on the AAB/APK that is uploaded |
| ⬜ P9-4 | Privacy policy and Data Safety form | Nothing collected or transmitted; host the policy page (a static page, not the app) |
| ⬜ P9-5 | Signing | Upload key generated **and backed up in two places**; EAS credentials; AAB build |
| ⬜ P9-6 | Second device | A different Android version and manufacturer; run the whole DV list |
| ⬜ P9-7 | Internal testing track | A tester who is not you, following a written script |

---

## Device verification (DV)

Everything here is code complete and tested in Node, and **still needs the real phone**. Run them together
with a fresh dev build (several need one: backup rules, splash colours). Tick with the date.
Items added by this plan's tasks are marked with the task ID.

**Data safety (do first)**
- [ ] DV-1 Auto-backup drill: `adb shell bmgr backupnow com.spendwise.android` → uninstall → reinstall → data present *(blocked 2026-09-15 by "Size quota exceeded"; dev bundle now excluded, needs a rebuild)*
- [ ] DV-2 Dev harness → encrypted backup-file round trip: counts match; header is not `SQLite format 3`
- [ ] DV-3 A deliberately corrupted `spendwise.db` → "can't open your data" screen; Share and Start fresh both work
- [ ] DV-4 A pending migration leaves `files/snapshots/pre-migration-*.db` that opens in Drizzle Studio
- [ ] DV-5 A forced constraint error keeps a form open with a specific toast (dev and release)
- [ ] DV-6 Hammer Save → exactly one row
- [ ] DV-7 `npm run build:release-apk` fails if `INTERNET` is present
- [ ] DV-8 A row with `deleted_at` 31 days ago is purged at launch; one on its last day survives
- [ ] DV-9 *(R1-8)* An FK violation after a migration shows the failure screen on **two** consecutive launches
- [ ] DV-10 *(R1-11)* Boot-failure status bar readable in light and dark

**Correctness**
- [ ] DV-11 Change the phone's date while backgrounded → Home and a "Last 7 days" filter update on resume
- [ ] DV-12 Rename a category → Home and ledger update; a 500-row bulk delete re-runs each mounted query once (`readQueryCount`)
- [ ] DV-13 Groups: the Goa example shows "Chirag owes Aarav ₹2,250" and "1 payment instead of 3"; "3 pairwise payments" with simplify off
- [ ] DV-14 Budget cycles and renewals across a month end (spot check against tests)
- [ ] DV-15 First-week script: backdate an expense to last quarter (≤ 3 taps); the Expense/Income switch drops an invalid category; delete → restore from Recently deleted; cold start in light and dark
- [ ] DV-16 Keyboard: note field and Save both visible while typing (edge-to-edge, gesture nav)
- [ ] DV-17 *(R1-7)* Ledger error → "Try again" recovers
- [ ] DV-18 *(R1-9, R1-10)* Theme switch with the ledger open repaints month headers and uncategorised rows
- [ ] DV-19 *(R3-6)* Group A → group B never shows A's balances under B's header
- [ ] DV-20 *(R4-7)* Every date field opens the same picker; back closes the sheet before the screen
- [ ] DV-21 *(R4)* Screenshot pass: every screen identical to the "before" set in both themes

**Performance (50k seeded DB)**
- [ ] DV-22 Dev harness benchmark: 24-month trend ≤ 50 ms; record every row in R5-5
- [ ] DV-23 A 500 ms artificial `SELECT` does not freeze the tab-bar droplet
- [ ] DV-24 Home paints in one frame; adding a transaction from Home causes no droplet stutter
- [ ] DV-25 Ledger scrolls 2,000 rows; adding a transaction then transfers ≤ one page (dev row-count log)
- [ ] DV-26 Switching Insights to 24 months is visually instant
- [ ] DV-27 *(R5-1)* Home amounts still animate, with one render per change

---

## Backlog (v1.1+)

| Item | Est. | Why deferred |
|---|---|---|
| Category `kind` editable in the category editor | ½ d | User categories are always `both` today, so they appear on both forms |
| Import-batch undo UI | 1 d | Needs 6A imports; `import_batches` exists |
| Groups: exact minimum-payments solver (≤ 12 members) | 1 d | Greedy + pairing is ≤ n − 1 and what Splitwise ships |
| Groups: share a reminder via the share sheet | ½ d | No `INTERNET` needed |
| Groups: recurring group expenses; copy your share into the ledger | 1–2 d each | Groups stay separate from the ledger by decision |
| Component tests (`jest-expo` + Testing Library) for forms | 2 d | Logic is covered in Node; UI verified on device |
| Multi-device sync | weeks | No server by design; `uid` columns already exist |
| Rollup tables | 2 d | Only if on-device timings exceed 50 ms at 50k (R5-5) |
| Multi-currency | 3 d | The web app is INR-only |
| Receipt photos | 3 d | Storage and the 25 MB auto-backup quota |
| Live Google Sheets sync · bank SMS capture | — | Need `INTERNET` / `READ_SMS`; break the privacy promise |

---

## Appendix — rules every task follows

1. **No network.** No `fetch`, HTTP client or base URL. `INTERNET` is dev-only.
2. **Money is integer paise.** Text → paise only via `parseAmountToPaise`; paise → text only via `formatINR`,
   `formatINRCompact`, `formatCount`. No `parseFloat` or `toLocaleString` outside `lib/money.ts`.
3. **Dates are `TEXT 'YYYY-MM-DD'`**; month aggregates filter the generated `month` column; **bound every
   range on both ends**.
4. **SQL only in the data layer**; aggregate in SQL; read via `useDbQuery` listing every base table.
5. **Writes:** `writeTx` with a synchronous callback; `safeWrite` returns `WriteResult`; rules throw `UserFacingError`.
6. **Soft delete** via `deleted_at`; every read filters it; unique indexes are partial.
7. **Every `category_id` / `person_id` FK** is handled by merge, delete and restore paths (R1-4's guard test).
8. **Schema changes** follow the migration runbook (R6-3); R-phases make none.
9. **Colours from tokens** via `useColors()`; `npm run theme:css` after palette changes.
10. **`useToday()`** for "today" in anything rendered.
11. **Dev-only code is guarded twice** (entry point + refusal).
12. **Tests run the shipped code**; never keep a hand-written copy of a query in a test.
13. **Every bug fix starts with a failing test.**
