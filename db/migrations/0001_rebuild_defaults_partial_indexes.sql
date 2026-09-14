PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`color` text,
	`is_system` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
INSERT INTO `__new_categories`("id", "name", "icon", "color", "is_system", "created_at", "deleted_at") SELECT "id", "name", "icon", "color", "is_system", "created_at", "deleted_at" FROM `categories`;--> statement-breakpoint
DROP TABLE `categories`;--> statement-breakpoint
ALTER TABLE `__new_categories` RENAME TO `categories`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`date` text NOT NULL,
	`is_recurring` integer DEFAULT false NOT NULL,
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
INSERT INTO `__new_transactions`("id", "type", "amount_paise", "date", "is_recurring", "note", "category_id", "import_batch_id", "dedupe_hash", "created_at", "updated_at", "deleted_at") SELECT "id", "type", "amount_paise", "date", "is_recurring", "note", "category_id", "import_batch_id", "dedupe_hash", "created_at", "updated_at", "deleted_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE INDEX `tx_ledger_idx` ON `transactions` (`date`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `tx_cat_idx` ON `transactions` (`category_id`,`date`);--> statement-breakpoint
CREATE INDEX `tx_batch_idx` ON `transactions` (`import_batch_id`);--> statement-breakpoint
CREATE INDEX `tx_dedupe_idx` ON `transactions` (`dedupe_hash`);--> statement-breakpoint
CREATE TABLE `__new_budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category_id` integer NOT NULL,
	`limit_paise` integer NOT NULL,
	`reset_day` integer DEFAULT 1 NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_budgets`("id", "category_id", "limit_paise", "reset_day", "is_active", "created_at", "deleted_at") SELECT "id", "category_id", "limit_paise", "reset_day", "is_active", "created_at", "deleted_at" FROM `budgets`;--> statement-breakpoint
DROP TABLE `budgets`;--> statement-breakpoint
ALTER TABLE `__new_budgets` RENAME TO `budgets`;--> statement-breakpoint
CREATE UNIQUE INDEX `budget_cat_unique` ON `budgets` (`category_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `__new_app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_app_meta`("key", "value", "updated_at") SELECT "key", "value", "updated_at" FROM `app_meta`;--> statement-breakpoint
DROP TABLE `app_meta`;--> statement-breakpoint
ALTER TABLE `__new_app_meta` RENAME TO `app_meta`;--> statement-breakpoint
CREATE TABLE `__new_import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_name` text NOT NULL,
	`rows_imported` integer DEFAULT 0 NOT NULL,
	`rows_skipped` integer DEFAULT 0 NOT NULL,
	`rows_duplicate` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`undone_at` text
);
--> statement-breakpoint
INSERT INTO `__new_import_batches`("id", "source_name", "rows_imported", "rows_skipped", "rows_duplicate", "created_at", "undone_at") SELECT "id", "source_name", "rows_imported", "rows_skipped", "rows_duplicate", "created_at", "undone_at" FROM `import_batches`;--> statement-breakpoint
DROP TABLE `import_batches`;--> statement-breakpoint
ALTER TABLE `__new_import_batches` RENAME TO `import_batches`;--> statement-breakpoint
CREATE TABLE `__new_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
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
INSERT INTO `__new_subscriptions`("id", "name", "amount_paise", "billing_cycle", "status", "anchor_date", "category_id", "reminder_days_before", "created_at", "deleted_at") SELECT "id", "name", "amount_paise", "billing_cycle", "status", "anchor_date", "category_id", "reminder_days_before", "created_at", "deleted_at" FROM `subscriptions`;--> statement-breakpoint
DROP TABLE `subscriptions`;--> statement-breakpoint
ALTER TABLE `__new_subscriptions` RENAME TO `subscriptions`;--> statement-breakpoint
CREATE INDEX `sub_status_idx` ON `subscriptions` (`status`,`deleted_at`);