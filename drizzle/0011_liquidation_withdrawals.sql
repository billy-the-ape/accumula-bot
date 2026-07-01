CREATE TABLE `withdrawals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`portfolio_id` integer NOT NULL,
	`destination_address` text NOT NULL,
	`gross_amount_usd` real NOT NULL,
	`fee_amount_usd` real NOT NULL,
	`net_amount_usd` real NOT NULL,
	`fee_tx_hash` text,
	`net_tx_hash` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`portfolio_id`) REFERENCES `portfolios`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `portfolios` ADD `total_withdrawn_usd` real DEFAULT 0 NOT NULL;
