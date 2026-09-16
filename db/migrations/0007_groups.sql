CREATE TABLE `group_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`group_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `split_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `group_member_unique` ON `group_members` (`group_id`,`person_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `group_member_person_idx` ON `group_members` (`person_id`);--> statement-breakpoint
CREATE TABLE `people` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`name` text NOT NULL,
	`is_self` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `people_uid_unique` ON `people` (`uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `people_self_unique` ON `people` (`is_self`) WHERE is_self = 1;--> statement-breakpoint
CREATE TABLE `settlements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`group_id` integer NOT NULL,
	`from_person_id` integer NOT NULL,
	`to_person_id` integer NOT NULL,
	`amount_paise` integer NOT NULL,
	`date` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `split_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settlement_uid_unique` ON `settlements` (`uid`);--> statement-breakpoint
CREATE INDEX `settlement_group_idx` ON `settlements` (`group_id`,`date`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `split_debts` (
	`expense_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`debtor_id` integer NOT NULL,
	`creditor_id` integer NOT NULL,
	`amount_paise` integer NOT NULL,
	PRIMARY KEY(`expense_id`, `debtor_id`, `creditor_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `split_expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `split_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`debtor_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creditor_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `split_debt_group_idx` ON `split_debts` (`group_id`);--> statement-breakpoint
CREATE TABLE `split_expense_payers` (
	`expense_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`paid_paise` integer NOT NULL,
	PRIMARY KEY(`expense_id`, `person_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `split_expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `split_payer_person_idx` ON `split_expense_payers` (`person_id`);--> statement-breakpoint
CREATE TABLE `split_expense_shares` (
	`expense_id` integer NOT NULL,
	`person_id` integer NOT NULL,
	`owed_paise` integer NOT NULL,
	`input` integer,
	PRIMARY KEY(`expense_id`, `person_id`),
	FOREIGN KEY (`expense_id`) REFERENCES `split_expenses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `split_share_person_idx` ON `split_expense_shares` (`person_id`);--> statement-breakpoint
CREATE TABLE `split_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`group_id` integer NOT NULL,
	`description` text NOT NULL,
	`amount_paise` integer NOT NULL,
	`date` text NOT NULL,
	`category_id` integer,
	`split_method` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`group_id`) REFERENCES `split_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `split_expense_uid_unique` ON `split_expenses` (`uid`);--> statement-breakpoint
CREATE INDEX `split_expense_group_idx` ON `split_expenses` (`group_id`,`date`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `split_groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`uid` text DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`simplify_debts` integer DEFAULT true NOT NULL,
	`direct_person_id` integer,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`direct_person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `split_group_uid_unique` ON `split_groups` (`uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `split_group_direct_unique` ON `split_groups` (`direct_person_id`) WHERE deleted_at IS NULL AND direct_person_id IS NOT NULL;