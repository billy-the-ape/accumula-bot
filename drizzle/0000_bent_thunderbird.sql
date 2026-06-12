CREATE TABLE `decisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`asset_to_accumulate` text NOT NULL,
	`recommended_asset` text NOT NULL,
	`confidence` real NOT NULL,
	`reason` text NOT NULL,
	`rankings_json` text NOT NULL,
	`market_snapshots_json` text NOT NULL,
	`llm_provider` text NOT NULL,
	`llm_model` text NOT NULL
);
