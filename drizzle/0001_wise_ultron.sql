CREATE TABLE `portfolios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`asset_to_accumulate` text NOT NULL,
	`cash_symbol` text NOT NULL,
	`daily_baseline_btc_value` real NOT NULL,
	`weekly_baseline_btc_value` real NOT NULL,
	`initial_btc_baseline` real NOT NULL,
	`trading_enabled` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`symbol` text NOT NULL,
	`quantity` real NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `positions_portfolio_symbol_idx` ON `positions` (`portfolio_id`,`symbol`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`decision_id` integer,
	`created_at` integer NOT NULL,
	`side` text NOT NULL,
	`symbol` text NOT NULL,
	`quantity` real NOT NULL,
	`price_usd` real NOT NULL,
	`quote_value_usd` real NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`decision_id`) REFERENCES `decisions`(`id`) ON UPDATE no action ON DELETE no action
);
