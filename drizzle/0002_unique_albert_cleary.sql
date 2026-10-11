CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_owner` ON `attachments` (`owner_id`);--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`request_key` text NOT NULL,
	`input_json` text NOT NULL,
	`status` text NOT NULL,
	`output_json` text,
	`model` text NOT NULL,
	`usage_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_owner_request` ON `generation_jobs` (`owner_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `generation_owner_date` ON `generation_jobs` (`owner_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`style` text DEFAULT '自由詩に近いHaiku' NOT NULL,
	`expression` text DEFAULT '平易な英語に、気の利いた単語や表現をひとつ' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `records` ADD `photo_id` text DEFAULT '' NOT NULL;