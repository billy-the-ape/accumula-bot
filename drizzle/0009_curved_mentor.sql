ALTER TABLE `portfolios` ADD `mode` text DEFAULT 'paper' NOT NULL;--> statement-breakpoint
ALTER TABLE `portfolios` ADD `chain_id` integer;--> statement-breakpoint
ALTER TABLE `portfolios` ADD `wallet_address` text;--> statement-breakpoint
ALTER TABLE `portfolios` ADD `encrypted_private_key` text;--> statement-breakpoint
ALTER TABLE `portfolios` ADD `funding_status` text;--> statement-breakpoint
ALTER TABLE `portfolios` ADD `total_deposited_usd` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `portfolios` ADD `min_deposit_usd` real;