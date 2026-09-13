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
| **Architecture** | Standalone, zero network | No auth, no HTTP, no server-state cache, no offline queue, no cold starts. Two doors only: file import in, file backup out |
| **Storage** | SQLite via `expo-sqlite` + Drizzle ORM | Real SQL, typed queries, generated migrations. `useLiveQuery` replaces TanStack Query entirely |
| **Analytics** | SQL aggregation on-device | Port the FastAPI aggregations to `GROUP BY` queries. Never `SELECT` rows you intend to sum |
| **Durability** | Manual export **+** Android auto-backup **+** monthly reminder | All three ship. Each covers a case the others miss. This is the defining risk of a standalone app |

---

## What Being Standalone Changes

| Concern | If it were a backend client | Standalone |
|---|---|---|
| Auth | JWT pair, refresh queue, SecureStore | **Gone.** No accounts exist |
| Networking | Axios, interceptors, retry, timeouts | **Gone.** No `INTERNET` permission |
| Server state | TanStack Query, staleTime, invalidation | **Gone.** Drizzle `useLiveQuery` — the DB *is* the state |
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
| **Reactivity** | `useLiveQuery` | Needs `enableChangeListener: true`. Replaces TanStack Query |
| Encryption | SQLCipher via `useSQLCipher` | Config in `app.config.ts`, key at open. **Phase 1, not later** |
| Styling | `nativewind` v4 | Tokens ported from the web `globals.css` |
| Components | `react-native-reusables` | shadcn philosophy for RN — copy-paste, you own it |
| Client state | `zustand` | Filters, theme, import wizard draft only |
| Forms | `react-hook-form` + `zod` | Zod at the form boundary, Drizzle types at the DB boundary |
| Lists | `@shopify/flash-list` v2 | JS-only rewrite for Fabric, no size estimates |
| Charts | `victory-native` + `@shopify/react-native-skia` | GPU rendering, Reanimated gestures |
| Animation | `react-native-reanimated` v4, `react-native-gesture-handler` | UI-thread |
| Key-value | `react-native-mmkv` | Prefs, import presets, widget snapshot. **Not for records** |
| Toasts | `sonner-native` | Same API as the web's sonner |
| Sheets | `@gorhom/bottom-sheet` | |
| Icons · Font | `lucide-react-native` · `@expo-google-fonts/plus-jakarta-sans` | Identical to web |
| Spreadsheets | `xlsx` (SheetJS) + `papaparse` | Base64 read path |
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
│   ├── import/                   # wizard stack: pick · map · review · commit
│   ├── backup/index.tsx          # export · restore · history
│   ├── settings/
│   ├── (modals)/                 # transaction · budget · subscription
│   └── +not-found.tsx
├── db/                           # THE SOURCE OF TRUTH
│   ├── schema.ts                 # Drizzle tables — all types flow from here
│   ├── client.ts                 # openDatabaseSync + enableChangeListener + SQLCipher key
│   ├── seed.ts                   # system categories on first launch
│   └── migrations/               # generated by drizzle-kit — NEVER hand-edited
├── features/
│   ├── transactions/  { queries.ts  components/  schema.ts }
│   ├── budgets/       { queries.ts  components/  schema.ts }
│   ├── analytics/     { queries.ts  components/ }      ← the SQL lives here
│   ├── tracker/       { queries.ts  renewal.ts  notifications.ts }
│   ├── dashboard/     { queries.ts  components/ }
│   ├── import/        { parse.ts  map.ts  normalize.ts  dedupe.ts  commit.ts }
│   └── backup/        { export.ts  restore.ts  validate.ts }
├── components/   ui/ · charts/ · layout/
├── lib/          money.ts · dates.ts · storage.ts · theme.ts · notifications/
├── widget/
├── docs/         diagrams/*.mmd · wireframes/*.excalidraw
├── pcref/CLAUDE.md               # web app design reference (read-only)
├── drizzle.config.ts
├── app.config.ts                 # plugins, permissions, allowBackup, useSQLCipher
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
6. **Subscribe narrowly with `useLiveQuery`.** Every write re-runs *every* subscribed query. Per-screen queries, never one app-wide store. This failure mode looks like general slowness, not an obvious bug.
7. **Never hand-edit a generated migration.** Edit `db/schema.ts`, run `npx drizzle-kit generate`. Migrations run on phones you cannot inspect — a migration that throws is a permanently broken install.
8. **Test every migration against a copy of a real, populated database.** Empty tables hide every constraint violation.
9. **Imports point downward only.** `app/` → `features/` → `components/` → `lib/`. A feature never imports a sibling; shared things move down. Enforce with an ESLint boundaries rule.
10. **Routes are thin.** `app/` files compose a feature and nothing else — no queries, no business logic.
11. **Currency formatting goes through `formatINR()`.** Never call `toLocaleString("en-IN")` directly — assert ICU once at boot, keep a manual grouping fallback (see Gotchas).
12. **Three screen states, not five:** Content · Empty · Error. There is no loading state worth designing for. The one real gate is `useMigrations` at launch, behind the splash.
13. **Soft delete via `deleted_at`** — powers undo on swipe-delete and undo on a whole import batch. Every query filters `.is(null)`.
14. **Notification channels must exist before posting.** Android silently drops posts to a channel that was never created. Three: `Renewals`, `Budget alerts`, `Backup`.
15. **Reschedule reminders wholesale**, never diff. Cancel-all-then-schedule after any relevant write.
16. **Restore backs up before it overwrites.** Validate schema version and row counts first, snapshot the current DB, then swap. A user restoring the wrong file must not lose the right one.
17. **One diagram per decision, not per file.** `docs/diagrams/NN-topic.mmd`.
18. **Toasts via `sonner-native`**, mirroring the web pattern: modals stay open on error because the hook already toasted.

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

```ts
// db/schema.ts — abbreviated
export const transactions = sqliteTable("transactions", {
  id:            integer("id").primaryKey({ autoIncrement: true }),
  type:          text("type", { enum: ["expense", "income"] }).notNull(),
  amountPaise:   integer("amount_paise").notNull(),   // ← never a float
  date:          text("date").notNull(),              // YYYY-MM-DD
  note:          text("note"),
  categoryId:    integer("category_id").references(() => categories.id),
  isRecurring:   integer("is_recurring", { mode: "boolean" }).notNull().default(false),
  importBatchId: integer("import_batch_id").references(() => importBatches.id),
  deletedAt:     text("deleted_at"),
  createdAt:     text("created_at").notNull(),
}, (t) => ({
  byDate:     index("tx_date_idx").on(t.date, t.deletedAt),
  byCategory: index("tx_cat_idx").on(t.categoryId, t.date),
  byBatch:    index("tx_batch_idx").on(t.importBatchId),
}));
```

Tables: `categories` · `transactions` · `budgets` · `subscriptions` · `import_batches` · `app_meta`.

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
   ├ trend       ├ swipe delete    ├ donut         ├ Import a sheet
   ├ budgets →   ├ long-press sel. ├ month sel.    ├ Backup & restore
   ├ renewals →  ├ filter chips    └ stat cards    ├ Settings
   └ recent      └ search (LIKE)                   └ Groups (v1.1)

[ Home ] [ Transactions ] ( + ) [ Insights ] [ More ]
                            tap: add · hold: import
```

- **Budgets/Tracker are under More but one tap from their Home cards** — that's how you actually arrive at them.
- **Backup & restore is a first-class screen**, not a settings sub-page. On a standalone app it earns that.
- **The centre FAB is an action, not a tab.** A sheet dismisses back to where you were.
- **Bottom sheets** for anything short. **Full-screen modals** for transaction and subscription forms.
- **First-run onboarding matters more here** — a new install is genuinely blank. Offer three doors: add first transaction, import a sheet, restore a backup.

---

## Excel / CSV Import

Same wizard as a networked design; stage 6 collapses from the hardest part to the easiest.

```
1 Pick → 2 Parse → 3 Map → 4 Normalise → 5 Review → 6 Commit → 7 Done
         (SheetJS)  ↕MMKV                           one txn        undo
                    presets                      all-or-nothing
```

| Stage | Messy reality | Resolution |
|---|---|---|
| **2 Parse** | RN has no `File` stream. Multiple tabs. Header often row 4 under a bank logo | `readAsStringAsync` + `EncodingType.Base64` → `XLSX.read(b64, {type:"base64", cellDates:true})`. Header row = first of 15 rows with most non-empty non-numeric cells, overridable |
| **3 Map** | Columns named `Txn Date`, `Narration`, `Withdrawal Amt.`, `Deposit Amt.` — or just `What` / `How much` | Fuzzy header matching. **Two-column mode** for separate debit/credit. Mapping saved to MMKV under a hash of header names |
| **4 Normalise** | Excel serial dates. `03/04/2026` ambiguous. Amounts as `"₹ 1,24,500.00"`, `"(2,300)"`, `"2300 DR"` | `cellDates:true` for serials; ambiguous strings trigger a **dd/mm vs mm/dd picker** with 3 sample rows. Strip `₹`/commas; parens and `DR`/`CR` set sign; **parse straight to integer paise, never through a float** |
| **5 Review** | 6 bad dates, 40 unknown categories, 12 already imported | FlashList preview, per-row status, fix in place or skip. Duplicates found in-file and against the DB in one indexed query, presented never silently dropped |
| **6 Commit** | — nothing, any more | One `db.transaction()`: insert batch row, insert all transactions, commit. A few thousand rows in well under a second. Cancel = don't commit |
| **7 Done** | "I mapped the wrong column, 800 wrong rows" | Summary + **Undo this import** — one `UPDATE` setting `deleted_at` for the batch. Reachable indefinitely from import history |

**Cheap win:** bundle HDFC / ICICI / SBI mapping presets matched by header fingerprint.

---

## Backup & Restore

Not a nice-to-have. The phone holds the only copy of data typed in by hand over years.
All three layers ship — each covers a case the others miss.

| Layer | Covers | Limits |
|---|---|---|
| **1 · Manual export** (`.db` or `.json` via share sheet) | The phone you lose, the app you uninstall | Only happens if the user remembers |
| **2 · Android auto-backup** (`allowBackup: true`) | The phone you upgrade | 25 MB cap, silent, not guaranteed to run |
| **3 · Monthly reminder** (local notification) | Makes layer 1 actually happen | Fires only when `last_backup_at` > 30 days old |

| Decision | Choice | Reasoning |
|---|---|---|
| Export format | Both `.db` and `.json` | `.db` is exact byte-for-byte. `.json` is readable and future-proof. Default `.db` |
| Restore safety | Validate, then snapshot current DB before overwriting | The most destructive action in the app. Restoring the wrong file must not lose the right one |
| Encryption | SQLCipher via `useSQLCipher` | **Phase 1.** Retrofitting onto a populated DB is a migration you don't want to write |
| Exported file | Optional passphrase on `.db` | An unencrypted export in a Drive folder undoes on-device encryption |
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
npx expo run:android --device
```

### Every day after
```bash
npx expo start --dev-client        # scan the QR, or press "a"
adb shell input keyevent 82        # dev menu (or shake the device)
npx expo start --dev-client --clear  # after a dependency change
npx expo start --dev-client --tunnel # hostile Wi-Fi / client isolation
```

### Inspecting the database — the primary debugging tool
With no API to curl and no network tab to read, the database **is** the system.

```bash
# Pull the live DB off the device
adb exec-out run-as com.yourname.spendwise cat databases/spendwise.db > ./local.db

npx drizzle-kit studio     # browse and edit tables live
npx drizzle-kit generate   # regenerate migrations after editing db/schema.ts
```

### The shortcut worth knowing
`eas update --branch development` pushes new JavaScript to the installed dev build in ~30s.
You only need a new **native** build when adding a package with native code or changing
`app.config.ts`. Note: **a schema change is not a native change** — migrations are JS-bundled
and ship over the air too.

---

## Gotchas

- **`toLocaleString("en-IN")` on Hermes** — works on Android (platform ICU), but fails *silently* to `en-US` grouping where ICU is unavailable. `₹124,500.00` instead of `₹1,24,500.00` ships unnoticed. Assert once at boot, keep a manual fallback, unit-test both.
- **Floats destroy money.** SQLite stores `REAL` for anything decimal-shaped. Integer paise everywhere; a lint rule against `parseFloat` outside `lib/money.ts`.
- **Broad live-query subscriptions** make every keystroke re-run every query. Watch for it in Phase 3 when Home gains six widgets at once.
- **Migrations on an empty DB prove nothing.** Empty tables hide every constraint violation.
- **RN flexbox differs from CSS**: `flexDirection` defaults to `column`. **No style cascade** — text styling doesn't inherit through a `View`. Percentage sizing works in fewer places.
- **NativeWind does not port** `hover:`, `group-hover:`, `focus-within:`, `position: fixed`, z-index stacking, or CSS grid beyond the simplest cases.
- **Three meanings of "back"** — Android back gesture vs sheet dismissal vs the import wizard's step-back. They must not fight.
- **Notifications die quietly** after a reboot or force-stop. Test both paths explicitly on device.
- **SQLCipher must be enabled before there is data.** Retrofitting it is a migration nobody wants to write.
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
| 6 | Excel & CSV import | 5–6 d |
| 7 | **Backup & restore** | 3–4 d |
| 8 | Native layer | 3–4 d |
| 9 | Hardening & Play Store | 4–5 d |

**Total: ~25–33 working days solo** (5–7 weeks of evenings and weekends) — shorter than a
networked plan despite adding the analytics port and the whole backup feature, because auth,
HTTP, caching and offline queueing all disappeared.

Phase 1 is the one to over-invest in: schema, migrations, encryption and the query boundary are
what everything else sits on, and all four are expensive to change later.

---

## Deferred, With Reasons

| Item | Why | Cost to add later |
|---|---|---|
| **Groups (split expenses)** | Not in v1 | **Dearer than it looks.** With a backend the exact-paise split and greedy min-cash-flow simplification already existed. Standalone, both must be written in TS and tested carefully — a rounding error in a split is money that silently vanishes. Budget 4 days, not 2 |
| **Multi-device sync** | No server by design | A real project, not a switch. The schema allows it: add a UUID column and `updated_at` per row (both additive), and only `features/*/queries.ts` changes |
| **Precomputed rollup tables** | Premature | Only if a real ledger measurably janks. Measure before believing it |
| **Multi-currency** | Web app is INR-only too | Follows the web app's lead |
| **Bank SMS auto-capture** | `READ_SMS` is incompatible with Play | Would also break the "no INTERNET, no data collected" story |

---

## Reference Docs
- [`TASKS.md`](TASKS.md) — phase + task tracker, tick as you go
- [`pcref/CLAUDE.md`](pcref/CLAUDE.md) — the web app's context. **Design and domain reference only.** Its API surfaces describe a backend this app does not call
- [Live build plan](https://claude.ai/code/artifact/cb2c502a-0993-439c-8abf-90b4524cb707) — diagrams, rationale, objections-and-answers, risk register
- `docs/diagrams/*.mmd` — low-level mechanism diagrams (created as phases land)
