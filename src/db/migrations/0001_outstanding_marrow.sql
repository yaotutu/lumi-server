CREATE TABLE `orphaned_files` (
	`id` varchar(36) NOT NULL,
	`s3_key` varchar(500) NOT NULL,
	`request_id` varchar(36),
	`retry_count` int NOT NULL DEFAULT 0,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_retry_at` timestamp,
	CONSTRAINT `orphaned_files_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `status_retry_count_idx` ON `orphaned_files` (`status`,`retry_count`);--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `orphaned_files` (`created_at`);--> statement-breakpoint
CREATE INDEX `request_id_idx` ON `orphaned_files` (`request_id`);