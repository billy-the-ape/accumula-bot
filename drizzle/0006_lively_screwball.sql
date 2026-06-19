CREATE TABLE `social_media_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`external_id` text NOT NULL,
	`source` text NOT NULL,
	`username` text NOT NULL,
	`text` text NOT NULL,
	`posted_at` integer NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`relevance_score` integer NOT NULL,
	`scored_at` integer NOT NULL,
	`llm_provider` text NOT NULL,
	`llm_model` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `social_media_posts_source_external_id_idx` ON `social_media_posts` (`source`,`external_id`);