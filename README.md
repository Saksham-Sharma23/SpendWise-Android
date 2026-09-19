# SpendWise

An offline expense tracker for Android. Every rupee lives in a SQLite database on the phone.

**There is no server, no account and no network call.** The release build does not declare the
`INTERNET` permission, so Android itself enforces that — not convention, and not code review.

It shares the SpendWise web app's design and domain model, and nothing else: no shared code, API or
database.

## What it does

- **Ledger** — income and expenses, categorised, searchable, with a filter sheet, swipe-delete with
  undo, multi-select and CSV export.
- **Home** — this month against last, a 6/12-month trend, top categories, budgets and upcoming renewals.
- **Insights** — 3/6/12/24-month ranges, a scrubbable area chart, stat cards and a category donut.
- **Budgets** — a monthly limit per category on its own reset day, warning at 75%.
- **Tracker** — subscriptions and recurring bills, with the next renewal computed on read.
- **Groups** — shared expenses split equally, exactly, by percent or by shares, with multiple payers,
  debt simplification and settle-up. Groups never touch the ledger.

Not built yet: spreadsheet import, backup and restore, and reminders. See [`TASKS.md`](TASKS.md).

> **A factory reset currently loses your data.** Android auto-backup rules are in place, but manual
> export and restore are Phase 7. Don't rely on this as your only record yet.

## Requirements

- **Node 22.x** (`>=22 <23`, enforced in `package.json`)
- **A physical Android phone.** There is no emulator setup here.
- **A development build.** Expo Go will not work — the app uses SQLCipher and MMKV, which need
  native code Expo Go does not ship.
- Android Studio / the Android SDK for local native builds, or an Expo account for EAS builds.

## Getting started

```bash
npm ci
npm run typecheck && npm test     # both must pass before you commit
```

Then get it onto a phone. The full walkthrough, including wireless debugging and troubleshooting,
is in [`docs/run-on-phone.md`](docs/run-on-phone.md) — read that first if anything below fails.

```bash
adb connect <phone-ip>:<port>     # wireless debugging
npm run android:local             # local arm64 dev build; or: npm run build:dev (EAS)
npm start                         # Metro, once the build is installed
```

**Build the APK before starting Metro.** The local build is tuned for an 8 GB machine
(arm64 only, Kotlin in-process, two workers) and running both at once will thrash.

**Use `npm run prebuild:dev`, never `npx expo prebuild`.** `INTERNET` is fail-closed: the dev-only
wrapper (`scripts/with-dev-network.js`) grants it so Metro can reach the phone. A plain prebuild
produces a dev build that cannot talk to your machine.

## Everyday commands

| Command                     | What it does                                                         |
| --------------------------- | -------------------------------------------------------------------- |
| `npm run verify`            | **Everything CI runs. Run this before every push** (~5 min)          |
| `npm test`                  | Jest, against the real schema on better-sqlite3                      |
| `npm run typecheck`         | The app and the tests                                                |
| `npm run lint`              | ESLint, including the layer boundaries                               |
| `npm run theme:css`         | Regenerate `global.css` after editing a palette in `lib/theme.ts`    |
| `npm run db:generate`       | Generate a migration after editing `db/schema.ts` — **read the SQL** |
| `npm run db:pull`           | Copy the phone's database to `./local.db`                            |
| `npm run db:studio`         | Browse that copy                                                     |
| `npm run build:release-apk` | Release APK, then verify its permissions with `aapt2`                |

## How it fits together

```
app/  →  features/  →  components/  ·  data/*  →  db/  →  lib/
routes   screens,       presentational  shared    SQLite   pure utilities
         feature data   UI              queries   runtime
```

Imports only ever point right. ESLint enforces it — a feature cannot import a sibling, and a route
reaches a feature only through its `index.ts`.

Every feature has the same shape: `index.ts` (its public surface), `components/`, `data/`
(`sql` · `writes` · `hooks` · `actions`), `domain/` (pure logic) and `schema.ts` (form validation).
`features/budgets` and `features/tracker` are the smallest complete examples — copy one when you add
a feature.

A few rules matter more than the rest:

- **Money is integer paise everywhere.** Text becomes paise through `parseAmountToPaise`, never a
  float; paise become text once, through `lib/money.ts`.
- **Aggregate in SQL**, never by pulling rows into JS to sum them.
- **Reads** go through `useDbQuery` over `readDb` (a native worker thread), **writes** through
  `writeTx` with a **synchronous** callback — the driver commits when it returns.
- **Nothing is hard-deleted.** `deleted_at` plus partial unique indexes, purged after 30 days.

## Where to look

| Doc                                                                                | What it is for                                                     |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                               | **Read before your first change**: what to run, where code goes    |
| [`CLAUDE.md`](CLAUDE.md)                                                           | The full context: stack, conventions, data model and the gotchas   |
| [`TASKS.md`](TASKS.md)                                                             | The live tracker: status, what's next, device checks               |
| [`plan.md`](plan.md)                                                               | Task cards for everything remaining, with file and line references |
| [`docs/run-on-phone.md`](docs/run-on-phone.md)                                     | Getting a build onto the phone, with troubleshooting               |
| [`docs/architecture-review-2026-09-17.md`](docs/architecture-review-2026-09-17.md) | Known bugs, architecture problems and the target architecture      |
| [`docs/history/`](docs/history/)                                                   | Archived trackers — the _why_ behind code that looks unusual       |

The gotchas in `CLAUDE.md` are worth reading before you touch the database or the build. They are
all things that have already cost someone a day: drizzle-kit emitting broken SQLite migrations,
foreign keys cascading during a migration, and `toLocaleString` silently falling back to US digit
grouping without ICU.

## Licence

**Not yet chosen.** The `LICENSE` file in this repo is Expo's own MIT licence, copyright 650
Industries — it arrived with the project template and does not describe this app. Replace it before
publishing or sharing the source.
