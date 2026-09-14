PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`category_id` integer NOT NULL,
	`limit_paise` integer NOT NULL,
	`reset_day` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_budgets`("id", "uid", "category_id", "limit_paise", "reset_day", "is_active", "created_at", "deleted_at") SELECT "id", "uid", "category_id", "limit_paise", "reset_day", "is_active", "created_at", "deleted_at" FROM `budgets`;--> statement-breakpoint
DROP TABLE `budgets`;--> statement-breakpoint
ALTER TABLE `__new_budgets` RENAME TO `budgets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `budget_uid_unique` ON `budgets` (`uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_cat_unique` ON `budgets` (`category_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`kind` text DEFAULT 'both' NOT NULL,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "uid", "name", "icon", "color", "kind", "is_system", "created_at", "deleted_at") SELECT "id", "uid", "name", "icon", "color", "kind", "is_system", "created_at", "deleted_at" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `cat_uid_unique` ON `categories` (`uid`);--> statement-breakpoint
CREATE TABLE `__new_import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`source_name` text NOT NULL,
	`rows_imported` integer DEFAULT 0 NOT NULL,
	`rows_skipped` integer DEFAULT 0 NOT NULL,
	`rows_duplicate` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`undone_at` text
);
--> statement-breakpoint
INSERT INTO `__new_import_batches`("id", "uid", "source_name", "rows_imported", "rows_skipped", "rows_duplicate", "created_at", "undone_at") SELECT "id", "uid", "source_name", "rows_imported", "rows_skipped", "rows_duplicate", "created_at", "undone_at" FROM `import_batches`;--> statement-breakpoint
DROP TABLE `import_batches`;--> statement-breakpoint
ALTER TABLE `__new_import_batches` RENAME TO `import_batches`;--> statement-breakpoint
CREATE UNIQUE INDEX `batch_uid_unique` ON `import_batches` (`uid`);--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`name` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`billing_cycle` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`anchor_date` text NOT NULL,
	`category_id` integer,
	`reminder_days_before` integer DEFAULT 2 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_subscriptions`("id", "uid", "name", "amount_paise", "billing_cycle", "status", "anchor_date", "category_id", "reminder_days_before", "created_at", "deleted_at") SELECT "id", "uid", "name", "amount_paise", "billing_cycle", "status", "anchor_date", "category_id", "reminder_days_before", "created_at", "deleted_at" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
CREATE UNIQUE INDEX `sub_uid_unique` ON `subscriptions` (`uid`);--> statement-breakpoint
CREATE INDEX `sub_status_idx` ON `subscriptions` (`status`,`deleted_at`);--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`category_id` integer,
	`import_batch_id` integer,
	`dedupe_hash` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`import_batch_id`) REFERENCES `import_batches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "uid", "type", "amount_paise", "date", "note", "category_id", "import_batch_id", "dedupe_hash", "created_at", "updated_at", "deleted_at") SELECT "id", "uid", "type", "amount_paise", "date", "note", "category_id", "import_batch_id", "dedupe_hash", "created_at", "updated_at", "deleted_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE UNIQUE INDEX `tx_uid_unique` ON `transactions` (`uid`);--> statement-breakpoint
CREATE INDEX `tx_ledger_idx` ON `transactions` (`date`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `tx_cat_idx` ON `transactions` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `tx_batch_idx` ON `transactions` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `tx_dedupe_idx` ON `transactions` (`dedupe_hash`);