CREATE TABLE `email_verification_codes` (
	`id` varchar(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`code` varchar(10) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`verified_at` timestamp,
	`external_user_id` varchar(36),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `email_verification_codes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `generated_images` (
	`id` varchar(36) NOT NULL,
	`request_id` varchar(36) NOT NULL,
	`index` int NOT NULL,
	`image_url` varchar(500),
	`image_prompt` text,
	`image_status` enum('PENDING','GENERATING','COMPLETED','FAILED') NOT NULL DEFAULT 'PENDING',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`failed_at` timestamp,
	`error_message` text,
	CONSTRAINT `generated_images_id` PRIMARY KEY(`id`),
	CONSTRAINT `request_id_index_unique` UNIQUE(`request_id`,`index`)
);
--> statement-breakpoint
CREATE TABLE `generation_requests` (
	`id` varchar(36) NOT NULL,
	`external_user_id` varchar(36) NOT NULL,
	`prompt` text NOT NULL,
	`request_status` enum('IMAGE_PENDING','IMAGE_GENERATING','IMAGE_COMPLETED','IMAGE_FAILED','MODEL_PENDING','MODEL_GENERATING','MODEL_COMPLETED','MODEL_FAILED','COMPLETED','FAILED','CANCELLED') NOT NULL DEFAULT 'IMAGE_PENDING',
	`request_phase` enum('IMAGE_GENERATION','AWAITING_SELECTION','MODEL_GENERATION','COMPLETED') NOT NULL DEFAULT 'IMAGE_GENERATION',
	`selected_image_index` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	CONSTRAINT `generation_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `image_generation_jobs` (
	`id` varchar(36) NOT NULL,
	`image_id` varchar(36) NOT NULL,
	`job_status` enum('PENDING','RUNNING','RETRYING','COMPLETED','FAILED','CANCELLED','TIMEOUT') NOT NULL DEFAULT 'PENDING',
	`priority` int NOT NULL DEFAULT 0,
	`retry_count` int NOT NULL DEFAULT 0,
	`max_retries` int NOT NULL DEFAULT 3,
	`next_retry_at` timestamp,
	`timeout_at` timestamp,
	`provider_name` varchar(50),
	`provider_job_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`completed_at` timestamp,
	`failed_at` timestamp,
	`error_message` text,
	`error_code` varchar(50),
	`execution_duration` int,
	CONSTRAINT `image_generation_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `image_generation_jobs_image_id_unique` UNIQUE(`image_id`)
);
--> statement-breakpoint
CREATE TABLE `model_generation_jobs` (
	`id` varchar(36) NOT NULL,
	`model_id` varchar(36) NOT NULL,
	`job_status` enum('PENDING','RUNNING','RETRYING','COMPLETED','FAILED','CANCELLED','TIMEOUT') NOT NULL DEFAULT 'PENDING',
	`priority` int NOT NULL DEFAULT 0,
	`progress` int NOT NULL DEFAULT 0,
	`retry_count` int NOT NULL DEFAULT 0,
	`max_retries` int NOT NULL DEFAULT 3,
	`next_retry_at` timestamp,
	`timeout_at` timestamp,
	`provider_name` varchar(50),
	`provider_job_id` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`started_at` timestamp,
	`completed_at` timestamp,
	`failed_at` timestamp,
	`error_message` text,
	`error_code` varchar(50),
	`execution_duration` int,
	CONSTRAINT `model_generation_jobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `model_generation_jobs_model_id_unique` UNIQUE(`model_id`)
);
--> statement-breakpoint
CREATE TABLE `model_interactions` (
	`id` varchar(36) NOT NULL,
	`external_user_id` varchar(36) NOT NULL,
	`model_id` varchar(36) NOT NULL,
	`interaction_type` enum('LIKE','FAVORITE') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `model_interactions_id` PRIMARY KEY(`id`),
	CONSTRAINT `external_user_id_model_id_type_unique` UNIQUE(`external_user_id`,`model_id`,`interaction_type`)
);
--> statement-breakpoint
CREATE TABLE `models` (
	`id` varchar(36) NOT NULL,
	`external_user_id` varchar(36) NOT NULL,
	`model_source` enum('AI_GENERATED','USER_UPLOADED') NOT NULL DEFAULT 'AI_GENERATED',
	`request_id` varchar(36),
	`source_image_id` varchar(36),
	`name` varchar(255) NOT NULL,
	`description` text,
	`model_url` varchar(500),
	`mtl_url` varchar(500),
	`texture_url` varchar(500),
	`preview_image_url` varchar(500),
	`format` varchar(20) NOT NULL DEFAULT 'OBJ',
	`file_size` int,
	`model_visibility` enum('PRIVATE','PUBLIC') NOT NULL DEFAULT 'PRIVATE',
	`published_at` timestamp,
	`view_count` int NOT NULL DEFAULT 0,
	`like_count` int NOT NULL DEFAULT 0,
	`favorite_count` int NOT NULL DEFAULT 0,
	`download_count` int NOT NULL DEFAULT 0,
	`slice_task_id` varchar(100),
	`print_status` enum('NOT_STARTED','SLICING','SLICE_COMPLETE','PRINTING','PRINT_COMPLETE','FAILED') DEFAULT 'NOT_STARTED',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()),
	`completed_at` timestamp,
	`failed_at` timestamp,
	`error_message` text,
	CONSTRAINT `models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `email_created_at_idx` ON `email_verification_codes` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `email_expires_at_idx` ON `email_verification_codes` (`email`,`expires_at`);--> statement-breakpoint
CREATE INDEX `request_id_idx` ON `generated_images` (`request_id`);--> statement-breakpoint
CREATE INDEX `image_status_idx` ON `generated_images` (`image_status`);--> statement-breakpoint
CREATE INDEX `external_user_id_created_at_idx` ON `generation_requests` (`external_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `status_phase_idx` ON `generation_requests` (`request_status`,`request_phase`);--> statement-breakpoint
CREATE INDEX `status_priority_created_at_idx` ON `image_generation_jobs` (`job_status`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `status_next_retry_at_idx` ON `image_generation_jobs` (`job_status`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `status_priority_created_at_idx` ON `model_generation_jobs` (`job_status`,`priority`,`created_at`);--> statement-breakpoint
CREATE INDEX `status_next_retry_at_idx` ON `model_generation_jobs` (`job_status`,`next_retry_at`);--> statement-breakpoint
CREATE INDEX `external_user_id_type_created_at_idx` ON `model_interactions` (`external_user_id`,`interaction_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `model_id_type_idx` ON `model_interactions` (`model_id`,`interaction_type`);--> statement-breakpoint
CREATE INDEX `external_user_id_created_at_idx` ON `models` (`external_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `source_idx` ON `models` (`model_source`);--> statement-breakpoint
CREATE INDEX `visibility_published_at_idx` ON `models` (`model_visibility`,`published_at`);--> statement-breakpoint
CREATE INDEX `visibility_like_count_idx` ON `models` (`model_visibility`,`like_count`);--> statement-breakpoint
CREATE INDEX `request_id_idx` ON `models` (`request_id`);--> statement-breakpoint
CREATE INDEX `source_image_id_idx` ON `models` (`source_image_id`);