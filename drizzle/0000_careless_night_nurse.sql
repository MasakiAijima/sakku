CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`create_key` text NOT NULL,
	`scene_text` text NOT NULL,
	`haiku_text` text DEFAULT '' NOT NULL,
	`record_date` text NOT NULL,
	`status` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "records_status" CHECK("records"."status" IN ('draft','completed')),
	CONSTRAINT "records_completed_content" CHECK("records"."status" != 'completed' OR (length(trim("records"."scene_text")) > 0 AND length(trim("records"."haiku_text")) > 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `records_owner_create` ON `records` (`owner_id`,`create_key`);--> statement-breakpoint
CREATE INDEX `records_owner_date` ON `records` (`owner_id`,`record_date`);