CREATE TABLE `idempotency_records` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`scope` text NOT NULL,
	`key_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`response_json` text,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_idempotency_actor_scope_key` ON `idempotency_records` (`actor_id`,`scope`,`key_hash`);--> statement-breakpoint
CREATE INDEX `idx_idempotency_expiry` ON `idempotency_records` (`expires_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`key_hash` text NOT NULL,
	`bucket_start` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_rate_limits_scope_key_bucket` ON `rate_limits` (`scope`,`key_hash`,`bucket_start`);--> statement-breakpoint
CREATE INDEX `idx_rate_limits_updated` ON `rate_limits` (`updated_at`);--> statement-breakpoint
ALTER TABLE `invoices` ADD `current` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `invoices` SET `current` = 0 WHERE `id` NOT IN (
	SELECT `id` FROM (
		SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `booking_id` ORDER BY `created_at` DESC, `id` DESC) AS `position`
		FROM `invoices`
	) WHERE `position` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invoices_booking_current` ON `invoices` (`booking_id`) WHERE "invoices"."current" = 1;--> statement-breakpoint
ALTER TABLE `leads` ADD `source_path` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `marketing_context_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `leads` ADD `consent_at` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `consent_version` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `converted_trip_request_id` text;--> statement-breakpoint
CREATE INDEX `idx_leads_converted_request` ON `leads` (`converted_trip_request_id`);--> statement-breakpoint
ALTER TABLE `notifications` ADD `dedupe_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_notifications_dedupe` ON `notifications` (`dedupe_key`);--> statement-breakpoint
ALTER TABLE `payments` ADD `idempotency_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_idempotency` ON `payments` (`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_invoice_reference` ON `payments` (`invoice_id`,`reference`);--> statement-breakpoint
ALTER TABLE `quotes` ADD `current` integer DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE `quotes` SET `current` = 0, `status` = CASE WHEN `status` = 'approved' THEN `status` ELSE 'superseded' END WHERE `id` NOT IN (
	SELECT `id` FROM (
		SELECT `id`, ROW_NUMBER() OVER (PARTITION BY `trip_request_id` ORDER BY CASE WHEN `status` = 'approved' THEN 0 ELSE 1 END, `created_at` DESC, `id` DESC) AS `position`
		FROM `quotes`
	) WHERE `position` = 1
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_quotes_request_current` ON `quotes` (`trip_request_id`) WHERE "quotes"."current" = 1;--> statement-breakpoint
ALTER TABLE `trip_requests` ADD `source_path` text;--> statement-breakpoint
ALTER TABLE `trip_requests` ADD `marketing_context_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `trip_requests` ADD `consent_at` integer;--> statement-breakpoint
ALTER TABLE `trip_requests` ADD `consent_version` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_bookings_request` ON `bookings` (`trip_request_id`);--> statement-breakpoint
PRAGMA optimize;
