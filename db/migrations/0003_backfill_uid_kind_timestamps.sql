-- Custom data migration (drizzle-kit generate --custom). Runs inside the migrator's single transaction.
-- 1. System categories get fixed uids, so db/seed.ts reconciles them by identity, not by name
--    (a user may rename "Rent"; that must not make the seeder add "Rent" again).
UPDATE `categories` SET `uid` = 'sys:food-dining' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Food & Dining';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:groceries' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Groceries';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:transport' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Transport';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:shopping' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Shopping';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:entertainment' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Entertainment';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:bills-utilities' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Bills & Utilities';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:health' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Health';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:education' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Education';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:rent' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Rent';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:travel' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Travel';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:subscriptions' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Subscriptions';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:personal-care' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Personal Care';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:gifts-donations' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Gifts & Donations';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:investments' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Investments';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:salary' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Salary';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:other-income' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Other Income';--> statement-breakpoint
UPDATE `categories` SET `uid` = 'sys:miscellaneous' WHERE `is_system` = 1 AND `uid` IS NULL AND `deleted_at` IS NULL AND `name` = 'Miscellaneous';--> statement-breakpoint
-- 2. Every other row gets a random uid (32 hex chars, same shape as the column default in 0004).
UPDATE `categories` SET `uid` = lower(hex(randomblob(16))) WHERE `uid` IS NULL;--> statement-breakpoint
UPDATE `import_batches` SET `uid` = lower(hex(randomblob(16))) WHERE `uid` IS NULL;--> statement-breakpoint
UPDATE `transactions` SET `uid` = lower(hex(randomblob(16))) WHERE `uid` IS NULL;--> statement-breakpoint
UPDATE `budgets` SET `uid` = lower(hex(randomblob(16))) WHERE `uid` IS NULL;--> statement-breakpoint
UPDATE `subscriptions` SET `uid` = lower(hex(randomblob(16))) WHERE `uid` IS NULL;--> statement-breakpoint
-- 3. Category kind for the seeded set; user-created categories keep the default 'both'.
UPDATE `categories` SET `kind` = 'income' WHERE `uid` IN ('sys:salary', 'sys:other-income');--> statement-breakpoint
UPDATE `categories` SET `kind` = 'expense' WHERE `uid` LIKE 'sys:%' AND `uid` NOT IN ('sys:salary', 'sys:other-income', 'sys:investments', 'sys:gifts-donations', 'sys:miscellaneous');--> statement-breakpoint
-- 4. One timestamp format: 'YYYY-MM-DD HH:MM:SS' (old CURRENT_TIMESTAMP default) and bare dates
--    become 'YYYY-MM-DDTHH:MM:SS.sssZ', matching toISOString() and the new column default.
UPDATE `categories` SET `created_at` = replace(`created_at`, ' ', 'T') || '.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `categories` SET `created_at` = `created_at` || 'T00:00:00.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `categories` SET `deleted_at` = replace(`deleted_at`, ' ', 'T') || '.000Z' WHERE `deleted_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `categories` SET `deleted_at` = `deleted_at` || 'T00:00:00.000Z' WHERE `deleted_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `import_batches` SET `created_at` = replace(`created_at`, ' ', 'T') || '.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `import_batches` SET `created_at` = `created_at` || 'T00:00:00.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `import_batches` SET `undone_at` = replace(`undone_at`, ' ', 'T') || '.000Z' WHERE `undone_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `import_batches` SET `undone_at` = `undone_at` || 'T00:00:00.000Z' WHERE `undone_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `transactions` SET `created_at` = replace(`created_at`, ' ', 'T') || '.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `transactions` SET `created_at` = `created_at` || 'T00:00:00.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `transactions` SET `updated_at` = replace(`updated_at`, ' ', 'T') || '.000Z' WHERE `updated_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `transactions` SET `updated_at` = `updated_at` || 'T00:00:00.000Z' WHERE `updated_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `transactions` SET `deleted_at` = replace(`deleted_at`, ' ', 'T') || '.000Z' WHERE `deleted_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `transactions` SET `deleted_at` = `deleted_at` || 'T00:00:00.000Z' WHERE `deleted_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `budgets` SET `created_at` = replace(`created_at`, ' ', 'T') || '.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `budgets` SET `created_at` = `created_at` || 'T00:00:00.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `budgets` SET `deleted_at` = replace(`deleted_at`, ' ', 'T') || '.000Z' WHERE `deleted_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `budgets` SET `deleted_at` = `deleted_at` || 'T00:00:00.000Z' WHERE `deleted_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `subscriptions` SET `created_at` = replace(`created_at`, ' ', 'T') || '.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `subscriptions` SET `created_at` = `created_at` || 'T00:00:00.000Z' WHERE `created_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `subscriptions` SET `deleted_at` = replace(`deleted_at`, ' ', 'T') || '.000Z' WHERE `deleted_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `subscriptions` SET `deleted_at` = `deleted_at` || 'T00:00:00.000Z' WHERE `deleted_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';--> statement-breakpoint
UPDATE `app_meta` SET `updated_at` = replace(`updated_at`, ' ', 'T') || '.000Z' WHERE `updated_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';--> statement-breakpoint
UPDATE `app_meta` SET `updated_at` = `updated_at` || 'T00:00:00.000Z' WHERE `updated_at` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';
