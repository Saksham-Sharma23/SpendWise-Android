ALTER TABLE `budgets` ADD `uid` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `uid` text;--> statement-breakpoint
ALTER TABLE `categories` ADD `kind` text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE `import_batches` ADD `uid` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `uid` text;--> statement-breakpoint
ALTER TABLE `transactions` ADD `uid` text;