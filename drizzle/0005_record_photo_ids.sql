ALTER TABLE `records` ADD `photo_ids_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
UPDATE `records` SET `photo_ids_json` = json_array(`photo_id`) WHERE `photo_id` != '';
