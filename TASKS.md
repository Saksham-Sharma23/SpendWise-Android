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
| 0 | Foundations | 1–2 d | 🟡 Code complete — device pairing pending |
| 1 | Database foundation | 3–4 d | 🟡 Code complete — on-device timing pending |
| 2 | Transactions | 4–5 d | ⬜ Not started |
| 3 | Home dashboard | 3 d | ⬜ Not started |
| 4 | Budgets & Tracker | 4 d | ⬜ Not started |
| 5 | Analytics | 3 d | ⬜ Not started |
| 6 | Excel & CSV import | 5–6 d | ⬜ Not started |
| 7 | Backup & restore | 3–4 d | ⬜ Not started |
| 8 | Native layer | 3–4 d | ⬜ Not started |
| 9 | Hardening & Play Store | 4–5 d | ⬜ Not started |

**Total: ~25–33 working days solo.** Phase 1 is the one to over-invest in — schema, migrations,
encryption and the query boundary are what everything else sits on, and all four are expensive
to change later.

---

## Phase 0 — Foundations
**Goal:** An empty but real app on your phone, with the theme and navigation shell in place.
**Est:** 1–2 days · **Status:** 🟡 Code complete — device pairing pending

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
- [ ] **Run the first EAS development build and install it on the phone**
  *Why:* Expo Go cannot load SQLCipher, MMKV, Skia or the widget plugin. Starting there means hitting the wall in Phase 1 and rebuilding the whole testing setup. One 12-minute cloud build now avoids that.
- [ ] **Pair the phone over wireless debugging, confirm hot reload works**
  *Why:* This is your entire feedback loop for the next six weeks. Prove it works before you depend on it.
- [x] **Write `docs/ANDROID_CLAUDE.md`** *(or confirm `CLAUDE.md` covers it)*
  *Why:* The web app's context doc is why this plan could be written in such detail. The same investment here makes every future session productive from the first message rather than the tenth.

**Exit criterion:** The app cold-starts on your phone from a QR scan, all four tabs navigate, and an edit to a screen hot-reloads over Wi-Fi.

**Discovered during this phase:**
- _(none yet)_

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
- [x] **Enable SQLCipher via `useSQLCipher` in `app.config.ts`, key the DB at open**
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
- Added `db/benchmark.ts` and `app/dev.tsx` beyond the original task list: the exit criterion needed to be runnable on the phone in one tap rather than requiring a code edit. The benchmark also runs `EXPLAIN QUERY PLAN` per query, so it reports full table scans, not just timings — a query that is fast at 50k rows but scanning will not stay fast at 200k.

---

## Phase 2 — Transactions
**Goal:** Full CRUD over the local ledger, in mobile idioms.
**Est:** 4–5 days · **Status:** ⬜ Not started

- [ ] **`features/transactions/queries.ts`: list, create, update, soft delete, search**
  *Why:* Establishes the query-boundary pattern the whole app follows. Screens call typed functions and never see a table name — this is the boundary the API used to give you for free.
- [ ] **FlashList v2 over a windowed live query with `LIMIT`/`OFFSET` pagination**
  *Why:* Virtualising the list is not enough — paginate the *query* too. Loading 20,000 rows into memory to show twelve is the mistake that makes the app feel heavy.
- [ ] **Sticky month header separators and pull-to-refresh**
  *Why:* A ledger without date grouping is unreadable at scroll speed. Pull-to-refresh is muscle memory even when data is local.
- [ ] **Add/edit modal with the segmented Expense/Income toggle at the top**
  *Why:* Direct port of the web app's most-used interaction. Type is the first decision, so it belongs at the top where the thumb lands.
- [ ] **Port Zod schemas from the web repo; parse amounts to paise at the boundary**
  *Why:* Schemas port verbatim — free correctness. Converting to paise at the form boundary means nothing downstream ever handles a float.
- [ ] **Swipe-to-delete with an undo toast**
  *Why:* Swipe is the mobile idiom replacing a row menu. Undo is what makes an irreversible-feeling gesture safe, and `deleted_at` already supports it.
- [ ] **Long-press multi-select and bulk delete**
  *Why:* Replaces the web table's row-selection checkboxes, which have no touch equivalent.
- [ ] **Filters bottom sheet compiling to SQL `WHERE` clauses; chips summarise active filters**
  *Why:* Filtering in SQL rather than in JS keeps it fast at any ledger size. Chips exist so the user can see *why* the list looks empty.
- [ ] **Search over note and category name**
  *Why:* Replaces the web app's global search. A `LIKE` against an indexed column is instant at this scale.
- [ ] **CSV export via `expo-file-system` + share sheet**
  *Why:* Parity with the web app, and it doubles as a crude escape hatch before Phase 7's real backup exists.
- [ ] **Category management: create, rename, recolour, merge**
  *Why:* The server used to own categories. Merge specifically matters because the Phase 6 importer will create near-duplicates ("Food" vs "food") that need cleaning up.

**Exit criterion:** Every transaction operation works, and the list stays smooth scrolling the 50k-row debug database.

**Discovered during this phase:**
- _(none yet)_

---

## Phase 3 — Home dashboard
**Goal:** The dashboard re-composed for one column, with the first real chart.
**Est:** 3 days · **Status:** ⬜ Not started

- [ ] **`features/dashboard/queries.ts`: summary, recent, 12-month trend**
  *Why:* Home fires the most queries of any screen. Writing them together makes it obvious where they overlap and can share.
- [ ] **`components/charts/TrendChart` on victory-native with a Bar/Line toggle**
  *Why:* First Skia chart — build it as a reusable wrapper, because Analytics reuses it in Phase 5. If charts ever need swapping, the change stays contained to these wrappers.
- [ ] **Summary cards and the dynamic `FinancialInsight` banner**
  *Why:* The banner is what makes the dashboard feel like it's paying attention rather than just reporting.
- [ ] **Budget overview card that deep-links to Budgets**
  *Why:* This is *the* reason Budgets can live under More instead of taking a permanent tab slot.
- [ ] **Upcoming renewals card that deep-links to Tracker**
  *Why:* Same argument for Tracker, and it's the in-app half of the reminder system built in Phase 8.
- [ ] **Recent transactions section**
  *Why:* Most sessions are "what did I just spend" — answering it on Home saves a tab switch.
- [ ] **First-run onboarding: add first transaction · import a sheet · restore a backup**
  *Why:* There is no account with data to sync down. A new install is genuinely blank, and an empty dashboard with no next step reads as broken.
- [ ] **Audit live-query subscriptions — narrow, per-widget, never app-wide**
  *Why:* Home is where this bites first: six widgets subscribing broadly means every write re-runs every query. It presents as vague slowness, not an obvious bug, so catch it deliberately.

**Exit criterion:** Home paints in a single frame on the 50k-row database, and a new install shows a useful empty state rather than a blank screen.

**Discovered during this phase:**
- _(none yet)_

---

## Phase 4 — Budgets & Tracker
**Goal:** Both secondary features, including the two trickiest pieces of ported logic.
**Est:** 4 days · **Status:** ⬜ Not started

> The two date-arithmetic ports in this phase are the most bug-prone code in the project.
> They are also easy to unit-test, which is why testing them is a task and not a suggestion.

- [ ] **`features/budgets/queries.ts`: spend-against-limit over the reset-day cycle window**
  *Why:* The cycle window is not a calendar month — a budget resetting on the 15th spans two months. Getting the window wrong makes every budget figure quietly incorrect.
- [ ] **Port `getDaysLeftInCycle` and cycle window arithmetic to TypeScript**
  *Why:* Direct port from the web app, where it had to be kept in sync across two files. One implementation here, used everywhere.
- [ ] **Budgets list with MiniDonut, days-left, 75% amber, over-budget banner**
  *Why:* Parity. The 75% threshold is the useful one — being told you're over budget after the fact isn't actionable.
- [ ] **Budget create/edit modal**
  *Why:* Completes CRUD. Keep `limit_amount` in paise, consistent with everything else.
- [ ] **Port `_enrich` renewal calculation: advance `anchor_date` by cycle until ≥ today, month-end clamped**
  *Why:* The self-correcting design means no background job is needed — renewal is always computed on read. Month-end clamping is what stops a 31 Jan subscription from breaking in February.
- [ ] **Unit-test renewal against month-end edge cases (31 Jan → Feb, leap years)**
  *Why:* This is precisely the code that looks right and is wrong four months later. Tests are cheap here because the function is pure.
- [ ] **Subscriptions list with status filter and renewal/amount/name sort**
  *Why:* Parity with the web Tracker.
- [ ] **Port `group-utils.ts` for deterministic icon and colour**
  *Why:* Deterministic means Netflix looks the same on both clients with nothing persisted.
- [ ] **Urgency countdown with `ok` / `soon` / `muted`**
  *Why:* Use the web app's exact value names — not colour names — so behaviour matches and the values stay meaningful when theming changes.
- [ ] **Kebab actions: Edit, Pause/Resume, Cancel, Delete**
  *Why:* Parity. All are status changes rather than separate operations, mirroring the web design.
- [ ] **`monthly_cost` normalisation: monthly ×1, yearly ÷12, quarterly ÷3, weekly ×52÷12**
  *Why:* Comparing a yearly and a weekly subscription needs a common unit. Do the division in paise with explicit rounding, not floats.

**Exit criterion:** Budget cycles and subscription renewals compute correctly across month-end and leap-year boundaries, proven by tests.

**Discovered during this phase:**
- _(none yet)_

---

## Phase 5 — Analytics
**Goal:** The chart-heavy screen, all aggregation in SQL.
**Est:** 3 days · **Status:** ⬜ Not started

- [ ] **`features/analytics/queries.ts`: trend, by-category, summary, stat cards — all `GROUP BY`**
  *Why:* The rule that makes this screen viable: never `SELECT` rows you intend to sum. 50k rows aggregate to 24 in the engine; JS never sees more than two dozen objects.
- [ ] **Spending-trend area chart with the 3/6/12/24-month selector**
  *Why:* Parity. The 24-month range is the stress case — it's the one to time.
- [ ] **Touch scrubber with value tooltip, driven by Reanimated on the UI thread**
  *Why:* The one interaction genuinely better than the web version. On the UI thread so it stays smooth while JS is busy.
- [ ] **Category donut with month selector**
  *Why:* Parity, and the most-looked-at chart in the web app.
- [ ] **Stat cards: avg/day, biggest expense, top category, savings rate**
  *Why:* Parity. Each is a one-line SQL query, so they're nearly free once the query file exists.
- [ ] **Make both chart wrappers theme-aware for system dark mode**
  *Why:* Android users flip dark mode far more than web users, and Skia doesn't inherit CSS — colours must be passed explicitly.
- [ ] **Re-time every query on the 50k database, confirm no regression**
  *Why:* Closes the loop opened in Phase 1. Query performance drifts as `WHERE` clauses accumulate.

**Exit criterion:** Analytics matches the web screen, and switching to the 24-month range is visually instant on the real phone.

**Discovered during this phase:**
- _(none yet)_

---

## Phase 6 — Excel & CSV import
**Goal:** The largest new feature. Five client stages, no backend.
**Est:** 5–6 days · **Status:** ⬜ Not started

> Expect this to overrun. The difficulty is never the code — it is that real spreadsheets
> disagree about dates, signs, and where the amount lives.

- [ ] **Collect five genuinely different real spreadsheets as fixtures — FIRST**
  *Why:* Writing the parser before seeing real input means designing for imagined problems and missing actual ones. A bank statement, a personal tracker and a Splitwise export disagree in ways you will not predict. **Do this before any parsing code.**
- [ ] **Pick + parse: document picker, base64 into SheetJS, sheet and header-row detection**
  *Why:* RN has no `File` or `ArrayBuffer` stream, so the base64 path is mandatory. Header detection matters because bank exports put a logo block above the real header.
- [ ] **Map: fuzzy header guessing, two-column debit/credit mode, MMKV preset save and match**
  *Why:* Two-column mode is specifically for bank statements with separate Withdrawal/Deposit columns — without it, half of real-world sheets can't be imported at all. Presets make the *second* import of the same sheet a two-tap operation.
- [ ] **Normalise: Excel serial dates, dd/mm vs mm/dd picker, ₹ and DR/CR parsing straight to paise**
  *Why:* `03/04/2026` is genuinely ambiguous and guessing wrong silently corrupts a year of data. Show three sample rows and let the user decide. Parse to paise directly — never via a float.
- [ ] **Review: FlashList preview, per-row errors, fix in place, category mapping**
  *Why:* This stage is what makes the feature trustworthy. Building it *before* commit means nothing can be written unreviewed.
- [ ] **Duplicate detection in-file and against the DB via one indexed query**
  *Why:* Re-importing an overlapping date range is the most common real mistake. Detect and present — never silently drop, because sometimes two identical ₹50 chai purchases are both real.
- [ ] **Commit: a single `db.transaction()` inserting the batch row and all transactions**
  *Why:* This is where standalone pays off. One transaction means a crash mid-import rolls back cleanly — there is no partially-imported ledger to recover from, and no chunking, retries or idempotency keys to write.
- [ ] **Done: summary screen, import history, undo batch via `deleted_at`**
  *Why:* "I mapped the wrong column" needs an answer better than deleting 800 rows by hand. Keep undo reachable indefinitely, not just as a toast that disappears.
- [ ] **Bundle HDFC / ICICI / SBI mapping presets**
  *Why:* Turns a five-screen wizard into preview-and-confirm for the exports people actually have. The difference between a feature tried once and one used monthly.
- [ ] **Chunk parsing through `InteractionManager` so the progress bar keeps moving**
  *Why:* Parsing a few thousand rows synchronously freezes the UI thread, and a frozen progress bar reads as a crash.

**Exit criterion:** All five fixture spreadsheets import correctly, a crash mid-import leaves the ledger untouched, and undo cleanly reverses a batch.

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
  *Why:* An unencrypted export sitting in a Drive folder undoes the on-device encryption entirely. The warning matters — a forgotten passphrase means the backup is gone.
- [ ] **Restore: validate `schema_version` and row counts before touching anything**
  *Why:* Restoring a corrupt or wrong-version file over good data is the worst possible outcome. Validate first, refuse clearly, change nothing.
- [ ] **Snapshot the current database before overwriting on restore**
  *Why:* Restore is the single most destructive action in the app. A user who picks the wrong file must not lose the right data.
- [ ] **Enable Android auto-backup (`allowBackup`), confirm the DB is included**
  *Why:* Nearly free durability for the common case of upgrading phones. Invisible to the user, which is exactly its value — and its limitation.
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

## Backlog — v1.1 and beyond

| Item | Est. | Why deferred | Note |
|---|---|---|---|
| **Groups (split expenses)** | 4 d | Not in v1 scope | **Dearer than it looks.** With a backend, the exact-paise split distribution and greedy min-cash-flow debt simplification already existed server-side and mobile needed only screens. Standalone, both must be written in TS and tested carefully — a rounding error in a split is money that silently vanishes |
| **Multi-device sync** | weeks | No server by design | The schema allows it: add a UUID column and `updated_at` per row (both additive migrations), and only `features/*/queries.ts` changes. A real project, not a switch |
| **Precomputed rollup tables** | 2 d | Premature | Only if a real ledger measurably janks. Every write path gets more complex and rollups drift out of sync. Measure before believing it |
| **Multi-currency** | 3 d | Web app is INR-only too | Follows the web app's lead |
| **Receipt photo attachment** | 3 d | Storage and UI cost, no backend to hold blobs | Would need file management and a size story alongside the 25 MB backup cap |
| **Bank SMS auto-capture** | — | `READ_SMS` is incompatible with Play | Would also break the "no INTERNET, no data collected" story, which is worth more |

---

## Notes & Decisions Log

Record decisions made mid-build that future sessions need to know. Newest first.

| Date | Decision | Reason |
|---|---|---|
| 2026-09-11 | **Standalone, offline-only — not a client for the FastAPI backend** | This is a separate product, not a second client. Removes auth, HTTP, server-state caching, offline queueing and cold starts entirely; adds on-device analytics and backup as new work |
| 2026-09-11 | SQLite + Drizzle ORM for storage | Real SQL with typed queries and generated migrations. Analytics over a multi-year ledger is the breaking point for any JSON/KV approach |
| 2026-09-11 | Analytics aggregated in SQL, not JS | 50k rows aggregate to ~24 in the engine. Pulling them into JS to `reduce()` costs hundreds of ms on the UI thread |
| 2026-09-11 | All three backup layers ship in v1 | Each covers a case the others miss: auto-backup for the phone you upgrade, manual export for the phone you lose, the reminder to make manual export actually happen |
| 2026-09-11 | Groups deferred to v1.1 | Not in v1 scope. Noted as dearer to add than in the networked design, since the split algorithms must now be written from scratch |
