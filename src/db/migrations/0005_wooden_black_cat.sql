ALTER TABLE `models` ADD `slice_status` enum('PENDING','PROCESSING','COMPLETED','FAILED');--> statement-breakpoint
ALTER TABLE `models` ADD `gcode_url` varchar(500);--> statement-breakpoint
ALTER TABLE `models` ADD `gcode_metadata` json;