ALTER TABLE `telegram_users` ADD `default_risk_tolerance` text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE `telegram_users` ADD `locale` text;--> statement-breakpoint
ALTER TABLE `telegram_users` ADD `timezone` text;
