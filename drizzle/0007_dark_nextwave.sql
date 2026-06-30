CREATE TABLE `telegram_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`telegram_chat_id` text NOT NULL,
	`onboarding_state` text,
	`onboarding_draft_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `telegram_users_chat_id_idx` ON `telegram_users` (`telegram_chat_id`);--> statement-breakpoint
ALTER TABLE `portfolios` ADD `telegram_user_id` integer REFERENCES telegram_users(id);--> statement-breakpoint
ALTER TABLE `portfolios` ADD `risk_tolerance` text DEFAULT 'medium' NOT NULL;--> statement-breakpoint
ALTER TABLE `portfolios` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `portfolios_one_active_per_user_idx` ON `portfolios` (`telegram_user_id`) WHERE "portfolios"."is_active" = 1;