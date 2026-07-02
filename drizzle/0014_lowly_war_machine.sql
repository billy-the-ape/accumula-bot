ALTER TABLE `telegram_users` ADD `telegram_from_user_id` text;--> statement-breakpoint
ALTER TABLE `telegram_users` ADD `first_name` text;--> statement-breakpoint
ALTER TABLE `telegram_users` ADD `last_name` text;--> statement-breakpoint
ALTER TABLE `telegram_users` ADD `telegram_username` text;--> statement-breakpoint
ALTER TABLE `telegram_users` ADD `language_code` text;--> statement-breakpoint
ALTER TABLE `telegram_users` ADD `is_bot` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_users` ADD `is_premium` integer DEFAULT false NOT NULL;