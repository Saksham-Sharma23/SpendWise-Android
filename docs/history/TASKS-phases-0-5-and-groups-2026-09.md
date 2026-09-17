> **ARCHIVED 2026-09-17 — read-only history.** The live tracker is [`TASKS.md`](../../TASKS.md). Open items from this file were carried there; ticks and *Discovered* notes are kept here as the record of why the code looks the way it does.

# SpendWise Android — Task Tracker

> Companion to [`CLAUDE.md`](CLAUDE.md). Live plan with diagrams: https://claude.ai/code/artifact/cb2c502a-0993-439c-8abf-90b4524cb707
>
> **Standalone, offline-only app.** No server, no accounts, no network. See CLAUDE.md before starting.

**How to use this file**
- Tick `[x]` as you complete a task. Update the phase status line when a phase closes.
- Every task carries a **Why** — read it before starting. If the why no longer holds, the task may not either.
- **Do not close a phase until its Exit Criterion passes on the real phone.** An exit criterion is a test, not a feeling.
- New work discovered mid-phase goes in that phase's *Discovered* list, not silently into the task list.

**Progress**

| Phase | Name | Est. | Status |
|---|---|---|---|
| 0 | Foundations | 1–2 d | ✅ Done — verified on the phone 2026-09-13 |
| 1 | Database foundation | 3–4 d | 🟡 50k rows seeded on device — benchmark tap + DB pull pending |
| 2 | Transactions | 4–5 d | ✅ Code complete 2026-09-14 — awaiting the user's on-device check |
| 3 | Home dashboard | 3 d | ✅ Code complete 2026-09-14 — awaiting the user's on-device check |
| 4 | Budgets & Tracker | 4 d | ✅ Code complete 2026-09-14 — awaiting the user's on-device check |
| 5 | Analytics | 3 d | ✅ Code complete 2026-09-15 — awaiting the user's on-device check |
| 6A | Sheets: import and workspaces | 7–8 d | ⬜ Not started |
| 6B | Linked sheets | 4–5 d | ⬜ Not started |
| 7 | Backup & restore | 3–4 d | ⬜ Not started |
| 8 | Native layer | 3–4 d | ⬜ Not started |
| 9 | Hardening & Play Store | 4–5 d | ⬜ Not started |
| G | Groups — split expenses (v1.1, pulled forward) | 6.5 d | ✅ Code complete 2026-09-15 — awaiting the user's on-device check |

**Total: ~31–40 working days solo** (Phase 6 grew from a one-way import into sheets + linking on 2026-09-14). Phase 1 is the one to over-invest in — schema, migrations,
encryption and the query boundary are what everything else sits on, and all four are expensive
to change later.

---

## Phase 0 — Foundations
**Goal:** An empty but real app on your phone, with the theme and navigation shell in place.
**Est:** 1–2 days · **Status:** ✅ Done

- [x] **Create the Expo app with TypeScript strict and `expo-router`**
  *Why:* File-based routing mirrors the Next.js App Router you already know, so navigation costs no learning time. `strict` matters more than usual here because Drizzle generates types from the schema — strict mode is what turns a renamed column into a compile error instead of a runtime crash.
- [x] **Install NativeWind v4 + `react-native-reusables`; port tokens from the web `globals.css`**
  *Why:* Porting tokens now, before any screen exists, means every component is built against the real palette. Retrofitting a theme after twenty screens is a day of tedious diffing.
- [x] **Load Plus Jakarta Sans (300–800) via `@expo-google-fonts`, wire `lucide-react-native`**
  *Why:* Same typeface and same icon set as the web app, so icon choices port one-to-one and the two clients stay visually identical without sharing code.
- [x] **Build the tab shell: Home, Transactions, Insights, More, plus the centre FAB**
  *Why:* Navigation shape is the hardest thing to change later — it dictates where every future screen lives. Settle it while it costs nothing.
- [x] **Set up `eas.json` with development / preview / production profiles**
  *Why:* The profile split is what later lets the release build exclude Sentry and declare no `INTERNET` permission. Wiring it now avoids a rushed refactor at Phase 9.
- [x] **Run the first EAS development build and install it on the phone** *(done as a local arm64 Gradle build instead of EAS)*
  *Why:* Expo Go cannot load SQLCipher, MMKV, Skia or the widget plugin. Starting there means hitting the wall in Phase 1 and rebuilding the whole testing setup. One 12-minute cloud build now avoids that.
- [x] **Pair the phone over wireless debugging, confirm hot reload works** *(verified: a tab-bar edit hot-reloaded over Wi-Fi)*
  *Why:* This is your entire feedback loop for the next six weeks. Prove it works before you depend on it.
- [x] **Write `docs/ANDROID_CLAUDE.md`** *(or confirm `CLAUDE.md` covers it)*
  *Why:* The web app's context doc is why this plan could be written in such detail. The same investment here makes every future session productive from the first message rather than the tenth.

**Exit criterion:** The app cold-starts on your phone from a QR scan, all four tabs navigate, and an edit to a screen hot-reloads over Wi-Fi.

**Discovered during this phase:**
- **A memory-starved local build can produce a corrupt APK that still installs.** The first debug APK passed signature verification and installed, but crashed on launch with `Bad checksum` on `classes.dex` → `ClassNotFoundException: MainApplication`. The dex merge had run under memory pressure. Fix: stop Metro, delete `android/app/build`, rebuild with `--max-workers=1`, and check the zip CRC and each dex's adler32 before installing.
- **Launching the dev client:** `adb reverse tcp:8081 tcp:8081`, then `adb shell am start -a android.intent.action.VIEW -d "spendwise://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081"`. Start Metro with `CI` unset, or Fast Refresh is disabled.
- **Edge-to-edge Android draws a fixed-height tab bar under the system navigation buttons.** The bar must grow by the bottom safe-area inset.

---

## Phase 1 — Database foundation
**Goal:** Schema, migrations, encryption and the query boundary. Everything else sits on this.
**Est:** 3–4 days · **Status:** 🟡 Code complete — on-device timing pending

> **Over-invest here.** All four pillars of this phase are expensive to change once there is data
> on a device you cannot reach.

- [x] **Write `db/schema.ts`: `categories`, `transactions`, `budgets`, `subscriptions`, `import_batches`, `app_meta`**
  *Why:* This file is the single source of truth — every type in the app flows from it. Getting the table set right now means the rest of the app is typed correctly by construction.
- [x] **Amounts as `INTEGER` paise; dates as `TEXT` `YYYY-MM-DD`; soft delete via `deleted_at`**
  *Why:* SQLite has no decimal and no date type. A `Numeric(12,2)` becomes `REAL`, and floats lose money as one-paise drift that surfaces months later in a total that won't reconcile. `TEXT` dates sort lexicographically and group with `substr()`. `deleted_at` powers undo on both swipe-delete and whole import batches.
- [x] **Add indexes: `tx_date_idx`, `tx_cat_idx`, `tx_batch_idx`**
  *Why:* Every analytics query and the entire ledger read through these. Adding them now costs nothing; discovering they're missing at Phase 5 means re-timing every query.
- [x] **Configure `drizzle.config.ts` and generate the initial migration**
  *Why:* This is the Alembic analogue and the part you least want to hand-write. Establishing the generate-don't-edit habit on migration zero is how it survives to migration twelve.
- [x] **Enable SQLCipher via `useSQLCipher` in `app.config.ts`, key the DB at open** *(superseded 2026-09-14 — main DB becomes unkeyed; SQLCipher kept for encrypted backup files. See TASKS2 F0 / batch 1B)*
  *Why:* **Must happen before there is data.** Retrofitting encryption onto a populated database is a migration nobody wants to write. The DB holds a complete picture of someone's finances and leaves the device twice — via auto-backup and via export.
- [x] **Open the DB with `enableChangeListener: true`**
  *Why:* This single flag is what makes `useLiveQuery` work. Without it, writes don't re-render and you'll reach for a state library you don't need.
- [x] **Gate app launch on `useMigrations` behind the splash, with a failure recovery screen**
  *Why:* A failed migration is a permanently broken install with no server-side fix. The recovery screen offering *Restore from backup* is the difference between a bug report and a lost user.
- [x] **Seed system categories on first launch, matching the web app's set**
  *Why:* The server used to do this. A brand-new install with no categories can't record a transaction, so it's not optional.
- [x] **Write `lib/money.ts`: `toPaise`, `fromPaise`, `formatINR` with ICU assertion + fallback**
  *Why:* `toLocaleString("en-IN")` fails *silently* to US grouping where ICU is unavailable — `₹124,500.00` instead of `₹1,24,500.00` ships unnoticed. One helper, asserted at boot, unit-tested both ways.
- [x] **Build a debug seeder for 50,000 synthetic transactions across four years**
  *Why:* You cannot judge query performance on twelve rows. This seeder is the instrument for every performance decision in the plan.
- [ ] **Time every planned analytics query on the real phone; record the numbers**
  *Why:* Finding a slow trend query in Phase 1 is a five-minute index fix. Finding it in Phase 5 is a redesign of the Analytics screen.
- [ ] **Verify Drizzle Studio and `adb` DB pull both work**
  *Why:* With no API to curl and no network tab, the database *is* the system. Being able to see it is the difference between debugging and guessing.

**Exit criterion:** A populated 50k-row database opens, migrates, and answers a 24-month trend query in under ~50 ms on the actual device.

**Discovered during this phase:**
- `react-dom@19.3.0` is hoisted transitively and demands `react@^19.3.0`, conflicting with the SDK's pinned `react@19.2.3`. Fixed with an `overrides: { "react-dom": "19.2.3" }` entry in package.json. It is only a peerOptional here — we build Android, not web — so pinning it is safe. Expect to revisit on the next SDK bump.
- The blank TypeScript template ships no `babel.config.js`, so `babel-preset-expo` was not a dependency. Adding a Babel config without installing it fails the bundler with a bare `MODULE_NOT_FOUND`. Installed explicitly as a devDependency.
- `newArchEnabled` is no longer part of `ExpoConfig` in SDK 57 — the New Architecture is default-on, and declaring it is now a type error.
- **`android.permissions` does not remove anything — it only adds.** Omitting `INTERNET` from that list left it in the generated manifest anyway, because `expo-file-system` declares it in its own library manifest and the merger pulls it in. `npx expo config` showed it absent, which was misleading: the resolved config is not the merged manifest. Only `blockedPermissions` emits the `tools:node="remove"` that actually strips it. Caught by running `expo prebuild` under the production profile and reading `android/app/src/main/AndroidManifest.xml` directly. **Lesson: verify permission claims against the generated manifest, never against `expo config`.**
- `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` also arrive via `expo-file-system`, and `USE_BIOMETRIC` / `USE_FINGERPRINT` via `expo-local-authentication`. Storage is now blocked too; biometric is left in place since Phase 8 adds the optional app lock.
- `SYSTEM_ALERT_WINDOW` and `VIBRATE` come from React Native's **debug** manifest (`ReactAndroid/src/debug/AndroidManifest.xml`) for the dev overlay, so they do not appear in a release build.
- - **`expo-notifications` drags in the entire remote-push stack.** The real merged manifest (from `android/app/build/outputs/logs/manifest-merger-debug-report.txt` during a Gradle build) contained Firebase Cloud Messaging (`c2dm.permission.RECEIVE`), Play Install Referrer, `ACCESS_NETWORK_STATE`, and ~18 OEM launcher-badge permissions via its ShortcutBadger dependency — Samsung, Huawei, OPPO, HTC, Sony. We only schedule *local* notifications. All are now in `blockedPermissions`. `WAKE_LOCK` is deliberately kept: scheduled notifications need it to fire while the device is dozing.
- **Read the manifest-merger report, not just the manifest.** `android/app/build/outputs/logs/manifest-merger-debug-report.txt` names which library contributed each permission, which is the only practical way to find out why something you never declared is in your build.
- Added `db/__tests__/schema.test.ts` using `better-sqlite3`: applies the real generated migration and runs the real analytics queries against 50,000 rows in Node. It asserts `EXPLAIN QUERY PLAN` shows index usage rather than a scan, which is the property that decides whether a query stays fast at 200k rows. This does not replace on-device timing, but it catches wrong SQL and missing indexes without any hardware.
- - **A local native build OOMs on this machine at the default ABI set.** `./gradlew assembleDebug` compiles `expo-modules-core` C++ for all four ABIs (armeabi-v7a, arm64-v8a, x86, x86_64) in parallel; on 8 GB RAM clang gets killed mid-compile and reports `clang frontend command failed due to signal`. That message reads like a compiler bug but is memory pressure. Fix: `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` — the only ABI a modern physical phone uses. Added as the `android:local` npm script. EAS cloud builds are unaffected (they build on larger machines).
- **A shell pipeline hides Gradle's exit code.** `./gradlew ... | tail -30` returns `tail`'s status, so a failed build reported exit 0 and was briefly believed to have succeeded. Always redirect to a log and check the exit code separately, or read `BUILD SUCCESSFUL` / `BUILD FAILED` from the log itself.
- - **A stale `android/` folder silently ships the old permission policy.** After adding the FCM/badge blocks to `app.config.ts`, the debug APK still contained every one of them — because it was built from an `android/` directory generated *before* the edit. `blockedPermissions` only takes effect at prebuild. This was the third time in this phase that a proxy disagreed with the artifact (after `expo config` vs the manifest, and a shell pipeline hiding Gradle's exit code). **Standing rule: `rm -rf android && expo prebuild`, then verify with `aapt2 dump permissions` on the actual APK.**
- **SQLCipher ordering bug, found on device (fixed in `f8e3e21`).** `useMigrations` ran in the same component as the async SecureStore key read, so its effect fired first and created an **unencrypted** database; the later `PRAGMA key` then failed with `file is not a database`. Jest could not catch this (better-sqlite3 has no SQLCipher). Migrations now mount only after the key is applied; confirmed on the phone that the file header is ciphertext, not `SQLite format 3`.
- 50,000 rows seeded on the phone through the dev harness (≈13 MB). In a debug build the seed takes minutes, not seconds — JS is unoptimised and every chunk fires the change listener.
- - Added `db/benchmark.ts` and `app/dev.tsx` beyond the original task list: the exit criterion needed to be runnable on the phone in one tap rather than requiring a code edit. The benchmark also runs `EXPLAIN QUERY PLAN` per query, so it reports full table scans, not just timings — a query that is fast at 50k rows but scanning will not stay fast at 200k.

---

## Phase 2 — Transactions
**Goal:** Full CRUD over the local ledger, in mobile idioms.
**Est:** 4–5 days · **Status:** ✅ Code complete — the user verifies on the phone

- [x] **`features/transactions/queries.ts`: list, create, update, soft delete, search**
  *Why:* Establishes the query-boundary pattern the whole app follows. Screens call typed functions and never see a table name — this is the boundary the API used to give you for free.
- [x] **FlashList v2 over a paginated query** *(keyset pages: page 1 live, older pages by `(date, id) < (?, ?)`, refetched only when a change touches them — `useTransactionPages`, `features/transactions/pages.ts`; TASKS2 4A)*
  *Why:* Virtualising the list is not enough — paginate the *query* too. Loading 20,000 rows into memory to show twelve is the mistake that makes the app feel heavy.
- [x] **Sticky month header separators and pull-to-refresh** *(built 2026-09-14 — the earlier tick was premature)*
  *Why:* A ledger without date grouping is unreadable at scroll speed. Pull-to-refresh is muscle memory even when data is local.
- [x] **Add/edit modal with the segmented Expense/Income toggle at the top**
  *Why:* Direct port of the web app's most-used interaction. Type is the first decision, so it belongs at the top where the thumb lands.
- [x] **Port Zod schemas from the web repo; parse amounts to paise at the boundary** *(plus impossible-date rejection, e.g. 31 Feb)*
  *Why:* Schemas port verbatim — free correctness. Converting to paise at the form boundary means nothing downstream ever handles a float.
- [x] **Swipe-to-delete with an undo toast**
  *Why:* Swipe is the mobile idiom replacing a row menu. Undo is what makes an irreversible-feeling gesture safe, and `deleted_at` already supports it.
- [x] **Long-press multi-select and bulk delete**
  *Why:* Replaces the web table's row-selection checkboxes, which have no touch equivalent.
- [x] **Filters bottom sheet compiling to SQL `WHERE` clauses; chips summarise active filters** *(native `formSheet`; one removable chip per filter)*
  *Why:* Filtering in SQL rather than in JS keeps it fast at any ledger size. Chips exist so the user can see *why* the list looks empty.
- [x] **Search over note and category name**
  *Why:* Replaces the web app's global search. A `LIKE` against an indexed column is instant at this scale.
- [x] **CSV export via `expo-file-system` + share sheet** *(exports the current filter; paged append-only write; BOM, CRLF, formula-injection guard)*
  *Why:* Parity with the web app, and it doubles as a crude escape hatch before Phase 7's real backup exists.
- [x] **Category management: create, rename, recolour, merge** *(plus icon and delete; More → Categories and the form's Manage link)*
  *Why:* The server used to own categories. Merge specifically matters because the Phase 6 importer will create near-duplicates ("Food" vs "food") that need cleaning up.

**Exit criterion:** Every transaction operation works, and the list stays smooth scrolling the 50k-row debug database.

**Discovered during this phase:**
- **Folded in from TASKS2 while finishing this phase:** double-tap Save guard [D6], failed writes keep the form open with a specific toast via `safeWrite` [D9], selection clears when filters change [D8], 150 ms search debounce [S6], row `memo` compares drawn fields and `extraData` removed [S5], keyset pages [S4], `formatCount` replacing `toLocaleString` in counts [S7, partial].
- **Category merge and delete are tested against the real migrated schema** (`features/categories/__tests__/mutations.test.ts`), including a forced mid-merge failure that must roll back.
- **Keyset pages are proven in SQL** (`keyset.test.ts`): pages tile the ledger exactly once, a top insert doesn't shift older pages, and the page query has no temporary sort. The staleness rules are pure and unit-tested (`pages.test.ts`).
- **Swipe-gesture cost [S5] is not measured yet** — it needs the phone's frame counter, so it stays in TASKS2 batch 4A.

---

## Phase 3 — Home dashboard
**Goal:** The dashboard re-composed for one column, with the first real chart.
**Est:** 3 days · **Status:** ✅ Code complete — the user verifies on the phone

- [x] **`features/dashboard/queries.ts`: summary, recent, 12-month trend** *(plus this-vs-last-month in one query, and top categories)*
  *Why:* Home fires the most queries of any screen. Writing them together makes it obvious where they overlap and can share.
- [x] **`components/charts/TrendChart` with a Bar/Line toggle** *(Reanimated bars + react-native-svg line instead of victory-native — no rebuild; see Discovered)*
  *Why:* First Skia chart — build it as a reusable wrapper, because Analytics reuses it in Phase 5. If charts ever need swapping, the change stays contained to these wrappers.
- [x] **Summary cards and the dynamic `FinancialInsight` banner** *(rules in `lib/insight.ts`, month-to-date vs the same days last month, 8 tests)*
  *Why:* The banner is what makes the dashboard feel like it's paying attention rather than just reporting.
- [x] **Budget overview card that deep-links to Budgets** *(empty-state card for now — real progress needs Phase 4)*
  *Why:* This is *the* reason Budgets can live under More instead of taking a permanent tab slot.
- [x] **Upcoming renewals card that deep-links to Tracker** *(computed on read in `lib/renewals.ts`, 6 tests; shows a Tracker prompt until subscriptions exist in Phase 4)*
  *Why:* Same argument for Tracker, and it's the in-app half of the reminder system built in Phase 8.
- [x] **Recent transactions section**
  *Why:* Most sessions are "what did I just spend" — answering it on Home saves a tab switch.
- [x] **First-run onboarding: add first transaction · import a sheet · restore a backup** *(shown while the ledger is empty and not skipped; `app_meta` `onboarding_dismissed`)*
  *Why:* There is no account with data to sync down. A new install is genuinely blank, and an empty dashboard with no next step reads as broken.
- [x] **Audit live-query subscriptions — narrow, per-widget, never app-wide** *(done in TASKS2 F3: every Home query is its own `useDbQuery` listing its base tables, coalesced per burst of writes, paused while Home is unfocused, executed off the JS thread)*
  *Why:* Home is where this bites first: six widgets subscribing broadly means every write re-runs every query. It presents as vague slowness, not an obvious bug, so catch it deliberately.

**Exit criterion:** Home paints in a single frame on the 50k-row database, and a new install shows a useful empty state rather than a blank screen.

**Discovered during this phase:**
- **UI redesign (`8d80682`) pulled part of this phase forward.** The user asked for the app to match the web version's look (near-black, graphite cards, lime accent). Home became a real dashboard in the process.
- **Decision: the trend chart uses Reanimated views, not victory-native.** Bars are animated `View`s. That needs no new native module (no APK rebuild) and handles 6–12 bars easily. Revisit victory-native/Skia in Phase 5, where the 24-month scrubbable area chart genuinely needs it.
- **Reanimated rejects exponent notation in colour strings.** An animated `rgba(…, ${alpha})` template produced `2.1e-7` near the end of a timing curve and threw `Invalid color value`. Use `interpolateColor` instead.
- **The design is dark-only for now,** matching the web app. A theme toggle belongs in Settings (Phase 9).
- **Home waits for real answers before choosing a layout.** Welcome shows only when both "has transactions" and "onboarding dismissed" are `ok`; the insight and renewals render nothing while pending — so no empty state or welcome flashes on launch (convention #12).
- **Presentational pieces live below features:** `components/charts/TrendChart`, `components/ui/InsightBanner`, `components/ui/RenewalsCard`, `components/layout/Welcome` take data and callbacks only, so Phase 5 Insights and Phase 4 Tracker can reuse them.

---

## Phase 4 — Budgets & Tracker
**Goal:** Both secondary features, including the two trickiest pieces of ported logic.
**Est:** 4 days · **Status:** ✅ Code complete — the user verifies on the phone

> The two date-arithmetic ports in this phase are the most bug-prone code in the project.
> They are also easy to unit-test, which is why testing them is a task and not a suggestion.

- [x] **`features/budgets/queries.ts`: spend-against-limit over the reset-day cycle window** *(one pass for every budget: each contributes its own `(category, start, end)` clause, so ten reset days cost one query. Proven against the migrated schema in `__tests__/spend.test.ts`)*
  *Why:* The cycle window is not a calendar month — a budget resetting on the 15th spans two months. Getting the window wrong makes every budget figure quietly incorrect.
- [x] **Port `getDaysLeftInCycle` and cycle window arithmetic to TypeScript** *(`getCycleWindow` in lib/dates — one implementation, used by the Budgets screen, Home and Phase 8's alerts)*
  *Why:* Direct port from the web app, where it had to be kept in sync across two files. One implementation here, used everywhere.
- [x] **Budgets list with MiniDonut, days-left, 75% amber, over-budget banner** *(`components/charts/MiniDonut` — an animated dash offset, not a rebuilt arc path; thresholds are pure and tested in `progress.test.ts`)*
  *Why:* Parity. The 75% threshold is the useful one — being told you're over budget after the fact isn't actionable.
- [x] **Budget create/edit modal** *(shows the window the chosen reset day produces, since "the 15th" is ambiguous; pause/resume while editing)*
- [x] **The amount is set on an alarm-clock dial** *(user's idea, 2026-09-15. One turn covers the chosen scale — 10k / 1L / 10L — in 100 notches, so the resistance feels the same at every scale and only the number moves faster. `features/budgets/dial.ts` is pure and has 20 tests; the gesture runs on the UI thread and crosses to JS once per notch, not per frame. Tapping the figure still opens the keypad)*
  *Why:* Completes CRUD. Keep `limit_amount` in paise, consistent with everything else.
- [x] **Port `_enrich` renewal calculation: advance `anchor_date` by cycle until ≥ today, month-end clamped** *(`features/tracker/renewal.ts`; nothing is stored, so the figures cannot go stale)*
  *Why:* The self-correcting design means no background job is needed — renewal is always computed on read. Month-end clamping is what stops a 31 Jan subscription from breaking in February.
- [x] **Unit-test renewal against month-end edge cases (31 Jan → Feb, leap years)** *(26 tests: 31 Jan → 28 Feb → recovers 31 Mar; a 29 Feb yearly anchor in a non-leap year and its recovery in 2028)*
  *Why:* This is precisely the code that looks right and is wrong four months later. Tests are cheap here because the function is pure.
- [x] **Subscriptions list with status filter and renewal/amount/name sort** *(cost sorts by the MONTHLY equivalent, so a yearly plan ranks against a monthly one honestly)*
  *Why:* Parity with the web Tracker.
- [x] **Port `group-utils.ts` for deterministic icon and colour** *(`features/tracker/identity.ts`, plus `lib/icons.ts` so the names it returns are provably ones the renderer knows)*
  *Why:* Deterministic means Netflix looks the same on both clients with nothing persisted.
- [x] **Urgency countdown with `ok` / `soon` / `muted`** *(the web app's value names, not colour names)*
  *Why:* Use the web app's exact value names — not colour names — so behaviour matches and the values stay meaningful when theming changes.
- [x] **Kebab actions: Edit, Pause/Resume, Cancel, Delete** *(all four undoable by toast; pause/resume/cancel are one status change, as on the web)*
  *Why:* Parity. All are status changes rather than separate operations, mirroring the web design.
- [x] **`monthly_cost` normalisation: monthly ×1, yearly ÷12, quarterly ÷3, weekly ×52÷12** *(`toMonthlyPaise`, rounded in paise — never a fractional paise)*
  *Why:* Comparing a yearly and a weekly subscription needs a common unit. Do the division in paise with explicit rounding, not floats.

**Exit criterion:** Budget cycles and subscription renewals compute correctly across month-end and leap-year boundaries, proven by tests. ✅ 44 tests across `features/budgets/__tests__` and `features/tracker/__tests__`.

**Discovered during this phase:**
- **lib/dates already held both hard ports** (`getCycleWindow`, `getNextRenewal`) with 40 tests from Phase 1, so this phase built the query and UI layers on top rather than re-deriving the arithmetic. Over-investing in Phase 1 paid exactly as the plan predicted.
- **Home cannot import features/budgets** (#9: no sibling imports), so the Home card's figures come from `useDashboardBudgets` in the dashboard's own query file, reaching the SAME `getCycleWindow` through lib/. The duplication is the query, never the arithmetic.
- **The icon vocabulary moved to `lib/icons.ts`.** The Tracker's deterministic icons have to agree with what `CategoryIcon` can draw, and a test asserting that could not import the component (it pulls in React Native and dies under Node). Plain data in lib/ fixes both, and a test now keeps the name list and the component's mapping in step.
- **Subscriptions still create no transactions,** matching the web app. `reminder_days_before` is stored but nothing fires yet — notifications are Phase 8, and the form says so rather than implying a reminder is set.
- **Phase 8 hook already in place:** `budgetProgressForCategory` gives the 75%/100% alert the same figure the screen shows, so the alert cannot disagree with the bar.

---

## Phase 5 — Analytics
**Goal:** The chart-heavy screen, all aggregation in SQL.
**Est:** 3 days · **Status:** ✅ Code complete 2026-09-15 — the user verifies on the phone

- [x] **`features/analytics/queries.ts`: trend, by-category, summary, stat cards — all `GROUP BY`** *(builders in `features/analytics/sql.ts`, hooks in `queries.ts`. Five aggregates: trend, range totals, earliest date, biggest expense, category totals. Proven against the migrated schema, plans included, in `__tests__/sql.test.ts`)*
  *Why:* The rule that makes this screen viable: never `SELECT` rows you intend to sum. 50k rows aggregate to 24 in the engine; JS never sees more than two dozen objects.
- [x] **Spending-trend area chart with the 3/6/12/24-month selector** *(`components/charts/AreaChart`; one range drives the summary, trend and stat cards together, so every figure describes the same period)*
  *Why:* Parity. The 24-month range is the stress case — it's the one to time.
- [x] **Touch scrubber with value tooltip, driven by Reanimated on the UI thread** *(guide and dots move in worklets; JS hears about it once per month crossed, never per frame. Horizontal drag scrubs, vertical drag still scrolls the page, tap selects, TalkBack can step months)*
  *Why:* The one interaction genuinely better than the web version. On the UI thread so it stays smooth while JS is busy.
- [x] **Category donut with month selector** *(`components/charts/Donut`; the picker is bounded by the ledger's first month and the current one; tap a segment or legend row to see its share; a long tail folds into "Other")*
  *Why:* Parity, and the most-looked-at chart in the web app.
- [x] **Stat cards: avg/day, biggest expense, top category, savings rate** *(arithmetic in `features/analytics/period.ts`, 19 tests; the biggest-expense card opens that transaction)*
  *Why:* Parity. Each is a one-line SQL query, so they're nearly free once the query file exists.
- [x] **Take every chart colour from `lib/theme.ts` tokens — no literals** *(enforced by `components/charts/__tests__/tokens.test.ts`, which fails on any hex/rgb/hsl literal in the chart components or the Analytics screen)*
  *Why:* The app is dark-only in v1 (decided 2026-09-14), with a light theme arriving as a Settings toggle in Phase 9. Skia doesn't inherit CSS, so charts that read tokens switch for free; charts with hardcoded colours need rework then.
- [x] **Re-time every query on the 50k database, confirm no regression** *(the seven Analytics queries are in the dev harness benchmark — More → Dev harness → Run analytics benchmark. Plans are asserted in Node at 50k rows; the on-device numbers are the user's check)*
  *Why:* Closes the loop opened in Phase 1. Query performance drifts as `WHERE` clauses accumulate.

**Exit criterion:** Analytics matches the web screen, and switching to the 24-month range is visually instant on the real phone.

**Discovered during this phase:**
- **Decision: charts stay on react-native-svg + Reanimated, not victory-native/Skia.** Phase 3 deferred this to Phase 5 "where the scrubbable area chart genuinely needs it". It didn't: at most 24 points, the scrubber animates a guide line and two dots through `useAnimatedProps` on the UI thread, and nothing rebuilds a path per frame. Staying put means Phase 5 ships over the air with no native rebuild, and Skia's APK cost is avoided. Revisit only if a chart needs thousands of points.
- **Query builders take the database as a parameter** (`sql.ts`), instead of closing over `readDb`. The phone passes `readDb`; the tests pass a better-sqlite3 Drizzle handle. So `sql.test.ts` runs the *shipped* SQL, where `budgets/spend.test.ts` had to keep a hand-written copy in step. Worth using for new query files.
- **Biggest expense uses SQLite's bare-column `max()`**, not `ORDER BY amount DESC LIMIT 1`. With a single `max()`, SQLite fills the other columns from the row holding the maximum, in one pass on `tx_month_idx` with no temporary B-tree. A test asserts that plan.
- **Category totals report a TEMP B-TREE in the benchmark, by design.** The sort runs over one row per category, not per transaction, after an index range scan, so it does not grow with the ledger.
- **"Avg per day" counts days from the later of the range start and the first transaction.** Without the clamp, a ledger started last week, viewed over 24 months, divides a week of spending by 730 days.
- **Donut taps are hit-tested by angle** (`geometry.hitArc`). Every segment is the same stroked circle, so SVG's own touch handling always gave the touch to whichever segment was drawn last.
- **`smoothPath` moved to `components/charts/geometry.ts`**, alongside the new pure chart maths, so it is testable in Node. `TrendChart` re-exports it.
- **The light theme landed before this phase** (`93a8441`), so "tokens only" was immediately testable in both themes rather than a Phase 9 promise.

---

## Phase 6A — Sheets: import and workspaces
**Goal:** Bring spreadsheets into the app as separate, editable workspaces — not as ledger rows.
**Est:** 7–8 days · **Status:** ⬜ Not started · **Design:** `CLAUDE.md` → *Sheets — imported and linked spreadsheets*

> **The model, decided 2026-09-14.** Each imported `.csv`/`.xlsx` becomes its own **sheet**: a
> workspace the user views, edits and exports separately from the app's own transactions. The app
> edits **its own copy**; the original file is never written to silently. A sheet can opt in to
> the dashboard/budgets/analytics totals. Linking a sheet to the ledger is Phase 6B.

> Expect this to overrun. The difficulty is never the code — it is that real spreadsheets
> disagree about dates, signs, and where the amount lives.

- [ ] **Collect five genuinely different real spreadsheets as fixtures — FIRST**
  *Why:* Writing the parser before seeing real input means designing for imagined problems and missing actual ones. Include at least one **heavily styled** `.xlsx` (colours, merged header, column widths, a formula total), one bank `.xls`, one personal tracker and one CSV. **Do this before any parsing code.**
- [ ] **Spike: ExcelJS round-trip on the styled fixture, on the real phone (1 day, go/no-go)**
  *Why:* The user chose "formatting must be preserved". SheetJS Community drops cell styles on write; ExcelJS keeps them but is heavy and depends on Node shims (`Buffer`, streams) under Hermes. Prove it before building on it: load the styled fixture, append 200 rows, write, open the result in Excel and Google Sheets, and check fills, fonts, borders, merged cells, widths, number formats, frozen panes, formulas and conditional formatting. Time a 10k-row write. **If it fails**, choose between a native Apache POI module (APK size cost) and preserving header/column styling only — and record the decision here.
- [ ] **Schema: `sheets`, `sheet_columns`, `sheet_rows` (+ generated migration)**
  *Why:* Rows keep their raw cell text **and** normalised `date` / `amount_paise` / `type` / `category_id` columns. Raw text is what gets exported, so nothing the user typed is lost; the normalised columns are what let SQL aggregate a sheet (CLAUDE.md #5) when it is included in totals.
- [ ] **Store the original file as the export template under `files/sheets/<id>/`**
  *Why:* Formatting can only be preserved if the original workbook survives as a template. It lives in app storage, not the database — a 5 MB workbook as a BLOB bloats every query and the backup.
- [ ] **Pick + parse multiple files at once: `File.pickFileAsync({ multipleFiles: true })`, SheetJS for `.xls`/`.xlsx`, papaparse for `.csv`**
  *Why:* The user imports several files in one go. SheetJS stays the reader because it handles legacy `.xls` (which ExcelJS cannot read); ExcelJS is only the style-preserving writer. The picker already takes a persistable URI grant, which Refresh relies on later.
- [ ] **Tab picker for multi-tab workbooks; header-row detection**
  *Why:* One workbook often holds a tab per month. Bank exports put a logo block above the real header, so the header row is detected (first of 15 rows with the most non-numeric cells) and overridable.
- [ ] **Map columns: fuzzy header guessing, two-column debit/credit mode, extra columns kept as-is**
  *Why:* Mapping tells the app which columns mean date / amount / type / note / category. Unmapped columns are **kept and editable** — a user's "Paid by" or "Card" column is their data, not noise. Presets saved to MMKV by header fingerprint make re-imports two taps.
- [ ] **Normalise: Excel serial dates, dd/mm vs mm/dd picker, ₹ and DR/CR parsing straight to paise**
  *Why:* `03/04/2026` is genuinely ambiguous and guessing wrong silently corrupts a year of data. Show three sample rows and let the user decide. Parse to paise directly — never via a float. Rows that fail normalisation stay in the sheet, flagged, rather than being dropped.
- [ ] **Map sheet category text to app categories (unknown → Uncategorised, original text kept)**
  *Why:* Totals by category need `category_id`, but the cell must still export exactly as the user wrote it.
- [ ] **Sheets list (More → Sheets): name, row count, badges for Linked / In totals / Unexported changes**
  *Why:* Sheets are now a place, not a one-off wizard, so they need a home. The FAB long-press still jumps straight to import.
- [ ] **Sheet workspace with THREE view modes, chosen in Settings (per-sheet override)**
  *Why:* The user wants the choice. **Cards + form** (easiest on a phone), **Grid** (spreadsheet-style, tap a cell to edit), and **Cards with a grid toggle**. All read the same rows through FlashList, so the modes differ only in presentation. Default: cards with grid toggle.
- [ ] **Row CRUD inside a sheet: add, edit, delete (soft), reorder; search and filter within the sheet**
  *Why:* "View and edit them individually" is the core ask. Soft delete gives undo, as in the ledger.
- [ ] **"Include in my totals" toggle per sheet, via a `money_rows` SQL view**
  *Why:* The view is `transactions` UNION ALL included sheet rows (excluding mirrored rows, which would double count). Moving the dashboard, budget and analytics queries onto the view once, here, is far cheaper than teaching every query about sheets separately.
- [ ] **Export a sheet: `.csv`, or `.xlsx` rebuilt from the template with styling preserved; via share sheet**
  *Why:* "App's copy + export" is the chosen model — the updated file only reaches Excel when the user exports it. New rows copy the style of the last data row. Default is "Save a copy"; "Replace the original file" is an explicit option that first checks the original has not changed since import.
- [ ] **Refresh from file, with review: new / changed / removed rows, per-row accept, app edits kept by default**
  *Why:* The user will keep editing the original in Excel. Diff by source row position + content hash recorded at the last import or export; show conflicts where both sides changed the same row and let the user choose.
- [ ] **Chunk parsing and exporting through `InteractionManager` with a progress bar**
  *Why:* Parsing or writing thousands of rows synchronously freezes the UI thread, and a frozen progress bar reads as a crash.
- [ ] **Bundle HDFC / ICICI / SBI mapping presets**
  *Why:* Turns mapping into preview-and-confirm for the exports people actually have.

**Exit criterion:** All five fixtures import as separate sheets; rows can be edited in all three view modes; an included sheet changes the dashboard totals and an excluded one does not; the styled fixture exports with its formatting intact in Excel; refresh correctly shows rows changed in Excel.

**Discovered during this phase:**
- _(none yet)_

---

## Phase 6B — Linked sheets
**Goal:** Transactions added in the app automatically appear in chosen sheets, in each sheet's own column order and format.
**Est:** 4–5 days · **Status:** ⬜ Not started · **Depends on:** 6A

- [ ] **Schema: `sheet_links` (rules + field→column mapping + formats) and `sheet_row_links` (transaction ↔ row)**
  *Why:* `sheet_row_links` is what makes edits and deletes mirrorable. Because the app owns its copy of the sheet, row identity is tracked internally — **no ID column is ever added to the user's sheet**.
- [ ] **Link setup: pick columns and their order, date format, amount style, type representation, defaults for extra columns — with a live preview row**
  *Why:* "In a selected order and formatting." Amount styles: plain `1234.50`, grouped `₹1,24,500.00`, negative-for-expense, separate debit/credit columns, or a type column (`Expense`/`Income` or `DR`/`CR`). Date styles: `dd/mm/yyyy`, `yyyy-mm-dd`, `d MMM yyyy`.
- [ ] **Rules per link: type, categories, optional amount range; many links active at once**
  *Why:* The user chose rules per sheet and multiple linked sheets. A transaction matching two links lands in both.
- [ ] **Insert position per link: append at the end, or keep the sheet in date order**
  *Why:* A running log wants append; a sorted monthly sheet wants date order.
- [ ] **Mirror on write: create → insert row; edit → update mapped cells; delete → soft-delete row; undo → restore**
  *Why:* The user chose "mirror all changes". Run inside the same `db.transaction()` as the ledger write, so the ledger and the sheet can never disagree after a crash.
- [ ] **Re-evaluate rules on edit: a transaction that no longer matches leaves that sheet, with a toast**
  *Why:* Changing a category from Food to Travel should move it out of the Food sheet — visibly, not silently.
- [ ] **Add form shows destination chips ("→ Food log.xlsx") with a per-transaction skip**
  *Why:* Automatic writes into someone's spreadsheet must never be a surprise.
- [ ] **Backfill on link creation: "Add N existing matching transactions?"**
  *Why:* Linking a sheet halfway through the year should not leave the first half missing.
- [ ] **Mirrored rows excluded from totals, always**
  *Why:* A transaction already counts once in the ledger. If the linked sheet is also included in totals, counting its mirrored rows would double it.
- [ ] **"Unexported changes" badge and export reminder on linked sheets**
  *Why:* With the app-copy model the original file goes stale until the user exports. Make that state visible.

**Exit criterion:** With two linked sheets and different rules, adding, editing, re-categorising and deleting transactions in the app produces exactly the right rows in each sheet; an export opens in Excel with the chosen order and formats; totals never double count.

**Discovered during this phase:**
- _(none yet)_

---

## Phase 7 — Backup & restore
**Goal:** The feature that makes a standalone app responsible rather than reckless.
**Est:** 3–4 days · **Status:** ⬜ Not started

> **The highest-stakes phase.** Every other feature failing is an annoyance. Backup failing is
> permanent loss of data a person typed in by hand, transaction by transaction, over years.

- [ ] **Export the database as `.db` via `expo-file-system` + `expo-sharing`**
  *Why:* A byte-exact copy is the most reliable restore possible. The share sheet means the user picks where it goes — Drive, WhatsApp to self, SD card — without the app needing any network permission.
- [ ] **Export as `.json` with a `schema_version` header**
  *Why:* Readable, diffable, and still restorable if the schema moves on. `.db` is exact but opaque; `.json` is the long-term insurance.
- [ ] **Optional passphrase on `.db` export, with a clear warning about losing it**
  *Why:* The export is the copy that leaves the phone — Drive, WhatsApp, an SD card — so since 2026-09-14 it is the only place the app adds its own encryption. Write it with SQLCipher (`ATTACH '<file>' AS enc KEY '<passphrase>'` then `SELECT sqlcipher_export('enc')`); restore attaches with the same passphrase. The warning matters — a forgotten passphrase means the backup is gone.
- [ ] **Include sheets in backup: the sheet tables AND the template files under `files/sheets/`**
  *Why:* A sheet restored without its original workbook can still be edited but can no longer export with its formatting. The templates live outside the database, so a `.db`-only backup would silently miss them.
- [ ] **Restore: validate `schema_version` and row counts before touching anything** *(include the Groups tables from migration 0007; `split_debts` is derived and can be rebuilt from payers + shares if a `.json` restore omits it)*
  *Why:* Restoring a corrupt or wrong-version file over good data is the worst possible outcome. Validate first, refuse clearly, change nothing.
- [ ] **Snapshot the current database before overwriting on restore**
  *Why:* Restore is the single most destructive action in the app. A user who picks the wrong file must not lose the right data.
- [ ] **Enable Android auto-backup (`allowBackup`), confirm the DB is included — and that it opens on a second device**
  *Why:* Nearly free durability for the common case of upgrading phones. Invisible to the user, which is exactly its value — and its limitation. "Included" is not enough: a Keystore-keyed database was included and still unopenable after restore, which is why the main DB is unkeyed (TASKS2 F0).
- [ ] **Surface database size and last-backup date in Settings**
  *Why:* The auto-backup cap is 25 MB and silent when exceeded. Showing size is how the user finds out before it matters.
- [ ] **Monthly backup reminder, only when `last_backup_at` > 30 days old**
  *Why:* This is what turns manual export from a feature nobody uses into one they do. The staleness check matters — a reminder firing the day after you backed up is the fastest route to disabled notifications.
- [ ] **Backup history screen listing prior exports**
  *Why:* "Did I ever back this up?" should be answerable without leaving the app.

**Exit criterion:** Export, uninstall, reinstall, restore — row counts and totals match exactly, verified on the real phone.

**Discovered during this phase:**
- _(none yet)_

---

## Phase 8 — Native layer
**Goal:** The two capabilities that justify a native app.
**Est:** 3–4 days · **Status:** ⬜ Not started

- [ ] **Create three notification channels: Renewals, Budget alerts, Backup**
  *Why:* Android silently drops notifications posted to a channel that was never created — no error, no log, just nothing. Separate channels also let the user mute one kind without losing the others.
- [ ] **Request `POST_NOTIFICATIONS` in context, on first subscription save**
  *Why:* Android 13+ requires a runtime grant. Asking at launch, before the user knows what notifications are for, is how you get a permanent denial.
- [ ] **Reschedule the full reminder set after any subscription write — cancel-all, never diff**
  *Why:* Diffing scheduled notifications against desired state is fiddly and fails silently. Cancel-all-and-reschedule is idempotent and obviously correct.
- [ ] **Budget threshold alerts at 75% and 100%, evaluated after each transaction write**
  *Why:* The alert is only useful *before* you overspend, which means evaluating on write rather than on a schedule.
- [ ] **Add `RECEIVE_BOOT_COMPLETED`, verify reminders survive a reboot**
  *Why:* Scheduled alarms are cleared on reboot. Without this, reminders quietly stop and nobody notices for a month.
- [ ] **Build the home-screen widget with `react-native-android-widget`**
  *Why:* The strongest argument for a native app over a web page. It puts the number on the home screen where it changes behaviour.
- [ ] **Write the widget snapshot to MMKV after each write**
  *Why:* RemoteViews have no JS runtime, no state and no ability to fetch. The widget can only render what the app has already written down.
- [ ] **Deep-link the widget tap into the add-transaction modal**
  *Why:* Two taps from home screen to a logged expense. This is the whole point of the widget.
- [ ] **FAB long-press menu into the import wizard**
  *Why:* Import is a deliberate, occasional action — discoverable via long-press without spending a permanent slot on it.
- [ ] **Optional biometric lock via `expo-local-authentication`**
  *Why:* There is no login screen, so the phone's lock is the only gate. Meaningful now that this device holds the only copy of the data.
- [ ] **App icon, adaptive icon, splash screen, haptics on primary actions**
  *Why:* The difference between "a project" and "an app". Haptics on add/delete give physical confirmation that a thing happened.

**Exit criterion:** A reminder fires on the right morning after a reboot, and the widget adds a transaction in two taps from the home screen.

**Discovered during this phase:**
- _(none yet)_

---

## Phase 9 — Hardening & Play Store
**Goal:** Prove the dangerous paths, then ship.
**Est:** 4–5 days · **Status:** ⬜ Not started

- [ ] **Full backup drill: populate → export → uninstall completely → reinstall → restore → verify totals**
  *Why:* The only test that proves the app is safe to rely on. Do it on the real phone — an emulator's storage behaviour is not the same. Repeat before every release that touches the schema.
- [ ] **Migration drill: apply the next migration to a copy of a populated database**
  *Why:* Migrations tested on empty tables prove nothing — empty tables hide every constraint violation. A migration that throws on a real device is a permanently broken install.
- [ ] **Settings: theme, currency display, notification preferences, data management**
  *Why:* Parity with the web settings pages, minus everything account-related.
- [ ] **Delete-all-data with a typed confirmation**
  *Why:* Required for a Play listing, and the typed confirmation exists because there is no server-side copy to recover from.
- [ ] **Confirm the release build declares no `INTERNET` permission (decide on Sentry)**
  *Why:* "This app cannot transmit your financial data anywhere, and Android enforces that" is a genuinely strong claim for a finance app. Sentry requires `INTERNET` — keep it in the dev profile only to preserve the claim.
- [ ] **Write the privacy policy and host it**
  *Why:* Mandatory for a Play listing. It's short here, because there is nothing to disclose.
- [ ] **Complete the Data Safety declaration — no data collected or transmitted**
  *Why:* Nearly empty, which makes it the easiest possible submission. Draft it *before* the first upload, not after a rejection.
- [ ] **Generate the upload key, configure EAS signing, build the AAB**
  *Why:* The upload key is unrecoverable if lost — losing it means you can never update the listing again. Back it up as carefully as user data.
- [ ] **Test on a second physical device with a different Android version**
  *Why:* Notification behaviour, storage paths and permission prompts vary meaningfully across versions and OEM skins.
- [ ] **Ship to the internal testing track**
  *Why:* A real Play install by someone who is not you is the only way to catch packaging and permission problems.

**Exit criterion:** A tester who is not you installs from Play, imports a spreadsheet, gets a renewal reminder, exports a backup, and restores it on another device.

**Discovered during this phase:**
- _(none yet)_

---

## Groups — split expenses with friends (v1.1, pulled forward 2026-09-15)
**Goal:** Splitwise-simple group and 1:1 expense splitting, fully offline, with heap-based debt simplification.
**Est:** 6.5 days (grew from 4: unequal splits, multiple payers, friends and stats added) · **Status:** ✅ Code complete 2026-09-15 — the user verifies on the phone

> Kept entirely **separate from the ledger** (decided 2026-09-15): no group expense or settlement
> creates a transaction or moves a budget, Home or Insights figure.

- [x] **G1 · The money core, pure and property-tested** *(`lib/heap.ts`; `features/groups/split.ts` — exact largest-remainder splits: equal, exact, percent in basis points, shares; `debts.ts` — per-expense debts, pairwise netting, `simplifyDebts`. 34 tests, thousands of random splits and groups each)*
  *Why:* A rounding error in a split is money that silently vanishes. This is the code that has to be right before any screen exists.
- [x] **G2 · Schema, migrations, queries, writes** *(migration 0007: `people`, `split_groups`, `group_members`, `split_expenses`, `split_expense_payers`, `split_expense_shares`, `split_debts`, `settlements` — new tables only, no rebuild; custom 0008 seeds "You" (`sys:self`). `sql.ts` builders and `writes.ts` take the db, so `writes.test.ts` runs the shipped code end to end on the migrated schema)*
  *Why:* Balances are derived on read (never stored), so they cannot drift from the expenses behind them.
- [x] **G3 · Hub, groups and friends** *(More → Groups: overall owed/owe, Groups · Friends switch, create/edit group with members and the simplify toggle, add/rename/remove friend)*
- [x] **G4 · The expense form** *(Splitwise's sentence: "With you and [group] · Paid by [you] and split [equally]"; paid-by sheet with multiple payers; split sheet with Equal / Exact / Percent / Shares and live "₹120 left" footers from `draft.ts`, 9 tests; edit rebuilds exactly what was typed; delete with undo)*
- [x] **G5 · Balances, settle up, friend view** *(who-owes-whom sheet with a Settle button per payment and "1 payment instead of 3"; settle-up from a group or a suggestion; friend settle-up spread across shared groups oldest-first, all or nothing)*
- [x] **G6 · Group totals** *(total spend, your share vs what you paid, category donut reusing `components/charts/Donut`, each person's share)*

**Exit criterion:** For any sequence of expenses and settlements, every group's nets sum to exactly 0 paise and suggestions never change a net (proven by property tests). The Goa example — Aarav paid ₹6,000 hotel ÷3, Bhavna ₹3,000 cab ÷3, Chirag ₹1,500 dinner ÷2 with Aarav — shows "Chirag owes Aarav ₹2,250" and "1 payment instead of 3" on the phone, and "3 pairwise payments" with simplify off.

**Discovered during this phase:**
- **Simplification = pairing pre-pass + two max-heaps.** Exactly equal-and-opposite balances are paired first; the rest go greedy (largest debtor pays largest creditor). The pre-pass is not decoration: for +400, +600, −400, −300, −300 greedy alone needs 4 payments, the pre-pass finds the minimum 3 (a test pins it). The true minimum is NP-hard; ≤ n − 1 payments is guaranteed.
- **Spreading a multi-payer debt must use creditors' REMAINING amounts.** Allocating each debtor independently gave two debtors' odd paise to the same creditor (two creditors +1, two debtors −1 → one creditor paid 2). `expenseDebts` allocates against what each creditor is still owed, which keeps every column exact.
- **Drizzle renders `${table.column}` unqualified in a single-table select.** Inside a correlated subquery (`… WHERE m.group_id = ${splitGroups.id}`) SQLite then bound `id` to the INNER table — member counts came back wrong. Subqueries now reference `split_groups.id` literally; caught by `writes.test.ts`.
- **A raw `db.all(sql\`…\`)` returns bare value arrays through the sqlite-proxy read handle** (no field names). Every union query goes through `select({...}).from(sql\`(…) x\`)`, which maps by position and keeps `toSQL()` for plan checks.
- **A 1:1 friendship is a hidden group** (`split_groups.direct_person_id`), so friend expenses share every balance path with groups. A friend's balance sums the settle-up edges between you in each shared group as that group currently suggests them — the figure a settle-up would move, and what Splitwise shows.
- **Removing a member is allowed once their balance there is zero** (the web locked members once any expense existed). The refusal names the amount: "Chirag still owes ₹1,250.00 here".
- **`UserFacingError` (`lib/db/errors.ts`)** lets a write refuse with a message `safeWrite` shows verbatim, instead of "Couldn't … Please try again". Its own file so pure write cores can throw it under Jest.
- **The paid-by and split editors are in-form sheets (`kit.tsx` `FormSheet`), not `@gorhom/bottom-sheet` routes.** The draft never leaves the screen, and Android back closes the sheet before the form.
- **Group activity is limit-paged ("Show older"), not keyset-paged.** It is a union of expenses and settlements and a trip's worth of rows; revisit only if a group grows into the thousands.
- **`features/tracker/identity.ts` moved to `lib/identity.ts`** — Groups needs the same deterministic icons and colours, and features may not import each other.

---

## Backlog — v1.1 and beyond

| Item | Est. | Why deferred | Note |
|---|---|---|---|
| **Groups: exact minimum-payments solver** | 1 d | Greedy + pairing is ≤ n − 1 and what Splitwise ships | For groups with ≤ ~12 unsettled members a zero-sum-subset search could find the true minimum |
| **Groups: share a reminder via WhatsApp/SMS** | 0.5 d | Not chosen for v1 | Android share sheet — no `INTERNET` needed |
| **Groups: recurring group expenses, copy your share into the ledger** | 1–2 d each | Not chosen for v1; groups stay separate from the ledger | Both are additive |
| **Multi-device sync** | weeks | No server by design | The schema allows it: add a UUID column and `updated_at` per row (both additive migrations), and only `features/*/queries.ts` changes. A real project, not a switch |
| **Precomputed rollup tables** | 2 d | Premature | Only if a real ledger measurably janks. Every write path gets more complex and rollups drift out of sync. Measure before believing it |
| **Multi-currency** | 3 d | Web app is INR-only too | Follows the web app's lead |
| **Copy sheet rows into the ledger** | 1–2 d | Not chosen for v1 — sheets use the per-sheet "include in totals" toggle instead | The dedupe hash and `import_batches` from Phase 1 already support it, so it stays cheap if asked for |
| **Live Google Sheets sync** | — | Needs the Sheets API, i.e. `INTERNET` | Breaks convention #1. `.xlsx` files stored in Drive work — Drive's own app syncs them |
| **Receipt photo attachment** | 3 d | Storage and UI cost, no backend to hold blobs | Would need file management and a size story alongside the 25 MB backup cap |
| **Bank SMS auto-capture** | — | `READ_SMS` is incompatible with Play | Would also break the "no INTERNET, no data collected" story, which is worth more |

---

## Notes & Decisions Log

Record decisions made mid-build that future sessions need to know. Newest first.

| Date | Decision | Reason |
|---|---|---|
| 2026-09-15 | **Groups built (pulled forward from v1.1): separate from the ledger; groups + 1:1 friends; unequal splits, multiple payers, group stats; per-group "Simplify debts" toggle, on by default** | User decisions. Friends are typed names — no contacts permission, which would break the two-permission rule |
| 2026-09-15 | Charts stay on react-native-svg + Reanimated, not Skia (Phase 5) | The scrubber needs a guide and two dots animated in worklets, not GPU paths; no native rebuild |
| 2026-09-14 | **Main database unkeyed on device; SQLCipher kept only for passphrase-encrypted backup files** (TASKS2 F0) | A Keystore-held key never leaves the phone, so Android auto-backup restored a database nobody could open. FBE + the app sandbox already protect data at rest; exports are the copies that leave the device |
| 2026-09-14 | Ledger pages by keyset `(date, id) < (?, ?)`, page 1 live (TASKS2 F0) | A growing `LIMIT` re-sends every loaded row on every write; a capped window can't scroll a 50k ledger end to end |
| 2026-09-14 | `categories.kind` (`expense`/`income`/`both`) added; `transactions.is_recurring` dropped — both in migration 0001 (TASKS2 F0) | Salary was offered on expenses; the recurring flag did nothing and overlapped the Tracker. Phase 4 may add a nullable `subscription_id` |
| 2026-09-14 | Dark-only confirmed for v1, including the native shell (TASKS2 F0) | Matches the redesign. Light theme stays a Phase 9 Settings toggle; tokens-only colours keep that cheap |
| 2026-09-14 | **Imports become Sheets: separate, editable workspaces — not ledger rows** | The user's model: people already track money in spreadsheets and want to keep those files as their own thing. Each file is a sheet, viewed and edited individually |
| 2026-09-14 | Sheets: the app edits its own copy; the original file changes only on explicit export | Chosen over live write-back. Avoids silent overwrites and conflicts with edits made in Excel; changes made in Excel come back through Refresh with a review step |
| 2026-09-14 | Sheet rows count in totals only when the sheet opts in; mirrored rows never do | Per-sheet toggle, implemented as a `money_rows` UNION ALL view so dashboard/budget/analytics queries change once |
| 2026-09-14 | Linked sheets mirror add/edit/delete, with rules per sheet and many links at once | Row identity lives in `sheet_row_links`, so no ID column is ever written into the user's sheet |
| 2026-09-14 | xlsx formatting must survive export → ExcelJS writer, gated on a spike | SheetJS Community drops styles on write. ExcelJS preserves them but must be proven under Hermes first. SheetJS stays the reader for legacy `.xls` |
| 2026-09-14 | Sheet view mode is a user setting: cards + form, grid, or cards with grid toggle | The user wants the choice; all three render the same rows |
| 2026-09-14 | UI redesigned after the web app: dark-only, lime accent, frosted-glass tab bar | User request. Light theme deferred to a Settings toggle |
| 2026-09-11 | **Standalone, offline-only — not a client for the FastAPI backend** | This is a separate product, not a second client. Removes auth, HTTP, server-state caching, offline queueing and cold starts entirely; adds on-device analytics and backup as new work |
| 2026-09-11 | SQLite + Drizzle ORM for storage | Real SQL with typed queries and generated migrations. Analytics over a multi-year ledger is the breaking point for any JSON/KV approach |
| 2026-09-11 | Analytics aggregated in SQL, not JS | 50k rows aggregate to ~24 in the engine. Pulling them into JS to `reduce()` costs hundreds of ms on the UI thread |
| 2026-09-11 | All three backup layers ship in v1 | Each covers a case the others miss: auto-backup for the phone you upgrade, manual export for the phone you lose, the reminder to make manual export actually happen |
| 2026-09-11 | Groups deferred to v1.1 | Not in v1 scope. Noted as dearer to add than in the networked design, since the split algorithms must now be written from scratch |
