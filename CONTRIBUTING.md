# Contributing to SpendWise Android

This is how work gets done here. For **what** the app is and how it is built, read
[`CLAUDE.md`](CLAUDE.md). For **what to do next**, read [`TASKS.md`](TASKS.md) and the task cards in
[`plan.md`](plan.md).

## Before you push

```bash
npm run verify
```

That runs every check CI runs: type-checking of the app and the tests, lint, the lint self-test,
formatting, the test suite and the release permission policy. The suite takes a few minutes, because
the migration tests build 50,000-row databases. If `verify` passes locally, CI will pass.

| Check                          | What it protects                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------- |
| `npm run typecheck`            | App **and** test types (tests have their own `tsconfig.test.json`)                        |
| `npm run lint`                 | Layer boundaries, no network, money handling, synchronous `writeTx`, hook dependencies    |
| `npm run lint:selftest`        | That the lint rules above still fire (a rule can silently stop matching after an upgrade) |
| `npm run format:check`         | Prettier formatting                                                                       |
| `npx jest`                     | Behaviour, including real migrations on populated databases                               |
| `npm run check:release-policy` | The release config blocks `INTERNET` and keeps `allowBackup`                              |

Fix formatting with `npm run format`. Never use `--no-verify` or disable a lint rule to get a change
through. If a rule is wrong, change it in `eslint.config.js` **with a comment saying why**.

## Branches, commits and pull requests

- **Branch per batch** from `main`: `r3-a-shared-data`, `p7-backup-export`, `fix-ledger-retry`.
- **One batch = one PR.** A batch is the unit in `TASKS.md` (for example R1-A). It should be small
  enough to review in one sitting.
- **Keep moves and changes apart.** If a file moves and its behaviour changes, make two commits so the
  reviewer can see each one. Formatting-only commits go in `.git-blame-ignore-revs`.
- **Commit messages:** an imperative subject line (`Bound analytics ranges at the current month`),
  then a body that explains **why**. Say which bug or task it closes (`B2`, `R3-4`).
- **Every bug fix starts with a failing test.** Write the test, watch it fail against the current
  code, then fix it. A test that was never seen failing proves nothing.

## Where new code goes

Use the **target layout** in `CLAUDE.md` → _Architecture_, even where older features have not moved
to it yet. In short:

```
features/<name>/
  screens/        full screens (routes render these)
  components/     UI only this feature uses
  data/sql.ts     read builders that TAKE `db`, so tests run the shipped SQL
  data/writes.ts  write cores: take `db`, use writeTx, throw UserFacingError
  data/hooks.ts   useDbQuery hooks
  data/actions.ts safeWrite-wrapped writes; what screens call
  domain/         pure logic, no database and no React Native
data/             queries two or more features need
```

The import direction is `app → features → (components | data) → db → lib`, and **a feature never
imports another feature**. If two features need the same thing, move it down into `data/`,
`components/` or `lib/`. Lint enforces this.

## Changing the database schema

A schema change is the riskiest change in this app: a migration that fails on someone's phone can
leave their data unreadable, and there is no server copy. Follow every step.

**The full procedure, with the failure modes, is [`docs/runbooks/migrations.md`](docs/runbooks/migrations.md).**
What follows is the summary.

1. Edit `db/schema.ts`.
2. `npm run db:generate`.
3. **Read the generated SQL.** drizzle-kit 0.31 produces broken migrations in three known cases
   (listed in `CLAUDE.md` → _Gotchas_). Never hand-edit a generated file; if you need custom SQL, use
   `npx drizzle-kit generate --custom`.
4. Run `db/__tests__/migrations.test.ts`. It applies the migration to a **populated** database.
   Migrations on an empty database prove nothing, because empty tables hide every constraint violation.
5. Run the migration on a copy of a real phone database (`npm run db:pull`).
6. If the new table has a `category_id` or `person_id` column, update the merge, delete and restore
   paths and their tests. `features/categories/__tests__/mutations.test.ts` fails until you do.

## Checking on the phone

Node tests cover logic and SQL, but not what the phone does: rendering, gestures, the keyboard,
notifications, backup and restore. A change to any of those is **not done** until you have checked it
on a real device and ticked the matching line in `TASKS.md` → _Device verification_, with the date.
If there is no line for it, add one.

Setup and troubleshooting: [`docs/run-on-phone.md`](docs/run-on-phone.md).

## Things that are never acceptable

- A network call of any kind (`fetch`, an HTTP client, a WebSocket). The release build has no
  `INTERNET` permission, and that is a promise to users.
- Money as a float. Money is integer paise from input to storage to display.
- An `async` callback passed to `writeTx`. The driver commits when the callback returns, so everything
  after the first `await` runs outside the transaction.
- A migration that has only been tested on an empty database.
