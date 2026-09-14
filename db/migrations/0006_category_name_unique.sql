-- Custom migration (drizzle-kit generate --custom): case-insensitive uniqueness among LIVE categories.
-- Lives here, after the last rebuild of `categories`, because drizzle-kit 0.31 emits partial expression
-- indexes with the expression in backticks (read by SQLite as a column name). See db/schema.ts.
CREATE UNIQUE INDEX `cat_name_unique` ON `categories` (lower(`name`)) WHERE `deleted_at` IS NULL;
