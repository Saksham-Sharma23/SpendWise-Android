# SpendWise Android — Fix Tracker (TASKS2)

> Companion to [`TASKS.md`](TASKS.md) and [`CLAUDE.md`](CLAUDE.md). This file holds the **fixes** from the
> architecture review of 13 Sep 2026, re-checked against the code at `f83ad9a` on 14 Sep 2026
> (after the dark-theme refactor, the dashboard and the Sheets plan).
>
> **Full review with evidence and measurements:** https://claude.ai/code/artifact/d5c47cee-8d17-4d36-90f1-004e88cc1c5a
> Task IDs in brackets (`[D2]`, `[S1]` …) match the finding IDs in that review.

**How to use this file**
- Work **phase by phase, batch by batch**. A batch is one sitting and one commit or PR: small enough to finish, large enough to be coherent.
- Tick `[x]` as you finish a task, and close a batch only when its **Done when** line is true.
- Every task has a **Why**. If the why no longer holds, re-check the task before doing it.
- Line numbers are from `f83ad9a`. They will drift, so search for the named symbol if a line has moved.
- New problems found mid-batch go in that phase's *Discovered* list.

**Why the order matters.** Phase F2 changes the schema. It is cheap only while no phone holds real data, so
F0 → F1 → F2 should land **before Phase 3 continues and before any real ledger exists**. F3 changes how
every screen reads data, so do it before more screens are written against `useLiveQuery`.

---

## Progress

| Phase | Name | Batches | Est. | Blocks | Status |
|---|---|---|---|---|---|
| F0 | Decisions | — | ½ d | F1, F2, F4 | ✅ Done 2026-09-14 |
| F1 | Data safety | 1A · 1B · 1C | 2 d | — | 🟡 Verified on the phone 2026-09-15 except the backup drill (blocked on a rebuild) |
| F2 | Schema migrations 0001–0006 | 2A · 2B | 1½ d | F3 | ✅ Done — 0001–0006 verified on the phone's 50k database 2026-09-15 |
| F3 | Data-access runtime | 3A · 3B · 3C · 3D | 3 d | F4, Phase 3–6 | 🟡 Query plans verified on the phone's database 2026-09-15 — in-app timings still open |
| F4 | Ledger & dashboard smoothness | 4A · 4B · 4C | 2½ d | — | ⬜ Not started |
| F5 | Everyday UX correctness | 5A · 5B · 5C | 2 d | — | ⬜ Not started |
| F6 | Tooling & guard rails | 6A · 6B · 6C | 1½ d | — | ⬜ Not started |
| F7 | Sheets readiness gate | — | ½ d | Phase 6A | ⬜ Not started |

**Total: ~13–14 working days.** F0–F3 (~7 days) are the part that cannot wait.

### Already fixed by the refactor since the review (no action needed)
| Review ID | Was | Now |
|---|---|---|
| U3 (colours) | Home used the DB colour, the ledger a hashed colour | Every screen uses `c.color ?? colorForCategory(name)` |
| U5 | Hardcoded light-theme hex values, `darkMode: 'class'` never set | Dark-only design through `lib/theme.ts` tokens. New config issue tracked in **[5C-1]** |
| U6 (undo) | Deleting from the edit modal had no Undo | Undo toast added (`app/(modals)/transaction.tsx:116-124`) |
| S5 (item types) | FlashList had no `getItemType` | Added (`app/(tabs)/transactions.tsx:288`) |
| T1 (partial) | `app/(tabs)/index.tsx` imported `db` and `schema` | Route now renders `<Dashboard />` only |

---

## Phase F0 — Decisions
**Goal:** Settle the calls that change what later phases build. No code in this phase beyond CLAUDE.md edits.
**Est:** ½ day · **Status:** ✅ Done 2026-09-14

> **Decided** (full rows in the Decisions log below; recorded in CLAUDE.md and TASKS.md):
> 1. **Encryption:** option **B′**. The main DB is unkeyed on the device. SQLCipher stays in the build **only** for passphrase-encrypted backup files.
> 2. **Pagination:** **keyset** pages, with page 1 live.
> 3. **Schema:** add `categories.kind` (`expense`/`income`/`both`) and **drop** `transactions.is_recurring`. Phase 4 may add a nullable `subscription_id`.
> 4. **Theme:** **dark-only for v1**, native shell included. The light theme stays a Phase 9 Settings toggle (the user's earlier decision), so this is not "permanent".
>
> These were taken as the review's recommendations under the goal "complete F0". Each is cheap to revisit **until migration 0001 (F2) ships**, so change them before then if you disagree.

- [x] **[D1] Choose the encryption and auto-backup design** → **B′: main DB unkeyed; SQLCipher only for encrypted backup files**
  *Why:* The SQLCipher key lives in the Android Keystore, which never leaves the device. Android auto-backup restores `spendwise.db` to a new phone without a usable key: `expo-secure-store` throws `DecryptException`, and the app stops at "SpendWise could not start". Layer 2 of the durability plan cannot work as designed. Also, `-wal` is backed up separately from the main file, so the copy can be torn.
  Options:
  - **A. Keep SQLCipher + recovery code.** Wrap the database key with a key derived from a recovery code shown once at onboarding (PBKDF2/Argon2), and store the wrapped key in a file that *is* backed up. On a restored device, prompt for the code.
  - **B. Drop on-device SQLCipher (recommended in the review).** Android file-based encryption already protects the app sandbox at rest. Anyone with root on an unlocked phone can use the Keystore through the app process anyway. Spend the effort on passphrase-encrypted exports, which are the copies that leave the device.
  - **Doing neither is not an option:** it ships a backup layer that bricks on restore.
  **Chosen: B′**, a refinement of B. Removing SQLCipher from the build entirely would also remove the cheapest way to produce the *passphrase-encrypted `.db` export* that TASKS.md Phase 7 plans; the alternative is a JS crypto library on Hermes. So the build keeps `useSQLCipher`, the main connection is opened **without** `PRAGMA key` (SQLCipher then behaves exactly like SQLite), and exports use `ATTACH … KEY` + `sqlcipher_export`. Android auto-backup encrypts its own copy with the lock-screen PIN on Android 9+, so the backed-up file is still protected in transit and at rest.
  *Why not A:* a recovery code is one more thing a user must keep. Losing it recreates the original lockout. PBKDF2/Argon2 in JS on Hermes is slow at safe iteration counts, and the threat it adds protection against (a rooted, unlocked phone) can already use the Keystore through the app.
  **Done:** CLAUDE.md → amendment under *The Four Locked Decisions*, *Stack*, *Backup & Restore*, *Inspecting the database*, *Gotchas*. TASKS.md → Phase 1 task annotated, Phase 7 passphrase and auto-backup tasks reworded, Decisions log. **[1B-4]** implements it.

- [x] **[S4] Choose the ledger pagination model** → **keyset pages, page 1 live**
  *Why:* The growing `LIMIT` window re-fetches every loaded row on each write and each new page (O(n²) while scrolling).
  Options: **keyset pages** `WHERE (date, id) < (?, ?)` with only the first page live, *or* a **window capped at ~500 rows** plus a month-jump control. The cap is simpler and enough if nobody scrolls years back.
  **Chosen: keyset.** The F4 exit criterion is "scrolls the 50k database end to end", which a 500-row cap can't meet, and Phase 6A's sheet workspace will need the same paging over `sheet_rows`. The new `tx_ledger_idx (date) WHERE deleted_at IS NULL` from **[2A-3]** carries rowid, so `(date, id) < (?, ?)` is an index range scan with no sort.
  **Done:** Decisions log, CLAUDE.md → *Navigation / UI Architecture*, TASKS.md Phase 2 task annotated. **[4A-1]** implements it.

- [x] **[U3] Decide category `kind` and the fate of `is_recurring`** → **add `kind`; drop `is_recurring`**
  *Why:* "Salary" is offered on expenses and "Rent" on income. `is_recurring` does nothing and overlaps the Tracker. Both are schema changes, so they belong in migration 0001 or not at all.
  **Chosen:**
  - `kind: 'expense' | 'income' | 'both'`, default `'both'` (so a user-created category is never hidden from either form). Seed mapping: `Salary`, `Other Income` → `income`; `Investments`, `Gifts & Donations`, `Miscellaneous` → `both`; every other seeded category → `expense`.
  - **Drop** `is_recurring` rather than replace it. The link to a subscription only makes sense once the Tracker exists (Phase 4), and adding a nullable `subscription_id` then is an additive migration, the safe kind. Replacing it now would create a foreign key to a table with no UI.
  **Done:** Decisions log, CLAUDE.md → *Data Model* (row added, abbreviated schema updated), **[2A-5]** reworded.

- [x] **Confirm the dark-only design** → **dark-only for v1, native shell included; light theme remains a Phase 9 toggle**
  *Why:* `app.config.ts:91` still says `userInterfaceStyle: 'automatic'`, TASKS.md Phase 5 asked for "theme-aware for system dark mode", and the splash is white in light mode.
  **Chosen:** dark-only for v1. The user's own log (TASKS.md, 2026-09-14) defers a light theme to a Settings toggle, so this is *not* permanent. The consequence is a rule: every colour comes from `lib/theme.ts` tokens, so the toggle is a token swap later.
  **Done:** CLAUDE.md → *Stack* (Styling row) and *Navigation / UI Architecture*. TASKS.md Phase 5 chart task reworded to "tokens only". **[5C-1]** unblocked and reworded.

**Exit criterion:** every decision above is written down, and CLAUDE.md no longer contradicts it. ✅ Checked 2026-09-14: CLAUDE.md now describes an unkeyed main DB everywhere except the explicitly marked "until batch 1B lands" note in *Inspecting the database*, which is still true of the code.

**Discovered during this phase:**
- **Uncommitted work already covers part of F1/F3.** A parallel session has `lib/db/useDbQuery.ts`, `lib/db/changeHub.ts` (coalesced, explicit base tables, focus-aware), `lib/db/safeWrite.ts` (write errors → toast + result), and `lib/categoryColor.ts` in the working tree. Tick **[D9]**, **[S2]** and the `colorForCategory` move in **[6A]** against that work once it is committed. **Note:** that `useDbQuery` runs its first query *synchronously on render*, which keeps **[S1]** (reads off the JS thread) open.
- **SQLCipher behaves as plain SQLite when no key is given.** That is what makes B′ possible without rebuilding the native layer: `useSQLCipher` stays, and only `PRAGMA key` goes.
- **The dev phone's database is already encrypted.** B′ needs a one-time conversion there, added to **[1B-4]**.

---

## Phase F1 — Data safety
**Goal:** Nothing the user enters can be silently lost, duplicated or half-written.
**Est:** 2 days · **Status:** 🟡 Code and tests complete 2026-09-14 (no phone was connected) — every *on the phone* check below is still open · **Depends on:** F0 (only for batch 1B)

### Batch 1A — Safe writes (no schema change)

- [x] **[D2] Add a `writeTx` helper that rejects async callbacks; fix the dev seeder** — `db/tx.ts` (`runWriteTx`), bound as `writeTx` in `db/client.ts`; dev seeder and category merge/delete use it. `db/__tests__/tx.test.ts` reproduces the early commit under the expo driver's exact semantics and proves the guard rolls back. Lint rule is F6.
  *Why:* Drizzle's expo `db.transaction()` is synchronous (verified in `drizzle-orm/expo-sqlite/session.js:31-42`). It runs `COMMIT` as soon as the callback **returns**, and an `async` callback returns at its first `await`. `db/devSeed.ts:73-106` therefore commits chunk 1 inside the transaction and runs chunks 2–100 in autocommit. Phase 6A's "create sheet" and 6B's "mirror on write" both depend on real atomicity.
  - Create `db/tx.ts` exporting `writeTx(fn)`. Inside `db.transaction`, throw if `fn`'s return value is thenable, which rolls back.
  - Rewrite `devSeedTransactions` to use synchronous `tx.insert(...).values(rows).run()`.
  - Add a comment rule and, in F6, a lint rule: no `async` callback passed to `db.transaction`.
  **Done when:** a unit test proves that a thrown error mid-batch leaves zero rows, and that passing an async callback throws.

- [x] **[D6] Stop double-tap Save from inserting twice** — `useRef` guard in `onSubmit` (peer session). ☐ *phone: hammer Save → one row*
  *Why:* `handleSubmit` validates asynchronously, and the Save button (`app/(modals)/transaction.tsx:353-357`) is only disabled after `isSubmitting` re-renders. Two quick taps create two identical rows, and with no server nothing deduplicates them.
  - Add a `useRef(false)` guard at the top of `onSubmit` (`transaction.tsx:102`), set on entry and never reset, because the modal closes.
  - Dim the button while the guard is set.
  **Done when:** hammering Save on the phone produces exactly one row.

- [x] **[D9] Catch failed writes; keep modals open on error (convention #18)** — `lib/db/safeWrite.ts` + `WriteResult` (peer session). ☐ *phone: forced constraint error keeps the modal open*
  *Why:* `createTransaction`, `updateTransaction` and `softDelete*` throw straight into handlers. The user sees no toast, and the modal closes as though the save worked.
  - In `features/transactions/queries.ts`, wrap each write so it toasts a specific message (e.g. "Couldn't save — storage is full") and returns `{ ok: false }`.
  - `transaction.tsx` calls `router.back()` only on `ok: true`. Swipe and bulk delete show the error toast instead of the undo toast.
  **Done when:** a forced constraint error keeps the modal open with a toast, in dev and release builds.

- [x] **[D8] Clear the selection when search or filters change** — resets on filter key change in `Ledger.tsx` (peer session).
  *Why:* In selection mode the search box (`app/(tabs)/transactions.tsx:212-223`) and the type switch (`:231-242`) stay usable. Rows that get hidden stay selected, and Delete removes rows the user can no longer see.
  - Reset `selected` whenever `filters` changes, or hide search and type while `selectionMode` is on.
  **Done when:** select → search → Delete removes only visible rows (or selection has already cleared).

**Batch 1A done when:** all four tasks pass on the phone and `npx jest` is green.

### Batch 1B — Boot and encryption hardening

- [x] **[D5] Verify the database actually opens before migrating** — `bootDatabase()` returns a typed `unreadable` outcome. *Deviation:* `PRAGMA quick_check` runs only when a migration is pending on a non-empty database (right before the snapshot), not on every launch — it is O(database size) and would tax every cold start. ☐ *phone: corrupted file → "can't open your data" screen*
  *Why:* An unreadable file (corruption, or a leftover SQLCipher-encrypted file after B′) only surfaces later as a migration error, "file is not a database", which reads like a broken update. With B′ there is no key to get wrong, but the check still matters.
  - After `configureConnection`, run `SELECT count(*) FROM sqlite_master` and `PRAGMA quick_check`. On failure, return a typed `Unreadable` boot state rather than a generic error string.
  **Done when:** a deliberately corrupted `spendwise.db` in dev lands on a dedicated "can't open your data" screen, not the migration error.

- [x] **[D5] Give the boot-failure screen real exits** — `features/boot/components/BootFailure.tsx`: share a copy, share the pre-update snapshot, try again, start fresh (typed `START FRESH`, moves files to `files/unreadable/`). The connection is reopenable (`db/connection.ts`), so "Start fresh" re-runs boot without an app restart. ☐ *phone: both actions on a corrupted file*
  *Why:* `BootFailure` in `app/_layout.tsx` explains but offers nothing. With no server, the user must be able to act.
  - Actions: **Share the database file** (raw copy through the share sheet, for support or later recovery). **Start fresh** moves `spendwise.db*` to `spendwise-unreadable-<timestamp>.db`, never deletes it, then reboots into first run. **Restore from backup** arrives in Phase 7.
  - "Start fresh" needs a typed confirmation.
  **Done when:** both actions work on the phone with a deliberately corrupted database file.

- [x] **[D5] Snapshot the database before applying pending migrations** — `VACUUM INTO files/snapshots/pre-migration-<idx>-<stamp>.db`, newest two kept; boot refuses to migrate if the snapshot fails. *Deviation:* snapshots live in `files/snapshots/`, not `files/SQLite/`, so one directory rule excludes them from auto-backup (backup rules have no wildcards). *Change of plan:* the failure screen **shares** the snapshot rather than restoring it — restoring into the same build would re-run the migration that just failed. ☐ *phone: snapshot opens in Studio*
  *Why:* Migrations run directly on the only copy (`app/_layout.tsx:85`). CLAUDE.md: "a migration that throws is a permanently broken install".
  - Before `useMigrations` runs, compare the bundled journal with `__drizzle_migrations`. If a migration is pending and `transactions` is non-empty, run `VACUUM INTO 'files/SQLite/pre-migration-<n>.db'`. Keep the two most recent.
  - Show the snapshot on the boot-failure screen as a restore option.
  **Done when:** a test migration on the dev phone leaves a `pre-migration-*.db` that opens in Drizzle Studio.

- [x] **[D1] Implement B′: unkeyed main database, SQLCipher for backup files only** — no `PRAGMA key`; one-time conversion in `db/legacyEncryption.ts` (row counts compared per table before the swap; encrypted original + key kept until the next clean launch); `db/encryptedCopy.ts` + dev-harness round trip; `plugins/withBackupRules.js`; WAL checkpoint on background; `db:pull` copies `spendwise.db`. *Deviation:* `expo-secure-store` stays until no installed build can hold a keyed database (the conversion needs it). **Verified without a phone:** a scratch-copy prebuild wires `android:fullBackupContent` + `android:dataExtractionRules` with exclude-only rules (a test keeps them include-free). ☐ *phone: (1) converted dev DB boots with all rows, (2) `bmgr backupnow` → uninstall → reinstall → data present, (3) dev-harness encrypted round trip*
  *Why:* Decided in F0. This is the build step.
  - **Stop keying.** Remove the `PRAGMA key` call from `configureConnection` (`db/client.ts:27-41`) and the key read from `app/_layout.tsx` (the `RootLayout` effect, `:48-65`). Keep `useSQLCipher: true` in `app.config.ts`.
  - **Convert an already-encrypted file once.** On boot, if SecureStore still holds `spendwise.db.key`: open the old file with the key, `ATTACH 'spendwise-plain.db' AS plain KEY ''`, `SELECT sqlcipher_export('plain')`, verify row counts match, swap files (keep the encrypted original as `spendwise-encrypted-<timestamp>.db` until the next successful launch), then delete the SecureStore item. This matters for the dev phone today and for any tester build already installed.
  - **Remove what only served device keying:** `db/encryption.ts`, `expo-secure-store` (and `expo-crypto` if nothing else uses it: the `uid` generator in **[2A-4]** may), `devExportDecryptedCopy` and its dev-harness button. Update `db:pull` in `package.json` to copy `files/SQLite/spendwise.db`. Rewrite the *Inspecting the database* section of CLAUDE.md, dropping its "until 1B lands" note.
  - **Backup rules:** add `android.dataExtractionRules` + `fullBackupContent` so auto-backup excludes `*-wal`, `*-shm`, `pre-migration-*.db` and `spendwise-encrypted-*.db`, and includes `files/sheets/` (Phase 6A templates). Checkpoint the WAL (`PRAGMA wal_checkpoint(TRUNCATE)`) when `AppState` goes to `background`, so the main file is complete when the backup runs.
  - **Prove the backup-file path works now,** even though the UI is Phase 7: a dev-harness button that writes a passphrase-encrypted copy with `ATTACH … KEY` + `sqlcipher_export`, and a second that reads it back into a scratch DB and compares counts.
  - Rebuild from a clean `android/` (`rm -rf android`) and run `npm run verify:apk`.
  **Done when:** (1) the dev phone boots on its converted database with all rows present; (2) the auto-backup drill passes: `adb shell bmgr backupnow com.spendwise.android` → uninstall → reinstall → data present; (3) the encrypted-copy round trip matches counts, and the file's header is not `SQLite format 3`.
  **(1) ✅ 2026-09-15.** The phone's `files/SQLite/spendwise.db` begins `SQLite format 3` — the conversion ran and the main database is genuinely unkeyed — and it holds all 50,000 rows with `integrity_check` = ok. `files/legacy/` is empty, so the encrypted original was cleaned up after a clean launch, as designed.
  **(2) ⚠️ Blocked, and it found a real bug — see *Discovered*.** `bmgr backupnow` returned **"Size quota exceeded"**: nothing was backed up. Cause: the dev-launcher's 15.2 MB JS bundle plus the 16.0 MB database is ~31 MB against Android's 25 MB quota. Excluded in `plugins/withBackupRules.js`; the drill needs a rebuild before it can run.
  **(3) ☐ Open** — the encrypted round trip is in the dev harness and needs the app in the foreground.

**Batch 1B done when:** an unreadable file, a failed migration and a restored auto-backup each end somewhere recoverable.

### Batch 1C — Release safety

- [x] **[D7] Make `INTERNET` fail closed** — opt-in via `EAS_BUILD_PROFILE=development` or `SPENDWISE_DEV_NETWORK=1` (`scripts/with-dev-network.js`, `npm run prebuild:dev` / `android` / `android:local`). **Verified:** scratch-copy prebuild with no env → `INTERNET … tools:node="remove"`; with the dev flag → `INTERNET` present.
  *Why:* `app.config.ts:15` sets `IS_DEV` whenever `NODE_ENV !== 'production'`. A plain local `npx expo prebuild` followed by `npm run build:release-apk` ships `INTERNET`.
  - Add `INTERNET` only when `EAS_BUILD_PROFILE === 'development'` or `SPENDWISE_DEV_NETWORK === '1'`.
  - Add `SPENDWISE_DEV_NETWORK=1` to the `start`, `android` and `android:local` scripts.
  **Done when:** `rm -rf android && npx expo prebuild` without any env vars yields a manifest with no `INTERNET`.

- [x] **[D7] Run `verify:apk` automatically after every release build** — chained in `build:release-apk`; the script already exits non-zero on a violation. ☐ *not yet exercised on a real release build*
  *Why:* The script only protects you if someone remembers to run it.
  - Change `build:release-apk` so it ends with `&& cd .. && bash scripts/verify-apk.sh`, and make the script's exit code fail the npm script.
  **Done when:** a release build with `INTERNET` present fails the npm command.

**Exit criterion (F1):** double-tap, write failure, an unreadable database file, failed migration, auto-backup restore and a local release build have each been tried on the phone, and each ends in a correct, recoverable state. 🟡 **Partly met 2026-09-15:** the unkeyed-database conversion is verified on the phone (see 1B); the UI checks and the backup drill are still open.

**Discovered during this phase:**
- **Android auto-backup was silently failing on the dev phone — the exact failure Layer 2 exists to prevent.** `adb shell bmgr backupnow com.spendwise.android` answered **`Size quota exceeded`**, meaning *nothing* was backed up. Measured cause: `files/DevLauncherApp-BridgelessReactNativeDevBundle.js` is **15.2 MB** and `files/SQLite/spendwise.db` is **16.0 MB** — ~31 MB against Android's **25 MB** quota. Nothing excluded the dev bundle.
  - **Dev-only in origin:** `expo-dev-launcher` is not in a release build, so a shipped app would not carry that 15 MB. Excluded anyway in `plugins/withBackupRules.js` so the drill is meaningful on the builds we actually test. **Needs a rebuild to take effect.**
  - **But the ceiling is real for users too.** The 50k-row database is already 16 MB by itself, and Phase 6A adds sheet templates under the same quota. Auto-backup fails *silently* when exceeded — no error reaches the user — which is precisely why Layer 1 (manual export) and Layer 3 (the monthly reminder) both ship. **Phase 7 should show database + template size in Settings and warn as it nears 25 MB.**
- **`bmgr` cannot be pointed at the local transport on this device** (`Unknown transport com.android.localtransport/.LocalTransportService`), so the uninstall/reinstall drill has to run against whatever transport the phone has configured.

**Discovered during this phase:**
- **Drizzle's migrator runs every pending migration in one transaction, where `PRAGMA foreign_keys=OFF` is a no-op.** With FKs on, rebuilding `categories` cascade-deletes every budget and nulls every transaction's category. `db/migrate.ts` turns FKs off before the transaction and runs `foreign_key_check` after; `migrations.test.ts` demonstrates the loss without it.
- **The connection had to become reopenable** (`db/connection.ts`, a forwarding proxy): "Start fresh" and the legacy conversion both need to close and reopen the file while every module holds `db`/`sqliteDb` from import time.
- **Android backup rules have no wildcards** and any `<include>` narrows the backup to the includes. Hence side files live in fixed directories and the rules are exclude-only.
- **`useMigrations` was replaced by `bootDatabase()`** so boot can snapshot, wrap migrations, and return typed outcomes.

---

## Phase F2 — Schema migrations 0001–0006
**Goal:** Fix every schema-level defect in **one** generated migration, while the only data on any phone is dev data.
**Est:** 1½ days · **Status:** 🟡 Code and tests complete 2026-09-14 — the on-phone run is still open · **Depends on:** F0 (category kind, `is_recurring`)

> Convention #7 still applies: edit `db/schema.ts`, run `npx drizzle-kit generate`, never hand-edit the SQL.
> If drizzle-kit cannot express something (e.g. a partial expression index), stop and record it under
> *Discovered*. Do not patch the generated file.

### Batch 2A — Schema edits

- [x] **[D3] Use one timestamp format everywhere** — defaults `strftime('%Y-%m-%dT%H:%M:%fZ','now')`; `nowISO()` in app writes; backfill in custom migration **0003** (space format and bare dates). Test asserts every timestamp column is ISO after migrating a mixed fixture. ☐ *phone: GLOB count = 0*
  *Why:* Column defaults use `CURRENT_TIMESTAMP` (`2026-09-13 10:00:00`), while code writes `toISOString()` (`2026-09-13T10:00:00.000Z`). A space sorts before `T`, so "last backup older than 30 days", ordering by `created_at` and any future "changed since" comparison give wrong answers. `seed.ts` and the dev seeder already wrote the other format.
  - In `db/schema.ts`, replace every `sql\`(CURRENT_TIMESTAMP)\`` default with `sql\`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))\``, which matches `toISOString()` exactly.
  - Add `lib/dates.ts → nowISO()` and use it everywhere code writes a timestamp.
  - Migration backfill: convert existing space-format values with `replace(x,' ','T') || '.000Z'`. If drizzle-kit won't generate the data step, run it at boot as an idempotent app-level fix-up guarded by an `app_meta` flag.
  **Done when:** `SELECT count(*) … WHERE created_at NOT GLOB '????-??-??T*Z'` returns 0 on the dev phone.

- [x] **[D4] Make unique indexes ignore soft-deleted rows** — `budget_cat_unique` partial (0001); `cat_name_unique` partial in **custom migration 0006** because drizzle-kit emits a partial expression index as a column name (see Discovered). Tests re-create "Rent" and a budget after soft delete.
  *Why:* `cat_name_unique` (`schema.ts:44`) and `budget_cat_unique` (`schema.ts:134`) still count deleted rows, so a deleted category name can never be reused and a deleted budget can't be re-created. The Phase 6A importer's "create missing category" path hits the same wall.
  - `uniqueIndex('cat_name_unique').on(sql\`lower(${t.name})\`).where(sql\`deleted_at IS NULL\`)`, and the same for `budget_cat_unique`.
  **Done when:** tests delete then re-create "Rent" and a budget on the same category without error.

- [x] **[S3] Replace `tx_date_idx` with indexes that remove temporary sorts** — `tx_ledger_idx (date) WHERE deleted_at IS NULL` (0001); month aggregates use a **VIRTUAL generated `month` column** + `tx_month_idx (month, type, amount_paise)` (0005) instead of an expression index drizzle-kit cannot emit. Plans: no TEMP B-TREE for ledger page, keyset page, or trend. Not reported as covering (SQLite never treats an index on a virtual column as covering); still 146 ms → 33 ms at 200k rows in Node.
  *Why:* Measured at 200k rows: the trend query needs `USE TEMP B-TREE FOR GROUP BY` (146 ms on a desktop) and the ledger needs `TEMP B-TREE FOR LAST TERM OF ORDER BY`. The planned indexes brought the trend to 26 ms and removed the ledger sort.
  - `index('tx_ledger_idx').on(t.date).where(sql\`deleted_at IS NULL\`)`. Its implicit rowid gives exactly `ORDER BY date DESC, id DESC`.
  - `index('tx_month_idx').on(sql\`substr(${t.date},1,7)\`, t.type, t.amountPaise).where(sql\`deleted_at IS NULL\`)`.
  - Drop `tx_date_idx`. Keep `tx_cat_idx`, `tx_batch_idx` and `tx_dedupe_idx`.
  **Done when:** **[2B-2]** plan assertions pass.

- [x] **Add a stable `uid` to every user-data table** — `uid NOT NULL UNIQUE DEFAULT (lower(hex(randomblob(16))))`, generated by SQLite (no `expo-crypto` needed); backfilled in 0003; system categories get fixed `sys:<slug>` uids.
  *Why:* CLAUDE.md defers UUIDs as "additive later", but a later backfill is exactly the risky migration on phones you can't inspect. Phase 6B's `sheet_row_links` and Phase 7's JSON restore both need ids that survive an export → import round trip; autoincrement ids don't.
  - `uid: text('uid').notNull().unique()` on `categories`, `transactions`, `budgets`, `subscriptions` and `import_batches`, generated in app code (`expo-crypto` `randomUUID`, or a small v4 generator if F0 removed `expo-crypto`).
  - Backfill existing rows in the same migration step as the timestamp fix-up.
  **Done when:** every row has a unique non-null `uid`, and creates set one.

- [x] **[U3] Apply the F0 decisions: add category `kind`, drop `is_recurring`** — `kind` added (0002) and mapped for system rows (0003); `is_recurring` dropped (0004) and removed from every file, the CSV export and the form.
  *Why:* Decided in F0.
  - `kind: text('kind', { enum: ['expense','income','both'] }).notNull().default('both')`.
  - Seed and backfill existing system rows: `Salary`, `Other Income` → `income`; `Investments`, `Gifts & Donations`, `Miscellaneous` → `both`; every other seeded name → `expense`. User-created categories keep `both`.
  - Remove `isRecurring` from `db/schema.ts`, `TransactionInput` and `listColumns` (`features/transactions/queries.ts`), `features/transactions/schema.ts` and its tests, the form's Recurring switch (`app/(modals)/transaction.tsx`), `LedgerRow` (`components/ui/LedgerRow.tsx`), the CSV export columns, and `db/devSeed.ts`. drizzle-kit will rebuild `transactions` to drop the column, so **[2B-1]** must cover that rebuild on a populated table.
  - Do **not** add `subscription_id` now. Phase 4 adds it as a nullable FK when the Tracker exists.
  **Done when:** typecheck passes with no `isRecurring` reference left, and the seed and backfill set `kind` as mapped.

- [x] **[U4] Version the seed so new system categories reach existing installs** — `db/seedCore.ts`, reconciled by **uid** (a renamed "Rent" is not re-added), `seed_version` in `app_meta`, inside `runWriteTx`; `db/__tests__/seed.test.ts`.
  *Why:* `seed.ts:52-68` inserts only when `!alreadySeeded`, contradicting its own comment, so a system category added in v1.2 never reaches existing users.
  - Store `seed_version` in `app_meta`. When the bundled version is higher, insert missing names with `onConflictDoNothing()` (works once D4's partial index exists), inside `writeTx`.
  - Fix the comment to match the behaviour.
  **Done when:** bumping the seed version adds one new category to a populated dev database without touching deleted ones.

### Batch 2B — Prove the migration

- [x] **[T2] Test migrations against a populated database (convention #8)** — `db/__tests__/migrations.test.ts` applies 0000, builds a 50k-row fixture with both timestamp formats, date-only deletes, `is_recurring`, live + deleted budgets, a subscription and an import batch, then applies 0001–0006 through **drizzle's real migrator** (`db/__tests__/support.ts`). Asserts rows, totals, category assignments, budgets, FK check, uids, kinds, timestamps, columns and indexes. It caught three generator bugs before any phone did.
  *Why:* Convention #8 exists, but no test enforces it. Empty tables hide every constraint violation.
  - In `db/__tests__/migrations.test.ts`: apply `0000`, seed 50k rows **with both timestamp formats, soft-deleted duplicates of category names and a deleted budget**, then apply `0001` and assert row counts, totals, `uid` uniqueness and the timestamp format.
  **Done when:** the test fails if any step in 0001 is removed.

- [x] **[S3][T2] Tighten the query-plan assertions** — `schema.test.ts` asserts no TEMP B-TREE for the ledger page, the keyset page and the month trend, plus contiguous keyset paging.
  *Why:* `db/__tests__/schema.test.ts:241-249` only asserts that an index is used, so it passed while a temporary sort ran.
  - Assert `not.toMatch(/TEMP B-TREE/)` for the ledger page and the month trend (which must filter with `substr(date,1,7) >= ?`).
  **Done when:** reverting 2A's indexes makes the test fail.

- [x] **Add regression tests for D2 and D4** — `tx.test.ts` shows the D2 early commit *without* the guard and the rollback *with* it; `schema.test.ts` covers D4.
  *Why:* Both bugs were invisible until someone looked for them.
  - `writeTx` rollback on throw, and `writeTx` rejecting an async callback.
  - Re-create a category and a budget after soft delete.
  **Done when:** all pass, and each fails when its fix is reverted.

- [x] **Run 0001–0006 on the phone's populated dev database** — ✅ **2026-09-15.** All six applied to the real 50k-row database on the phone (7 rows in `__drizzle_migrations`, the 2026-09-14 02:44 run). Verified by pulling the live file and inspecting it:
  - `integrity_check` = ok · `foreign_key_check` = 0 violations
  - 50,000 transactions, all live; 17 categories; `app_meta.schema_version` = 1
  - `categories.kind` present (`expense`=12, `income`=2, `both`=3) · `is_recurring` gone
  - `transactions.month` present as a VIRTUAL generated column, and **0 rows** where `month <> substr(date,1,7)`
  - Indexes `tx_ledger_idx`, `tx_month_idx`, `cat_name_unique`, `budget_cat_unique`, `sub_status_idx` all exist
  - `uid` backfilled on every row: 0 empty, 0 duplicate, in both `transactions` and `categories`
  *(No pre-migration snapshot survives to inspect: `files/snapshots/` keeps the newest two and the directory is now absent, consistent with a clean run followed by cleanup. The snapshot path itself is still unproven on the phone — see F1.)*

**Exit criterion (F2):** migrations apply cleanly to a populated 50k-row database on the phone, and every schema test is green. ✅ **Met 2026-09-15** — the phone's own database passes integrity and FK checks after 0001–0006, with every column, index and backfill in place.

**Discovered during this phase:**
- **"One migration" became six (0001–0006)**, all generated or created with `drizzle-kit generate [--custom]` and none hand-edited, because drizzle-kit 0.31 produces broken SQL in three situations. Each was caught by the populated migration test:
  1. **Adding a column and rebuilding a table in one generate** makes the rebuild's `INSERT … SELECT` read the new column from the old table ("no such column"). Fix: rebuild first (0001), add columns later (0002).
  2. **A table rebuild copies a VIRTUAL generated column** into the new table, which SQLite rejects. Fix: add `transactions.month` after the last rebuild (0005). A future rebuild of `transactions` must drop and re-add it.
  3. **A partial expression index** is emitted as `(\`lower("name")\`)`, i.e. a column name. Fix: `cat_name_unique` lives in custom migration 0006 and is not declared in `schema.ts`.
- **Reorder:** 0001 rebuild (defaults, partial uniques, ledger index) → 0002 add `uid` (nullable) + `kind` → 0003 custom backfill → 0004 rebuild (`uid NOT NULL` + unique indexes, drop `is_recurring`) → 0005 add `month` + `tx_month_idx` → 0006 custom `cat_name_unique`.

---

## Phase F3 — Data-access runtime
**Goal:** Reads leave the JS thread, writes stop fanning out, and every screen can tell loading, empty and error apart.
**Est:** 3 days · **Status:** 🟡 Code complete 2026-09-14 — on-device timing and the stutter check are still open · **Depends on:** F2

### Batch 3A — Take reads off the JS thread

- [x] **[S1] Run reads through expo-sqlite's async API** — `db/read.ts`: `sqlite-proxy` Drizzle over `prepareAsync` + `executeForRawResultAsync`, read-only, LRU of 50 statements (never shared by overlapping queries, reset after every read so the WAL can checkpoint, finalized before the connection closes). *Not moved:* `getTransaction` (tiny point read) and `getTransactionsPage` (CSV export, user-initiated). ☐ *phone: 500 ms artificial SELECT does not freeze the droplet*
  *Why:* The Drizzle expo driver calls `prepareSync`/`executeSync` (`session.js:20,73,84,112`). `await` hides it, but every query, including every `useLiveQuery` re-run, blocks touches, navigation and JS-driven animation while it runs.
  - Create `db/read.ts` with a second Drizzle instance on the `sqlite-proxy` driver, backed by `sqliteDb.prepareAsync` + `executeForRawResultAsync`, so results stay typed.
  - Cache prepared statements by SQL text, finalizing on eviction (LRU of ~50).
  - Keep the sync `db` for writes inside `writeTx` and for tiny point reads (`getTransaction`).
  **Done when:** the dashboard's four queries and the ledger run through `db/read.ts`, and a 500 ms artificial `SELECT` (e.g. a recursive CTE) no longer freezes the tab bar droplet.

### Batch 3B — Replace `useLiveQuery`

- [x] **[S2] Write `useDbQuery` and migrate every call site** — async, `pending | ok | error`, stale results dropped (`lib/db/latestOnly.ts`, tested), coalesced by table (`changeHub`), paused while unfocused. Transactions, categories and **all dashboard queries** migrated; no `useLiveQuery` import remains; ledger, dashboard recent list and category list render nothing while pending. Dev counter: `readQueryCount()` in `db/read.ts`. ☐ *phone: 500-row bulk delete → one re-run per mounted query*
  *Why:* `drizzle-orm/expo-sqlite/query.js` (verified):
  1. It re-runs the full query **once per changed row**, so a 3,000-row import re-runs every subscribed query 3,000 times.
  2. It listens only to the `FROM` table, so renaming a category never refreshes the ledger, top categories or recent list, which all join `categories`.
  3. Nothing cancels an in-flight query, so a stale search result can overwrite a fresh one.
  4. Errors are swallowed, so a failed query renders "No transactions yet".
  5. It starts at `[]`, so empty states flash on every mount.
  - Create `lib/db/useDbQuery.ts`, taking `(run, tables, deps)` (sketch in the review). It needs: explicit base-table list; ~32 ms coalescing of change events; request-id guard; `status: 'pending' | 'ok' | 'error'`; pause while the screen is unfocused (`useIsFocused`) with one refresh on regaining focus.
  - Migrate `useTransactions`, `useTransactionSummary` and `useCategories` (`features/transactions/queries.ts`), and `useMonthOverview`, `useMonthlyTrend`, `useTopCategories` and `useRecentTransactions` (`features/dashboard/queries.ts`).
  - Screens render `EmptyState` only when `status === 'ok'` and the data is empty, and show an error state on `'error'`.
  **Done when:** no import of `useLiveQuery` remains. Renaming a category updates Home and the ledger. A bulk soft-delete of 500 rows triggers one re-run per mounted query, not 500 (count with a dev-only counter).

- [x] **Subscribe view-backed queries to their base tables (needed for `money_rows`)** — rule documented in `useDbQuery` and CLAUDE.md convention #6; F7 carries the check.
  *Why:* Drizzle's hook compares a view's name with the table names in change events, and SQLite only ever reports base tables. A live query over the planned `money_rows` view would **never refresh**.
  - `useDbQuery` takes `tables: ['transactions', 'sheet_rows', 'sheets']` explicitly. Document this next to the view definition in Phase 6A.
  **Done when:** a comment in `useDbQuery` states the rule, and F7 carries the check.

### Batch 3C — Queries that use the new indexes

- [x] **[S3] Rewrite month-grouped queries to match `tx_month_idx`** — the trend filters and groups on the generated `month` column (not `substr`); plan test asserts `tx_month_idx` with no TEMP B-TREE.
  *Why:* An expression index only matches when the query uses the same expression. `useMonthlyTrend` (`features/dashboard/queries.ts:75-101`) filters on `date >= ?`, which can't use it.
  - Filter with `substr(date,1,7) >= ?` (a `YYYY-MM` param) and group by the same expression. Do the same in `db/benchmark.ts`.
  **Done when:** `EXPLAIN QUERY PLAN` shows `USING INDEX tx_month_idx` with no temporary B-tree.

- [x] **[T2] Make the benchmark time what screens actually run** — hooks and benchmark share builders (`dashboardQueries`, `transactionQueries`); `db/benchmark.ts` times them through `readDb` (median of 5, TEMP B-TREE/SCAN flags); local dates only; composed in `app/dev.tsx` so no feature imports a sibling.
  *Why:* `db/benchmark.ts` times raw sync SQL, not the Drizzle queries screens use. `monthsAgo()` (`:45-50`) uses UTC `toISOString()`, so it's a day off before 05:30 IST, and `setMonth` overflows on the 31st.
  - Import and time the real query builders through `db/read.ts`. Build dates with `lib/dates.ts` (`addMonthsClamped`, `todayISO`).
  **Done when:** the harness reports each hook's query by name.

- [ ] **Record on-device timings, then decide on a rollup table** 🟡 *plans confirmed on the phone's data; in-app timings still need the running app*
  **Confirmed 2026-09-15 against the phone's own 50k-row file** (pulled and run through better-sqlite3 — the planner reads the same schema and statistics the phone's SQLite does, so the chosen index is the same; only absolute times differ):
  - Ledger keyset page: `SEARCH transactions USING INDEX tx_ledger_idx (date<?)` — **no TEMP B-TREE**, so `(date, id) < (?, ?)` really is a range scan, as F0-S4 assumed.
  - Month aggregate: `SEARCH transactions USING INDEX tx_month_idx (month>?)` — **no TEMP B-TREE**, so `GROUP BY month` needs no sort step.
  - Desktop medians on that data (a floor, not the phone's number): ledger page 0.16 ms · 12-month trend 3.50 ms · month overview 0.29 ms · top categories 5.38 ms.
  **Rollup decision: still deferred, but leaning NO** — the trend query is 3.5 ms desktop and the rule is "build it only above 50 ms at 50k on the phone". A phone is slower, but not 14× on an index scan this shape. Confirm with the dev harness before deciding.
  *Why:* The expression index took the desktop trend from 146 ms to 26 ms. A trigger-maintained `month_totals` rollup took it to 0.14 ms, at +64% insert cost. Decide from phone numbers, not principle.
  - Seed 50k and 200k on the phone and record all benchmark rows in TASKS.md Phase 1 (this closes its open task).
  - Build the rollup only if the 24-month trend is over 50 ms at 50k. If you build it, triggers must handle insert, update, soft delete and restore, with a reconciliation test.
  **Done when:** numbers are recorded and the decision is logged below.

### Batch 3D — A "today" that moves

- [x] **[U2] Add a `useToday()` store that updates at midnight and on resume** — `lib/today.ts` (midnight math in `lib/dates.msUntilNextMidnight`, tested); used by Dashboard, TopCategories, TrendChart and the transaction form. Filter presets stay on 5B. ☐ *phone: change date while backgrounded*
  *Why:* `todayISO()` is read once at render in `Dashboard.tsx:67-69`, `TopCategories` (`:264`), `TrendChart.tsx:32` and the form. Leave the app open past midnight and "this month", "Today" and the trend window all go stale.
  - `lib/today.ts`: a zustand store with `today`, refreshed on `AppState` → `active` and by a timer to the next local midnight.
  - Replace render-time `todayISO()` / `new Date()` in screens and hooks with `useToday()`.
  **Done when:** changing the phone's date while the app is backgrounded updates the dashboard on resume.

**Exit criterion (F3):** on the 50k dev database, adding a transaction from Home causes no visible stutter in the tab bar droplet, and each mounted query re-runs exactly once. ☐ **Open — needs the phone.**

**Discovered during this phase:**
- **The dashboard hooks now return `DbQueryResult`**, not bare data, so Home can tell pending from empty. New hooks for the Home wiring (peer session): `lastExpenseToDatePaise` in `useMonthOverview`, `useActiveSubscriptions`, `useHasTransactions`, `useOnboardingDismissed` / `dismissOnboarding` (`app_meta.onboarding_dismissed`).
- **Convention #12 was refined:** reads are async, so there is a real (ms-long) `pending` state. Render nothing new while pending, and show Empty only when `status === 'ok'`.

---

## Phase F4 — Ledger & dashboard smoothness
**Goal:** The ledger scrolls smoothly through 50k rows, and a save doesn't trigger seconds of JS work.
**Est:** 2½ days · **Status:** ⬜ Not started · **Depends on:** F0 (pagination), F3

### Batch 4A — The ledger list

- [x] **[S4] Implement keyset pagination for the ledger (decided in F0)** *(code 2026-09-14: `useTransactionPages` + pure `features/transactions/pages.ts`. Page 1 becomes `key >= first boundary` once older pages exist, so a top insert can't open a gap; older pages refetch only for changed ids/categories/backdated keys in their range. Plan assertion in `keyset.test.ts`. The on-device row-count log is still for the user)*
  *Why:* `useTransactions(filters, limit)` (`features/transactions/queries.ts`) plus `onEndReached` growing `limit` (now in `features/transactions/components/Ledger.tsx`) re-ship the whole window on every write.
  - `useTransactionPages(filters)` in `features/transactions/queries.ts`: page 1 (40 rows) is live through `useDbQuery`. Each older page is fetched once with `WHERE <filters> AND (date, id) < (:lastDate, :lastId) ORDER BY date DESC, id DESC LIMIT 40`.
  - On a change event: re-run page 1 always. Re-run an older page only if it is visible or the change touched an id it holds (keep a `Set` of loaded ids). Otherwise mark it stale and refresh on scroll-into-view or focus.
  - Reset to page 1 when filters change. Keep row identity stable across pages (key by `id`) so FlashList doesn't remount cells.
  - Confirm `EXPLAIN QUERY PLAN` for the page query shows `tx_ledger_idx` with no temporary B-tree (depends on **[2A-3]**).
  **Done when:** scrolling to 2,000 rows and then adding a transaction transfers at most one page of rows (log the row counts in dev).

- [x] **[S5] Add sticky month headers** *(code 2026-09-14; visual check on the phone pending)*
  *Why:* TASKS.md Phase 2 ticks "Sticky month header separators" but the list has none.
  - Compute `stickyHeaderIndices` alongside `withMonthHeaders` (`transactions.tsx:46-58`).
  **Done when:** the current month label stays pinned while scrolling.

- [x] **[S5] Stop every row re-rendering on each data change** *(code 2026-09-14: field-wise memo, colour resolved once per fetch, `extraData` removed, `renderItem` hoisted. Profiler check on the phone pending)*
  *Why:* Each re-run produces new row objects, so `memo` (`TransactionRow.tsx:104`) never skips. `TransactionRow.tsx:82` also spreads a fresh object into `LedgerRow` on every render, and `extraData={selected}` (`transactions.tsx:286`) re-renders every row on each tap.
  - Give `memo` an equality function on `id`, `amountPaise`, `date`, `note`, `categoryId`, `categoryName`, `categoryColor`, `categoryIcon`, `selected` and `selectionMode`.
  - Compute `categoryColor` once when rows are fetched, not per render.
  - Remove `extraData`: `selected` is already a per-row boolean prop.
  - Hoist `renderItem` into a `useCallback`.
  **Done when:** React DevTools Profiler shows only the changed row re-rendering after an edit.

- [ ] **[S5] Mount the swipe gesture only when needed**
  *Why:* Every visible row mounts a `ReanimatedSwipeable` gesture tree (`TransactionRow.tsx:93-101`), which adds cost to every recycled cell during a fast scroll.
  - Measure first on the 50k database. If FlashList's frame drops improve with swipe disabled, render a lightweight row and mount the swipeable on touch-down.
  **Done when:** before/after numbers are recorded here, whichever way the decision goes.

### Batch 4B — Amounts, formatting and search

- [ ] **Move `AnimatedAmount` off React state**
  *Why (new since the review):* `components/ui/AnimatedAmount.tsx:25-42` calls `setState` on every animation frame for 700 ms, re-rendering and calling `formatINR` each frame. Home mounts three, the ledger three more, and tabs stay mounted. Every save therefore starts ~40 frames × 6 components of JS work exactly while the modal is closing.
  - Drive a Reanimated shared value on the UI thread and render through an `Animated` `TextInput` (`editable={false}`) with `animatedProps` text, formatted by a worklet version of the manual Indian grouping.
  - Skip the animation entirely when the screen is unfocused (jump to the final value).
  **Done when:** the Profiler shows zero React commits during the count-up.

- [ ] **[S7] Format rupees with manual grouping everywhere**
  *Why:* `formatINR` (`lib/money.ts:122-129`) calls `toLocaleString('en-IN')`, which builds a formatter per call through Hermes' platform `Intl`, once per row, per frame (see above). The manual grouping is already correct and tested, and the app is INR-only.
  - Always use `groupIndianManually`. Keep the ICU probe as a test only.
  - Add `formatCount(n)` and replace `total.toLocaleString('en-IN')` at `app/(tabs)/transactions.tsx:145` (convention #11).
  - Make the grouping function a worklet-safe pure function for the task above.
  **Done when:** there are no `toLocaleString` calls in `app/`, `features/` or `components/`, and the money tests pass unchanged.

- [ ] **[S6] Debounce search and simplify its predicate**
  *Why:* Each keystroke runs two live queries doing `lower(note) LIKE '%…%'` through a join, a full scan (136 ms at 200k on desktop).
  - Debounce by 150 ms in `transactions.tsx:216-219`. Drop `lower()`, since `LIKE` is already case-insensitive for ASCII (keep the `ESCAPE` clause and its tests).
  - Optional, measured: a `trigram` FTS5 table (FTS5 is compiled into expo-sqlite by default). Adopt only if realistic notes show a win; the review's test term matched every row and was slower.
  **Done when:** typing a 10-character search at 50k rows shows no dropped frames.

### Batch 4C — The glass tab bar

- [ ] **Measure the tab bar's cost during scroll, and add a fallback**
  *Why (new since the review):* `components/layout/TabBar.tsx` layers a live backdrop blur (intensity 90) over scrolling content, plus an SVG pattern of 220 rects and two gradients. On Android, a backdrop blur re-renders whenever the content beneath it moves.
  - Profile ledger scroll FPS on the phone with blur on and off.
  - If it costs frames: render `GlassSurface`'s SVG once to a static image, and add a Settings → "Reduce transparency" toggle that uses the non-blur tint (already present when `BLUR_AVAILABLE` is false).
  - Wrap the `Gesture.Pan()` (`TabBar.tsx:99-123`) in `useMemo` so the detector isn't re-attached every render.
  **Done when:** FPS numbers are recorded here, and the scroll holds 60 fps on the test phone with the chosen setting.

**Exit criterion (F4):** the 50k database scrolls end to end with no visible jank, and adding a transaction from the ledger causes no dropped frames (Perf Monitor on the phone).

**Discovered during this phase:**
- _(none yet)_

---

## Phase F5 — Everyday UX correctness
**Goal:** The things a user notices in the first week.
**Est:** 2 days · **Status:** ⬜ Not started · **Depends on:** F2 (category kind), F3 (`useToday`)

### Batch 5A — The transaction form

- [ ] **[U1] Add a real date picker**
  *Why:* The form has ±1 day arrows plus Today/Yesterday chips (`transaction.tsx:255-297`). Backdating a bill by three months still takes ~90 taps.
  - Tap the date label to open `@react-native-community/datetimepicker` (install with `npx expo install`). Keep the arrows and chips.
  **Done when:** any date in the past two years is at most three taps away.

- [ ] **[U3] Filter category chips by the chosen type**
  *Why:* Depends on 2A's `kind`. "Salary" shouldn't appear on an expense.
  - Show `kind === type || kind === 'both'` and clear an incompatible `categoryId` when the type switches.
  **Done when:** switching Expense → Income swaps the chips and drops an invalid selection.

- [ ] **[U6] Load the edited row before the first paint**
  *Why:* `getTransaction` is synchronous, but it runs in an effect (`transaction.tsx:79-95`), so the form paints empty defaults for one frame, and `FadeInDown` animates those defaults.
  - Read the row in a `useState` initializer and pass it as `defaultValues`. Keep the "no longer exists" path.
  **Done when:** opening an edit shows the real amount on the first frame.

- [ ] **[U6] Check keyboard behaviour on the phone**
  *Why:* `KeyboardAvoidingView behavior="padding"` (`transaction.tsx:127-131`) inside an edge-to-edge modal can either leave the note field under the keyboard or double the padding. Unverified.
  - Test with the note field focused and a gesture-nav phone. If broken, adopt `react-native-keyboard-controller`'s `KeyboardAwareScrollView`.
  **Done when:** the note field and Save button are both visible while typing.

- [ ] **Reject impossible dates in the form schema**
  *Why:* `features/transactions/schema.ts:35` uses `Date.parse`, which accepts `2026-02-31` in most engines.
  - Refine with `toISODate(fromISODate(v)) === v`.
  **Done when:** a unit test rejects `2026-02-31` and accepts `2028-02-29`.

### Batch 5B — Filters

- [ ] **[U2] Store date presets as keys, not frozen dates**
  *Why:* "Last 7 days" is stored as fixed dates (`app/(modals)/filters.tsx:25-30, 85-93`). After midnight, today's entries fall outside `dateTo` and vanish from a filtered ledger.
  - Store `{ preset: 'last7' | 'last30' | 'thisMonth' | 'last12m' }` or `{ from, to }` in `TransactionFilters`, and resolve presets inside `buildWhere` (or just before it) using `useToday()`.
  - Update `hasActiveFilters` and the filter tests.
  **Done when:** a filter set before midnight includes a transaction added after it.

- [ ] **Add a custom date range**
  *Why:* Presets only. "March 2025" can't be expressed.
  - Two date pickers under the presets, reusing 5A's picker.
  **Done when:** any closed range can be filtered.

### Batch 5C — App shell and data hygiene

- [ ] **Make the native shell dark-only for v1 (decided in F0)**
  *Why (new since the review):* `app.config.ts:91` is `userInterfaceStyle: 'automatic'`, and the splash is `#FFFFFF` in light mode (`:115`) but `#0D1210` in dark, while the app background is `#0A0A0B`. In light system mode, a white splash flashes before a black app, and system dialogs and the date picker render light.
  - `userInterfaceStyle: 'dark'`. Splash `backgroundColor: '#0A0A0B'` for both. Rebuild from a clean `android/`.
  - Leave a comment at `userInterfaceStyle` saying the Phase 9 light-theme toggle must switch this back to `'automatic'` and drive `Appearance.setColorScheme`.
  **Done when:** cold start in light system mode shows no white frame.

- [ ] **Keep design tokens in one source**
  *Why:* `lib/theme.ts:1-7` says "these mirror global.css — if you change a token there, change it here". Two hand-synced copies will drift.
  - Generate `global.css` variables from `lib/theme.ts` (a small script in `scripts/`), or have `tailwind.config.js` import the JS tokens directly.
  **Done when:** changing `colors.primary` in one file changes both Tailwind classes and JS styles.

- [ ] **[U6] Add "Recently deleted" and purge after 30 days**
  *Why:* Soft-deleted rows are kept forever and count towards every non-partial index and the backup size.
  - More → Settings → Recently deleted: list, restore, delete now.
  - At launch, hard-delete transactions with `deleted_at` older than 30 days **that are not part of an import batch** (batch undo must stay available).
  **Done when:** a row deleted 31 days ago (set the timestamp manually in dev) is purged on launch.

- [ ] **Point import entry points at the Sheets routes**
  *Why:* CLAUDE.md now places import under `app/sheets/`, but the FAB long-press (`TabBar.tsx:363`), the More row (`more.tsx:43`) and the ledger empty state (`transactions.tsx:279`) all go to `/import/pick`.
  - Move `app/import/pick.tsx` → `app/sheets/index.tsx` (list) and update all three links. Rename the labels to "Sheets" / "Import a sheet".
  **Done when:** there are no references to `/import/` in the code.

**Exit criterion (F5):** a first-week script works on the phone without surprises: backdate an expense to last quarter, filter "Last 7 days" across midnight, switch Expense/Income, delete and restore from Recently deleted, cold start in light mode.

**Discovered during this phase:**
- _(none yet)_

---

## Phase F6 — Tooling & guard rails
**Goal:** The conventions in CLAUDE.md are enforced by tools, not memory.
**Est:** 1½ days · **Status:** ⬜ Not started · **Depends on:** nothing (can run in parallel with F4/F5)

### Batch 6A — Lint that enforces the architecture

- [ ] **[T1] Install ESLint and encode conventions #1, #2, #4, #9 and #10**
  *Why:* `npm run lint` fails because ESLint isn't installed, so the boundaries rule (#9) and the "no `parseFloat` outside `lib/money.ts`" rule exist only in prose.
  - `npx expo install eslint eslint-config-expo` + `eslint-plugin-boundaries`, flat config in `eslint.config.js`.
  - Rules:
    - `app/` may not import `db/*`, except `app/_layout.tsx` (boot) and `app/dev.tsx` (dev-only).
    - A feature may not import a sibling feature.
    - `components/` and `lib/` may not import `features/`.
    - `no-restricted-globals` / `no-restricted-properties` for `parseFloat` and `toLocaleString`, with an override for `lib/money.ts`.
    - `no-restricted-imports` for `axios`, and `no-restricted-globals` for `fetch` and `XMLHttpRequest`.
    - A custom `no-restricted-syntax` rule forbidding an `async` function passed to `.transaction(`.
  - Move `colorForCategory` from `features/transactions/components/TransactionRow.tsx` to `lib/categoryColor.ts`. Today's imports from routes are allowed (`app → features`), but `components/ui` and other features will need the same fallback colour, and they may not import from a feature.
  **Done when:** `npm run lint` passes with every rule enabled, and a deliberate violation of each rule fails.

### Batch 6B — Tests and dependencies

- [ ] **[T2] Align the Jest toolchain and fill the test gaps**
  *Why:* `ts-jest@29` runs under `jest@30`. The "summary aggregates" test (`features/transactions/__tests__/filters.test.ts:158-171`) counts rows instead of running the summary query.
  - Upgrade `ts-jest` to the Jest-30-compatible major, or switch to `babel-jest` with `babel-preset-expo`.
  - Rewrite the summary test to execute the real `useTransactionSummary` query builder against better-sqlite3 and assert income, expense and count.
  **Done when:** the suite runs with no version warnings and the summary test fails if `CASE` splits are swapped.

- [ ] **[S8] Remove dependencies nothing imports yet**
  *Why:* `date-fns` (which duplicates `lib/dates.ts`), `@gorhom/bottom-sheet`, `react-native-mmkv`, `expo-local-authentication` and `expo-document-picker` are not imported. The native ones are still autolinked, which adds APK size, startup work and manifest entries to block.
  - Uninstall them, and re-add each in the phase that uses it (TASKS.md already says which).
  - Check `lucide-react-native` bundle cost once with Expo Atlas (`EXPO_UNSTABLE_ATLAS=true npx expo export`). If the full icon set is included, switch to per-icon imports.
  **Done when:** `grep` finds an import for every remaining dependency, and the Atlas result is noted here.

- [ ] **[T3] Plan the spreadsheet libraries safely**
  *Why:* The npm-registry `xlsx` stopped at 0.18.5 with published advisories (prototype pollution, ReDoS). SheetJS publishes current builds on its own CDN. CLAUDE.md now also adds `exceljs`, which expects Node `Buffer`/streams.
  - In the Phase 6A spike: install SheetJS from the vendor tarball URL pinned in `package.json`, not `npm i xlsx`. Record the version and why in CLAUDE.md.
  - Add to the ExcelJS spike's go/no-go: **JS-thread blocking time** for a 5,000-row styled workbook, not just correctness.
  **Done when:** CLAUDE.md's stack row names the SheetJS source and the spike criteria include thread time.

- [ ] **Replace "Sentry in dev only" with a local crash log**
  *Why:* Dev builds already show Metro's red screen, so a dev-only Sentry adds little. Release builds, where crashes actually matter, have no reporting at all.
  - `lib/crashlog.ts`: a global error handler and unhandled-rejection hook writing a rotating `files/logs/crash.log` (last 200 entries, no amounts or notes).
  - Settings → "Share crash log" through the share sheet. Update CLAUDE.md's Monitoring row.
  **Done when:** a forced release-build crash produces a shareable log entry after relaunch.

### Batch 6C — CI and documentation

- [ ] **Add CI for typecheck, lint, tests and the permission policy**
  *Why:* Every guard rail above only works if it runs on every change.
  - If the repo is on GitHub: `.github/workflows/ci.yml` running `npm ci`, `npx tsc --noEmit`, `npm run lint`, `npx jest`, and `EAS_BUILD_PROFILE=production npx expo config --json`, asserting `INTERNET` is in `blockedPermissions`.
  **Done when:** a PR that re-adds `INTERNET` or breaks a boundary fails CI.

- [ ] **[T3] Correct TASKS.md so it matches the code**
  *Why:* TASKS.md Phase 2 ticks "Sticky month header separators and pull-to-refresh" (neither exists) and leaves "Swipe-to-delete with an undo toast" unticked (done). "Filters bottom sheet" is a full-screen modal route. "LIMIT/OFFSET pagination" is a growing LIMIT.
  - Fix the ticks and wording, and add the relevant F-phase task IDs to Phase 2's *Discovered* list.
  **Done when:** every tick in TASKS.md Phases 0–3 is true of the code.

**Exit criterion (F6):** CI is green, and a deliberate violation of each convention (network call, float parse, cross-feature import, async transaction, `INTERNET` permission) is caught automatically.

**Discovered during this phase:**
- _(none yet)_

---

## Phase F7 — Sheets readiness gate
**Goal:** A checklist that must be all ticked before Phase 6A code starts. Each item protects a Sheets design assumption.
**Est:** ½ day (mostly verification) · **Status:** ⬜ Not started · **Depends on:** F1, F2, F3

- [ ] **`writeTx` exists and is lint-enforced (1A, 6A)**
  *Why:* "Create sheet in one `db.transaction()`" and 6B's "ledger and sheets can never disagree after a crash" are both false with an async callback.

- [ ] **`useDbQuery` subscribes to base tables, and `money_rows` consumers list `transactions`, `sheets` and `sheet_rows` (3B)**
  *Why:* Change events never name a view. A dashboard built on `money_rows` with Drizzle's hook would never refresh.

- [ ] **Write fan-out is coalesced (3B)**
  *Why:* With links enabled, one transaction save writes rows to `transactions`, `sheet_rows` and `sheet_row_links` for each matching link. Without coalescing, each of those rows re-runs every mounted query.

- [ ] **Stable `uid` columns exist (2A), and the 6B schema links through them or through ids that JSON restore remaps**
  *Why:* `sheet_row_links` keyed on autoincrement ids breaks after a JSON export → restore into a fresh database.

- [ ] **Backup rules include `files/sheets/` and exclude WAL files (1B)**
  *Why:* Sheet templates are the export source for formatting-preserving `.xlsx`. Losing them on restore silently downgrades every export.

- [ ] **Parsing and export do not rely on `InteractionManager` alone**
  *Why:* `InteractionManager` defers work but doesn't split it. A 5,000-row SheetJS parse or ExcelJS write still blocks the JS thread in one go. Chunk explicitly (e.g. 250 rows, then `await new Promise(r => setTimeout(r, 0))`), and cap input size with a clear message.

- [ ] **Timestamps on `sheets` (`last_imported_at`, `last_exported_at`) use the 2A format**
  *Why:* The "Unexported changes" badge compares these with row `updated_at`. Mixed formats would show the badge wrongly.

- [ ] **The SheetJS source and the ExcelJS spike criteria are fixed (6B)**
  *Why:* See **[T3]**.

**Exit criterion (F7):** every box ticked, then Phase 6A's first task (collect fixtures) begins.

---

## Decisions log

Record F0 decisions and any decision made while fixing. Newest first.

| Date | Decision | Reason |
|---|---|---|
| 2026-09-14 | **F1–F3 implemented without a phone** | Everything testable in Node is tested (migrations on 50k rows through the real migrator, FK trap, D2/D4, seed, plans, backup rules) and prebuild output was checked in a scratch copy. Every on-device check stays explicitly open in the phase checklists |
| 2026-09-14 | **Month aggregates use a VIRTUAL generated `month` column**, not an expression index | drizzle-kit 0.31 cannot emit comma-containing expression indexes; a column index is managed by the schema. Costs covering-ness (≈33 ms vs ≈26 ms at 200k rows in Node) |
| 2026-09-14 | **`quick_check` only before a migration, not every launch** | It is O(database size); the check that matters (file reads as SQLite) runs every launch |
| 2026-09-14 | **Keep `expo-secure-store` until no build can hold a keyed database** | The one-time B′ conversion needs the stored key |
| 2026-09-14 | **F0-4 · Dark-only for v1, native shell included** | Matches the redesign and the user's own log entry. Light theme stays a Phase 9 Settings toggle; the rule "every colour from `lib/theme.ts`" keeps that a token swap |
| 2026-09-14 | **F0-3 · Add `categories.kind` (default `both`); drop `transactions.is_recurring`** | Income categories were offered on expenses. The recurring flag did nothing and overlapped the Tracker; a nullable `subscription_id` is an additive migration Phase 4 can make when the Tracker exists |
| 2026-09-14 | **F0-2 · Ledger pages by keyset `(date, id) < (?, ?)`, page 1 live** | A growing `LIMIT` re-sends every loaded row on every write; a 500-row cap can't meet "scroll 50k end to end"; Sheets (6A) needs the same paging |
| 2026-09-14 | **F0-1 · B′: main DB unkeyed on device; SQLCipher kept only for passphrase-encrypted backup files** | A Keystore-held key never leaves the phone, so auto-backup restored an unopenable DB. FBE + sandbox protect data at rest and Android 9+ encrypts auto-backups with the lock-screen PIN. Keeping SQLCipher in the build gives encrypted exports via `sqlcipher_export` with no JS crypto library. Option A (recovery code) rejected: another secret to lose, slow KDF on Hermes, little added protection |
| 2026-09-14 | Fix phases F0–F7 created from the 13 Sep review, re-checked against `f83ad9a` | Schema and data-access fixes are cheap only before real data and before more screens are built on `useLiveQuery` |
