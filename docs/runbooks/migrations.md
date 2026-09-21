# Runbook — changing the database schema

Written for whoever is editing `db/schema.ts`. Follow it top to bottom. The steps that can silently
destroy someone's data are marked **⚠** — this app has no server and no second copy, so a migration
that eats a table eats it for good.

Related: [`release.md`](release.md) — a schema change makes the next release a **schema release**, with
two extra drills.

---

## 0. Is this actually a schema change?

Yes: a new table, column, index, constraint or default in [`db/schema.ts`](../../db/schema.ts).
No: a new query, a new read builder, a new screen. Those need no migration.

**A schema change is not a native change.** Migrations are bundled into the JS by
`babel-plugin-inline-import`, so they ship over the air with the next update. No rebuild, no
`verify:apk`.

## 1. Edit the schema

`db/schema.ts` is the source of truth for every table and type — types flow out of it into the whole
app. Change it there and nowhere else.

Before you add a column with a foreign key to `categories` or `people`, read convention #11: every
`category_id` / `person_id` reference must be handled by the merge, delete and restore paths, which
means `features/categories/mutations.ts` and its test change too. B4 was exactly this, missed once.

## 2. Generate

```bash
npm run db:generate      # drizzle-kit generate
```

This writes `db/migrations/00NN_<random_words>.sql`, appends to `meta/_journal.json`, snapshots into
`meta/00NN_snapshot.json` and adds an import to `migrations.js`.

## 3. Read the generated SQL ⚠

**Every time. drizzle-kit 0.31 emits SQLite that is wrong in three known ways**, and each one is silent
— the migration applies cleanly and the damage shows up later.

**(1) A new column plus a table rebuild in one generate.** The rebuild's
`INSERT INTO __new_x SELECT …` copies the new column _from the old table_, where it does not exist.

> **Fix:** split it. Generate the column alone, commit, then generate the rebuild.

**(2) A rebuild copies VIRTUAL generated columns.** SQLite rejects an explicit insert into a generated
column. `transactions.month` is one.

> **Fix:** in a `--custom` migration, drop `month` before the rebuild and re-add it after. Any future
> rebuild of `transactions` hits this.

**(3) A partial expression index comes out as a backticked column name.** `lower(name)` is emitted as
`` `lower(name)` ``, which is a column that does not exist.

> **Fix:** write the index by hand in a `--custom` migration. `cat_name_unique` is why migration
> `0006_category_name_unique` is custom.

Read the file for the ordinary things too: does the `WHERE` clause on a partial index match what the
queries actually filter on (`deleted_at IS NULL`)? Is the column order the one the query planner needs?
An index with the wrong leading column still returns correct answers, just slowly, and no test will
catch it.

## 4. Rename it

drizzle-kit names files with random words (`0000_greedy_phalanx`). Rename to what it does:

```
0009_analytics_covering_indexes.sql
```

A rename means **three** files, and missing one means the migration never runs on a phone:

1. the `.sql` file itself
2. `meta/_journal.json` → the `tag` for that `idx`
3. `migrations.js` → the `import m00NN from './…'` line

⚠ **Never hand-edit a generated migration's SQL** beyond this rename. If the generated SQL is wrong,
delete the whole generate (file, journal entry, snapshot, import) and either change the schema or write
a `--custom` migration instead.

## 5. Data fixes go in a custom migration

Backfills, tombstones, seeding a row — anything that moves data rather than shape:

```bash
npx drizzle-kit generate --custom --name backfill_something
```

That gives an empty numbered file in the right place in the journal. Write the SQL yourself.
`0003_backfill_uid_kind_timestamps` and `0008_seed_self_person` are the worked examples.

## 6. Test on a populated database ⚠

**Migrations on an empty database prove nothing.** Empty tables satisfy every constraint, so a
migration that would violate a unique index or cascade away a table passes cleanly.

[`db/__tests__/migrations.test.ts`](../../db/__tests__/migrations.test.ts) builds a 50,000-row fixture
in the shape a real install has at migration 0000 and runs the whole chain over it. Add to it:

- the rows the new migration touches, created **before** the migration runs
- an assertion that every pre-existing row survived with its values intact
- if you added an index, its name in the `creates every index` list
- if you added a table with an FK, that `PRAGMA foreign_key_check` is still empty

```bash
npx jest db/__tests__/migrations.test.ts
```

It is the slow test in the suite for this reason. Do not trim the fixture to make it faster.

### Never migrate with foreign keys on ⚠

Drizzle runs every pending migration inside one transaction, and `PRAGMA foreign_keys=OFF` is a **no-op
inside a transaction** — so drizzle-kit's own rebuild preamble does nothing. Rebuilding `categories`
with FKs on runs an implicit `DELETE FROM categories` first, which cascades every budget away and
uncategorises every transaction. Silently.

`migrateWithForeignKeysOff` in [`db/migrate.ts`](../../db/migrate.ts) turns them off _outside_ the
transaction, migrates, runs `PRAGMA foreign_key_check` and turns them back on. `db/boot.ts` is the only
caller and there is a test that demonstrates the data loss without it. **Do not add a second migration
path that skips it.**

## 7. Run it on a copy of the phone's database ⚠

The fixture is what you imagined real data looks like. The phone is what it is.

```bash
# Background the app first — that checkpoints the WAL into the .db file.
npm run db:pull        # adb exec-out run-as … cat files/SQLite/spendwise.db > ./local.db
cp local.db local-before.db
npm run db:studio      # or open local.db directly
```

Apply the migration to `local.db`, then check against `local-before.db`:

- row counts per table, before and after
- the totals that matter: sum of `amount_paise` by type
- `PRAGMA foreign_key_check` returns nothing
- `PRAGMA integrity_check` returns `ok`

⚠ `db:pull` needs a **debuggable** build. `run-as` fails on a release APK, so pull from the dev build.

## 8. Then, on the phone itself

Install the update over the existing app — do not uninstall, that is the whole point. On first launch
`db/boot.ts` should:

1. write `files/snapshots/pre-migration-<timestamp>.db` (it snapshots whenever any user data exists)
2. apply the migration
3. pass `PRAGMA integrity_check`

Confirm the snapshot exists and opens in Drizzle Studio. That file is the way back.

## 9. Update what claims to be true

- `CLAUDE.md` → the data model table, and the migration count in its intro line
- `TASKS.md` → what shipped
- the device-verification list, if the migration needs a check on the phone

Then [`release.md`](release.md), which will send you back here for the migration drill.

---

## The short version

```
edit db/schema.ts
npm run db:generate
READ THE SQL              ← three known generator bugs
rename: .sql + _journal.json + migrations.js
extend db/__tests__/migrations.test.ts   ← populated, never empty
npx jest db/__tests__/migrations.test.ts
npm run db:pull → apply to a copy → compare counts and totals
install over the existing app → confirm the pre-migration snapshot
```
