ALTER TABLE `generation_jobs` ADD `provider` text DEFAULT 'openai' NOT NULL;
--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `prompt_version` text DEFAULT 'haiku-v1' NOT NULL;
--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `reserved_tokens` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `input_tokens` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `output_tokens` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `reserved_cost_microusd` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `error_code` text;
--> statement-breakpoint
ALTER TABLE `generation_jobs` ADD `completed_at` text;
--> statement-breakpoint
ALTER TABLE `records` ADD `generation_job_id` text;
--> statement-breakpoint
ALTER TABLE `records` ADD `selected_candidate_index` integer;
--> statement-breakpoint
CREATE INDEX `generation_status_date` ON `generation_jobs` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `records_generation_job` ON `records` (`generation_job_id`);
