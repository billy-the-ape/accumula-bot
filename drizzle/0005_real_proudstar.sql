CREATE TABLE `macro_briefings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`content` text NOT NULL,
	`llm_provider` text NOT NULL,
	`llm_model` text NOT NULL,
	`prompt_version` text NOT NULL
);
