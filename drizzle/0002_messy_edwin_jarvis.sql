CREATE TABLE `content_search_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`term` text NOT NULL,
	`weight` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_content_search_entity_term` ON `content_search_terms` (`entity_type`,`entity_id`,`term`);--> statement-breakpoint
CREATE INDEX `idx_content_search_term_weight` ON `content_search_terms` (`term`,`weight`);--> statement-breakpoint
CREATE TABLE `core_change_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_key` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`operation` text NOT NULL,
	`row_version` integer NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` integer NOT NULL,
	`published_at` integer,
	`last_error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_core_change_entity_version` ON `core_change_events` (`entity_type`,`entity_id`,`row_version`);--> statement-breakpoint
CREATE INDEX `idx_core_change_pending` ON `core_change_events` (`status`,`available_at`);--> statement-breakpoint
CREATE INDEX `idx_core_change_tenant` ON `core_change_events` (`tenant_key`,`created_at`);--> statement-breakpoint
CREATE TABLE `migration_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenant_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_key` text NOT NULL,
	`tenant_type` text NOT NULL,
	`organization_id` text,
	`user_id` text,
	`shard` integer NOT NULL,
	`read_mode` text DEFAULT 'core' NOT NULL,
	`mirror_writes` integer DEFAULT false NOT NULL,
	`assigned_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_tenant_routes_key` ON `tenant_routes` (`tenant_key`);--> statement-breakpoint
CREATE INDEX `idx_tenant_routes_shard_mode` ON `tenant_routes` (`shard`,`read_mode`);--> statement-breakpoint
CREATE INDEX `idx_tenant_routes_org` ON `tenant_routes` (`organization_id`);--> statement-breakpoint
CREATE INDEX `idx_tenant_routes_user` ON `tenant_routes` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `auth_version` integer DEFAULT 1 NOT NULL;